# Phase 0 产品骨架重做 设计

- 日期: 2026-06-06
- 状态: 已与用户逐项确认，待用户复核 → 写实现计划
- 对标: ValueSider（13F 持仓追踪）+ AlphaSpread（个股内在价值估值）+ Dataroma/GuruFocus（参考）
- 背景: 现有 Next.js 16 应用已上线，含成熟的"纽约联储/货币市场监控"、起步的"6 位经理人 13F（打包 JSON）"、已接入的 DeepSeek AI 解读。用户判断当前产品"导航烂、三大板块都不够好、像实验品而非产品"，要求**先重做产品骨架，再灌数据**。

---

## 1. 产品定位（本轮 brainstorming 确认）

把产品从"内部监控台"转为"面向公开访客的财务信息内容站"，做一个**无人凑齐的三合一组合**：

> **「谁在买」(超级投资者 13F · 主线) × 「值不值」(个股估值 · 先轻后重，逐步逼近 AlphaSpread) × 「大环境」(宏观/流动性 · 差异化)**，全部用 AI 串成人话。

**已确认的关键决策：**
- **分享形态**: 单向发布 + 可分享链接/卡片快照；**不做社区/UGC**（风险高）。
- **商业/规模**: 先全免费、不做账号，专注 SEO/GEO + 流量，接入用户行为打点观测；变现后置（架构预留付费层接口）。
- **市场**: 中英双市场（zh/en）都要做。
- **SaaS**: 优先免费额度，尽量用便宜的国内服务。
- **视觉调性**: **干净亲和风**（亮色为主、多留白、图表友好），深色/终端模式作为可选。目标人群是 SEO/GEO 拉来的大量"不很懂"的新访客。
- **秘密武器**: 本仓 Claude 环境内置整套价值投资估值 Skill（`analyze-stock`/`buffett-valuation`/`greenwald-valuation`/`anthropic-dcf-model`/`sotp-valuation`/`moat-assessment`/`financial-quality-check`），AlphaSpread 只做机械 DCF，我们能叠加巴菲特/格林沃尔德/护城河 + AI 叙述。

### 竞品缺口（差异化依据）
| 产品 | 谁在买(13F) | 值不值(估值) | 大环境(宏观) | 备注 |
|------|:----:|:----:|:----:|------|
| ValueSider | ✅ | ❌ | ❌ | 免费、纯 13F |
| AlphaSpread | ❌ | ✅ | ❌ | 内在价值/DCF，$12–20/月 |
| GuruFocus | ✅ | ✅ | 部分 | 贵($424+/年)、杂、纯英文 |
| **本产品** | ✅ | ✅(渐进) | ✅ | 三合一 + AI 人话 + 双语 |

来源: alphaspread.com、valuesider.com、gurufocus.com、dataroma.com、whalewisdom.com（2026-06 检索）。

---

## 2. 路线图总览（本 spec 仅覆盖 Phase 0）

```
Phase 0  产品骨架  ← 本 spec
         IA重做(顶导+移动端+搜索) · 统一设计系统 · 实体页模板 · 真落地页 · 干净亲和风
         约束：不加数据源、不扩经理人、不做估值引擎；个股页仅用持仓可算出的数据

Phase 1  数据地基 + 日更股价（另立 spec）
         执行已有 phaseA-supabase-foundation 计划 · 经理人 6→30~50 · 多季历史回填
         · prices 价格层(Finnhub 主/AkShare 兜底, 适配器) · 自申报浮盈浮亏

Phase 2  分析层 + 基本面（另立 spec）
         环比加减仓/信念度 · 跨经理人共识 · 多季趋势 · 基本面数据层(利润表/资产负债表/现金流)

Phase 3  估值引擎 + SEO/GEO + 打点 + 分享卡（另立 spec）
         个股估值(DCF+相对估值, 配合估值 Skill+DeepSeek, 逼近 AlphaSpread)
         · sitemap/hreflang/JSON-LD/OG · 微软 Clarity + 百度统计/Vercel Analytics 打点
```

每个 Phase 结束都能独立上线、可被收录。

---

## 3. Phase 0 详细设计

### 3.1 信息架构 / 路由（从"数据源树"→"按访客意图"）

顶部导航（桌面）+ 汉堡抽屉（移动）。**一级入口只有 3 个 + 全局搜索**：

```
[Logo]   首页   超级投资者   宏观/流动性   🔍搜索      [zh/en]  [☀/🌙]
```

| 入口 | 路由 | Phase 0 内容 |
|------|------|------|
| 首页 | `/[lang]` | 真落地页（重写，见 3.4） |
| 超级投资者 | `/[lang]/investors`<br>`/[lang]/investors/[slug]` | 列表（搜索/排序/筛选，**不再平铺死名单**）+ 经理人实体页 |
| 个股详情 | `/[lang]/stocks/[ticker]` | **不进一级导航**；仅从经理人持仓里点股票进入。Phase 0 为模板骨架 + 持仓视角数据（谁持有/权重/自申报浮盈占位） |
| 宏观/流动性 | `/[lang]/macro`<br>`/[lang]/macro/[indicator]` | 把原 Fed/美债重新归并为人话分组的概览 + 指标页 |

**路由决策：**
- **URL 用 slug/ticker**：`/investors/warren-buffett-berkshire`、`/stocks/AAPL`（对 SEO/GEO 友好）。
- **旧路由 301 重定向**：`/[lang]/managers/[cik]` → `/[lang]/investors/[slug]`；`/[lang]/managers` → `/[lang]/investors`；旧的 `/[lang]/[section]`（Fed 各 section）→ `/[lang]/macro/[indicator]`。
- **命名换人话**：「机构持仓/13F」→「超级投资者」；「美债/Treasury」→「宏观/流动性」。
- Phase 0 个股页虽不进导航，但路由结构一次到位，Phase 1/2 数据到位后无需改 IA。

**宏观/流动性的人话归并**（原 5 子组 → 访客能懂的分组，每个指标页配一句白话）：
- 现状子组：市场结构(dealer-inventory/transactions/market-share)、资金市场(repo-financing/reference-rates/facility-usage/fails)、供给与资产负债表(auction-risk/soma)、政策(policy-expectations)、系统(data-freshness)。
- Phase 0 归并为概览页 `/macro` + 各指标页 `/macro/[indicator]`，按"资金面 / 供给面 / 政策面"3 组呈现，每项加一行白话解释。具体文案在实现期定。

### 3.2 统一设计系统

**收敛到一套**：`shadcn/ui + Tailwind v4`。
- 把现有 `--tt-*` 终端调色板**重映射**为 shadcn 主题 token；新增**亮色为默认主题**（干净亲和），深色/终端作为可选主题。
- 重写以下文件里的手写 inline style 为组件 + Tailwind：`components/dashboard/Sidebar.tsx`、`Header.tsx`、`app/[lang]/page.tsx`、`app/[lang]/managers/page.tsx`、`app/[lang]/managers/[cik]/page.tsx`、`app/[lang]/[section]/page.tsx`。
- `AIMarketCommentary.tsx` 已用 shadcn，作为参考基准。
- **目标**：根除"inline-style 终端风 / shadcn 两套设计语言并存"。

### 3.3 实体页统一模板（SEO/GEO 最小收录单元）

经理人 / 个股 / 宏观指标三类实体页共用一个布局组件，槽位：
```
① 标题区   名称 + 一句白话"这是什么" + 一个结论 chip（如 低估/资金偏紧/加仓）
② 关键事实条  3–5 个头条数字（等宽数字）
③ AI 叙述位  嵌入式 DeepSeek 解读（自动缓存，不再是全站底部的手动刷新按钮）
④ 数据主体   该实体专属表/图
⑤ 来源与时效  as of + 数据来源 + 日期（落实数据准确性规则：标来源/标日期）
⑥ 相关实体   交叉链接（内链，利于 SEO/GEO）
```
- Phase 0 只搭**槽位与组件**；真正的 `generateMetadata`(title/description/OG) 与 JSON-LD 结构化数据在 Phase 3 填（Phase 0 留出接口，不实现）。
- AI 叙述位 Phase 0 复用现有 `/api/ai-analysis` 缓存机制，按实体 `page_key` 取；无缓存时显示"暂无解读"占位，不阻塞页面。

### 3.4 首页（真落地页，取代操作员仪表盘）

替换现有"总览=信号墙"为面向新访客的落地页：
1. 英雄区：点题"谁在买 × 值不值 × 大环境"一句话价值主张。
2. 三大支柱入口卡：超级投资者 / 个股估值 / 宏观流动性。
3. "本周热点" teaser：最多人买卖 / 异动（Phase 0 用现有数据能算的简版；数据不足则降级为静态精选）。
4. 一个样例经理人 + 一个样例宏观信号（带白话）。
5. 底部信任区：数据来源(NY Fed / Treasury.gov / SEC EDGAR) + "不提供交易建议"。
- 保留一条紧凑"市场信号"条，但用新手能懂的白话标注，而非"极端/Extreme"裸标签。

### 3.5 移动端优先外壳

- 干掉 `layout.tsx` 里 `position:fixed; width:240` 固定侧栏 + `marginLeft:240`。
- 改为：桌面顶部导航条；移动端汉堡 → 抽屉(sheet)。
- "域内导航"（经理人列表、宏观指标列表）不再常驻左栏，下沉到各板块页 / 抽屉内。
- 内容容器统一 `max-width` 居中，响应式断点覆盖手机/平板/桌面。

---

## 4. 组件分解 / 数据流

- **AppShell**（服务端 layout + 客户端导航）：顶导 + 移动抽屉 + 语言/主题切换。替换现 `Sidebar` + `Header` 的固定栏布局。
- **EntityPage**（模板组件）：接收 `{ title, subtitle, verdictChip, keyFacts[], aiPageKey, body, sources, related[] }`，渲染 3.3 的 6 槽位。
- **InvestorList / InvestorDetail**：复用 `lib/managers/source.ts`（现有 env→Supabase 否则 JSON 双路），新增 slug↔cik 映射。
- **MacroOverview / MacroIndicator**：复用 `lib/build.ts` / `buildAllSections`，按新分组渲染。
- **StockDetail**：Phase 0 由"遍历现有经理人持仓 → 聚合出某 ticker 被谁持有"派生；无 ticker 富化时以持仓里已有标识兜底，缺失则显示占位。
- **AINarrative**：包装 `/api/ai-analysis`，按 `page_key` 拉缓存。
- 数据来源保持只读复用；**Phase 0 不新增 ingestion、不写库结构**。

---

## 5. 错误处理 / 边界

- AI 叙述缺失 → 占位"暂无解读"，页面正常渲染。
- 个股数据薄 → 显示"持仓视角"可得部分 + 明确"估值数据即将上线"占位，不报错。
- slug/ticker 未命中 → `notFound()`。
- 旧 URL → 301 重定向，避免死链伤 SEO。
- 数据时效：每个实体页底部强制显示 as of + 来源 + 日期（用户全局规则）。

---

## 6. 验收与测试

- **主验收**：`npm run build` 通过（用户既定标准）。
- **测试精简**：仅对纯逻辑写少量 vitest——slug↔cik 映射、路由归并、宏观分组映射、旧→新 URL 重定向规则。不对 UI 大写测试。
- **人工验收**：桌面 + 移动两种视口各板块走查一遍；亮/暗主题切换正常。
- **不在 Phase 0 验收范围**：真实数据库、新经理人、日更股价、估值数字、完整 SEO 元数据。

---

## 7. 实现注意事项

- ⚠️ **`web/AGENTS.md` 警告：本版 Next.js 经过改造**，API/约定/文件结构可能与训练数据不同。写任何代码前先读 `node_modules/next/dist/docs/` 中相关指南，遵守弃用提示。
- Node 20；npm 前置 `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`。
- 当前分支 `db-foundation`；本阶段提交按用户节奏，不主动 push。
- 设计系统重做务必**一次性收敛**，避免再次出现两套并存。

---

## 8. 后续阶段（占位，各自另立 spec）

- Phase 1：数据地基 + 日更股价（含已写好的 `2026-05-30-phaseA-supabase-foundation.md` 计划）。
- Phase 2：分析层 + 基本面数据。
- Phase 3：估值引擎（逼近 AlphaSpread）+ SEO/GEO + 打点 + 分享卡。
