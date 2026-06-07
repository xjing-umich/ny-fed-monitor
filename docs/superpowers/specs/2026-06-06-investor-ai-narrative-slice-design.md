# 投资者页 AI 叙述竖切 v1 · 设计

- 日期: 2026-06-06
- 状态: 已与用户确认（brainstorming），待写实现计划
- 适用: 冷启动楔子的第一刀竖切——超级投资者旗舰页的「AI 叙述层」
- 关联: `2026-06-06-cold-start-wedge-growth-design.md`（产品/增长策略）、`2026-06-06-data-layer-architecture-design.md`（数据层）、记忆 `product-direction`、`valuation-philosophy-constraint`

---

## 0. 定位与边界

冷启动楔子 = 超级投资者持仓页；赢老站的方式 = 中文优先 + **AI 叙述(GEO)** + 估值判决。本设计**只做其中的「AI 叙述层」**——把"他本季买了什么 + 为什么"写成人话，服务端渲染进页面，供 Google 收录与 ChatGPT/Perplexity 引用。

**明确不在 v1 范围**（各自靠后、独立推进）：估值判决徽章（估值数据尚不存在 + 价值观护栏）、分享卡、个股页叙述。

**与并行脊梁工作的关系：** 本层用 `managers / holdings` 数据（已有），**不依赖 ticker 证券脊梁**，可独立先做、不与脊梁/共识工作冲突。

---

## 1. 已确认决策（brainstorming 2026-06-06）

1. **v1 = 纯叙述层**：顶部判决条（仅讲本季调仓动作，不含估值/不含买卖）+ 本季动作 AI 叙述 + 来源/数据日期/新鲜度 + 诚实披露注脚 + 事实与 AI 视觉分层。
2. **批量预生成、缓存到库**：为各名家批量生成、写 `ai_analysis_cache`；访客页面直接读缓存，零实时 API 调用。生成**用受保护的 Next API 路由**（不用 tsx 脚本——见下「关键修正」），手动 curl 触发，以后接 GitHub Actions 按季。
3. **中英都生成**：zh + en 各生成一次，缓存键带 lang。
4. **服务端渲染（GEO 命脉）**：叙述必须 SSR 进 HTML，**不走客户端 fetch**——爬虫/AI 引擎多不执行 JS，客户端 fetch 的内容对 GEO 不可见。
5. **模型走 Vercel AI Gateway（DeepSeek）**：用 AI SDK 的 `provider/model` 字符串（`deepseek/*`，实现时用 `getAvailableModels()` 核准确 slug，存 env `NARRATIVE_MODEL`）。认证用静态 `AI_GATEWAY_API_KEY`（本地写 `.env.local`，生产在 Vercel env）。理由：一个 key 通多模型、零加价、自带可观测/故障转移、key 已在 Vercel 项目里。

### 关键修正（写计划时检查发现，2026-06-06）

- **生成不能用 tsx 脚本**：实测 `import "server-only"` 在 tsx 下报错；而取经理人数据的 `source.ts`/`supabase.ts` 都是 server-only。项目里 AI 生成的**既有正确范式 = Next API 路由**（`POST /api/refresh-ai-analysis` 调 server-only 的 `deepseek.ts`），跑在 Next 服务端运行时，server-only/`getManagerDetail`/`getDb` 全部可用。故本设计的生成改为 API 路由，与既有范式一致。
- **不直连 DeepSeek**：改走 AI Gateway（见决策 5），不再用 `DEEPSEEK_API_KEY` 直连 `api.deepseek.com`。

---

## 2. 架构与数据流

```
[生成] POST /api/refresh-investor-narratives?slug=<slug>&token=<secret>   (Next 路由, 服务端运行时)
   1. 校验 token(env NARRATIVE_REFRESH_TOKEN); 缺/错 → 401
   2. getManagerDetail(slug) → 现成 changes(本季动作 diff) + latest(holdings/period/filedAt)
   3. 每户 × {zh,en}: buildMovesPayload → AI SDK generateText(model=NARRATIVE_MODEL, 走 Gateway) → parseInvestorNarrative
   4. 写 ai_analysis_cache, page_key = `investor:<slug>:<period>:<lang>`, source_data_timestamp = filedAt
   说明: 每次只生成「一户×中英」, 远低于 300s 超时, 可逐户重试; 复用 server-only 的 getManagerDetail(路由在 Next 运行时, 无 tsx 限制)

[驱动] 本地/CI 用 curl 循环 config/managers.json 的 34 个 slug 逐个打上面的路由(无需 tsx, 无 server-only)

[投资者页] web/src/app/[lang]/investors/[slug]/page.tsx (Server Component)
   1. 服务端读 ai_analysis_cache(对应 slug/period/lang)
   2. 渲染「判决条 + 本季动作叙述」进 HTML(事实层与 AI 层视觉分离)
   3. 无缓存 / 无 Supabase env → 优雅降级: 只渲染事实(持仓表 + 动作数字), 叙述位留占位
```

**新增/改动模块（实现期细化）：**
- 新建 `web/src/lib/ai/investorNarrative.ts`（**纯逻辑, 无 server-only/无 ai/无 db**）：类型 + `buildMovesPayload` + `parseInvestorNarrative` + prompt 构造 + `narrativeKey`。配 vitest。
- 新建 `web/src/lib/ai/investorNarrativeServer.ts`（`server-only` + AI SDK + db）：`generateAndCacheNarrative`(调 Gateway 生成并写库) + `getInvestorNarrative`(react.cache 读缓存)。**不改**宏观 `deepseek.ts`。
- 新建 `web/src/app/api/refresh-investor-narratives/route.ts`：受 token 保护的 POST 生成路由。
- 新建 `web/src/components/entity/InvestorNarrative.tsx`：叙述层 Server Component。
- 改 `web/src/components/entity/EntityPage.tsx`：加可选 `aiNarrative?:ReactNode`（SSR 节点优先于客户端 `AINarrative`）。
- 改 `web/src/app/[lang]/investors/[slug]/page.tsx`：服务端读缓存 + 传 `aiNarrative`；`judgment_line` 作 meta description。
- 新增依赖 `ai`（AI SDK，走 Gateway）。复用现有 `ai_analysis_cache` 表，**无需改表**。
- 复用 `changes`（`getManagerDetail` 已算好本季动作 diff），**不再单建 moves 模块**。

---

## 3. Prompt 契约 + 诚实披露护栏

**输入（只喂事实，禁止编造）：**
- 经理人名 + 申报季（period）。
- 本季 vs 上季的持仓 diff：每只票的动作（建/加/减/清）、占比、占比变化。**仅真实 13F 数字。**

**输出 JSON（契约）：**
```json
{
  "judgment_line": "一句话总结本季调仓动作(不含估值、不含买卖建议); 同时作 meta description 与 GEO 摘录钩子",
  "moves": [
    { "ticker_or_issuer": "...", "action": "建仓|加仓|减仓|清仓",
      "why": "一句为什么/组合在讲什么故事——仅在有事实支撑处说话, 无依据的发挥不写" }
  ],
  "confidence": "low|medium|high",
  "limitations": ["..."]
}
```

**系统 prompt 护栏（不可妥协，见 `valuation-philosophy-constraint`）：**
- 禁买/卖/持有评级、禁目标价、禁技术/动量/情绪信号。
- 谨慎措辞（"可能""或反映""需结合其他信息"），承认是基于公开 13F 申报的事后推测、可能有误。
- 不编造缺失数字；语气走"路透电讯稿"，无 emoji、无"让我分析一下"类水词。
- judgment_line 只描述**动作**（加/减/清/建仓、占比变化、组合集中度），**不评估贵贱、不给跟不跟的建议**（估值层 v1 不存在）。

---

## 4. 页面渲染 + 事实/AI 视觉分层

- **事实层**（SEC 数字、持仓表、动作 delta）：正常渲染，**不挂 AI 注脚**——申报原文挂注脚反显得数据不可信。
- **AI 叙述层**（判决条 + moves 解读）：与事实层视觉分离（细线分隔 / 轻微衬底），紧跟一行小字注脚：
  > 本段由 AI 依据 SEC 13F 申报自动生成，可能存在错误，不构成投资建议。
- **页脚**：统一来源 `SEC EDGAR 13F` + 申报日(filedAt) + 快照日 + 免责声明。命中全局数据准确性规则（标来源 + 日期）。
- judgment_line 注入 `generateMetadata` 的 `<meta description>`。

---

## 5. 范围 / 验收标准

**范围：**
- 经理人：`config/managers.json` 中现有全部名家（并行 session 已扩到约 34 户）批量生成；**以伯克希尔为质量标杆**先调 prompt 到满意，其余自动产出。
- 中英都生成。

**验收：**
- `npm run build` 通过；纯逻辑（moves diff、prompt 构造可测部分）走 vitest。
- 投资者页 HTML（`curl` 不执行 JS）中**能看到** judgment_line 与动作叙述 → 证明 SSR、GEO 可见。
- 事实层无 AI 注脚；AI 层有注脚 + 页脚免责。
- 无 `AI_GATEWAY_API_KEY` / 无 Supabase env 时优雅降级（生成抛错由路由记录；读取返回 null；页面只渲染事实，不报错、不阻塞 build）。
- 生成的叙述**不含任何买卖/目标价/估值判断**（人工抽查伯克希尔页）。

**不含：** 估值徽章、分享卡、个股页叙述、GEO 结构化数据（FAQ schema 等留到下一刀）。

---

## 6. 协调说明（并行 session）

本层与并行 `phase1b-managers-consensus` 工作共用一个 git 工作树，存在并发 git 风险。实现期应为本层开**独立 git worktree** 隔离，避免分支/提交互踩。域名统一用 `thecompounder.fyi`（不可写回 `compounder.fyi`）；JSON-LD 优先用相对路径靠 `metadataBase` 解析。

---

## 7. 未决（不阻塞本设计，实现期再定）

1. 生成触发：先本地 `npm run start` + curl 驱动逐户跑；生产把 env 配进 Vercel、对生产 URL curl；季度更新后接 GitHub Actions。
2. 幂等粒度：同 period 已生成是否默认跳过、`--force` 重算。
3. period 取值口径：以各户 latest filing 的申报季为准（与 holdings 数据一致）。
