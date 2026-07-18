# Compounder 代码库清理计划

> 依据：2026-07-18 全库架构审计 + 七路只读核查（证据含文件路径与行号）。
> 执行通则：改动 Next.js 代码前先读 `node_modules/next/dist/docs/` 相关指南（AGENTS.md 硬性要求）；每个阶段完成后跑 `npx tsc --noEmit` + `npm run check`（Phase 2 后可用）+ `npm run build` 验证。
> 变更记录：2026-07-18 DeepSeek AI 层已按选项 C 拆除（代码 / README / .env.example / `ai_analysis_cache` 表同步清理，drop 迁移 `supabase/migrations/20260718_drop_ai_analysis_cache.sql` 已就位），下文相关条目已更新。

---

## Phase 1 — P0 止血：安全与数据正确性（约 0.5–1 天）

### 1.1 10 个写操作路由补鉴权
任何人可 POST 触发外部抓取/写库，属最高优先级。

- `src/lib/ingestion/routes.ts`：`runIngestionRoute(source, ingest)` 增加 `request: Request` 首参，函数首行加：
  ```ts
  if (!isAuthorizedIngestRequest(request)) return unauthorizedResponse();
  ```
  9 个 `src/app/api/market/ingest/*/route.ts` 改 `POST(request: Request)` 并透传。
- `src/app/api/market/ingest/reference-rates/route.ts`（不走包装器的异类）：同样加鉴权两行。
- 风险：低。注意 `auth.ts:20` 的兜底——secrets 全未配置时非生产环境放行，Preview 部署忘配 secret 会全开，建议在 `.env.example` 中注明。

### 1.2 处置 debug-env
`src/app/api/market/debug-env/route.ts` 无鉴权，泄露 Supabase 主机名与部署环境。直接删除（诊断需求已由 health-watchdog 的 `?dryRun=1` 覆盖）。

### 1.3 修 build.ts market-share 活跃 bug（数据正确性）
`src/lib/build.ts:138-214` 用 `pd.marketshare["qtrly"]` 取数，而真实键是 `"quarterly"`（`marketShare.pure.ts:11-13` 注释记录了同一事故）→ 宏观看板季度 market-share 数据**当前静默为 0**。

- 动作：删除内联实现，改为复用 `marketShare.pure.ts` 的 `recordsFromPayload`/`buildMarketShareObservations`，并补 `sanitizeNyFedSentinels` 清洗。
- 风险：中——行为修正，修好后 market-share 数据会从 0 变有，属预期变化。
- 附带：`/api/data` 路由疑似无前端消费者（grep 仅自身），先确认；`buildAllSections` 仍被 `scripts/macro-ingest.ts`（宏观快照日更）使用，故 build.ts 无论如何都要修。

### 1.4 .env.example 补全
当前仅 5 项（DeepSeek 三项已随 AI 层拆除移除），代码实际用到 14 项。补 9 项并按六组分节注释：Supabase / Ingest 鉴权（INGEST_SECRET、CRON_SECRET）/ SEC（SEC_USER_AGENT）/ Resend 告警（RESEND_API_KEY、RESEND_ALERTS_TO、RESEND_ALERTS_FROM）/ Resend 订阅（RESEND_AUDIENCE_API_KEY 需 full-access、RESEND_AUDIENCE_ID）/ 联系表单（CONTACT_TO/FROM_EMAIL）。

### 1.5 重建 supabase/schema.sql 基线
新人按 `supabase/README.md` 粘贴 schema.sql 建库会缺 9 张表（sec_*、valuation_snapshot、market_rates、consensus_coownership、stock_splits），且 `former_names`/`reliable` 列未回填、RLS 语句完全缺失。

- 动作：从 15 个迁移全量重生成 schema.sql（含 RLS），或删除 schema.sql 并改 README 指向迁移目录。推荐前者。
- 顺手删除死表定义 `market_ai_analysis_runs`（全仓零引用）。

---

## Phase 2 — P0 质量门禁（约 0.5 天，可与 Phase 1 并行）

### 2.1 统一 check runner
43 个 `.check.ts` 全部为纯逻辑（无一依赖 .env/网络/DB），但目前无聚合入口、不进 CI。

- 新建 `scripts/run-checks.ts`：fs 递归找 `**/*.check.ts`，逐文件 spawn `npx tsx --tsconfig scripts/tsconfig.json`，汇总通过/失败并非零退出。
- 选 TS runner 而非 shell glob：与全仓 tsx 惯例一致、逐文件报告计时、兼容两种断言风格（check 靠 `process.exit` 退码，只能 spawn 不能 in-process import）。
- package.json 加 `"check": "tsx scripts/run-checks.ts"`。

### 2.2 新增 PR 级 CI
现有 6 个 workflow 全是数据摄取 cron，无任何 push/PR 门禁。在仓库根 `.github/workflows/` 新增：`npm run check && npx tsc --noEmit && npm run lint`。

---

## Phase 3 — P1 大扫除（约 1 天）

### 3.1 【已执行：选项 C 拆除，2026-07-18】AI 层三选一
现状：`InvestorNarrative.tsx` 零 JSX 引用、`getInvestorNarrative` 无调用方、三个实体页均不传 `aiNarrative` prop（investors 页注释表明系主动弃用）、`/api/ai-analysis` 静默忽略 `page` 参数、README §80-89 描述的 "Refresh AI Analysis" 按钮在代码中不存在。

| 选项 | 改动 | 取舍 |
|---|---|---|
| A 接线启用 | 3 个实体页传 prop + 修 `/api/ai-analysis` page 参数 + 配刷新 cron（~6 文件） | 基建已全（校验闸门/缓存），但与"每页必出、零幻觉"方向冲突 |
| B 继续休眠 | Phase 1.1 补鉴权后即可 | 成本风险已消除，死代码留存 |
| C 拆除 | 删 `InvestorNarrative/AINarrative.tsx`、`investorNarrative{,Server}.ts`、`deepseek.ts`、refresh 路由 ×2、`/api/ai-analysis`、EntityPage AI 槽位 | 彻底但不可逆 |

（上表保留作决策记录。）执行结果：已按选项 C 拆除——`src/lib/ai/`、`InvestorNarrative/AINarrative.tsx`、refresh 路由 ×2、`/api/ai-analysis`、EntityPage AI 槽位均已删除；README 的 AI 段落已同步删除，`ai_analysis_cache` 表由迁移 `20260718_drop_ai_analysis_cache.sql` drop。

### 3.2 死代码批量删除（低风险）
经 grep 零引用证实：
- `src/components/ui/`（7 文件脚手架）+ `components.json`
- 卸载依赖：`recharts`、`@base-ui/react`、`class-variance-authority`、`ai`
  - ⚠️ **保留** `shadcn` 包：`globals.css:3` 依赖其 `tailwind.css` 作设计 token 源
  - ⚠️ **保留** `tw-animate-css`、`ws`（16 处引用）、`geist`、`fast-xml-parser`（均为活依赖，初审误判）
- 孤儿文件：`src/components/common/TrackedLink.tsx`、`Paginated.tsx`、`src/lib/i18n.ts`（142 行死代码，非"双轨"）——先 `git log` 确认非在途特性再删
- `/api/data` 路由（确认后）
- 顺序：删文件 → 卸依赖 → `npm run check && npm run build` 验证

### 3.3 referenceRates 收敛
`src/lib/ingestion/referenceRates.ts` 重写为复用 `common.ts` 的 `persistIngestion`；`serializeError` 全仓共 2 份（referenceRates.ts:34、common.ts:32；原 deepseek.ts:27 已随 AI 层删除），统一为 common 版并同步改引用方。风险：中（partial/阈值语义需对齐）。

### 3.4 loadEnv 收敛
22 个脚本入口、≥4 种变体（仓库根 `../../.env.local` / web 下 `../.env.local` / cwd 相对 / `tsx --env-file`）。新建 `scripts/lib/env.ts` 单一实现（process.env 优先、回退仓库根 `.env.local`），批量改造。顺手修 `probe-klac-split.ts:25` 硬编码绝对路径（换机即坏）。

### 3.5 小修
- `Footer.tsx:19`：注释前提错误（RSC 里 `Date` 完全可用），改 `new Date().getFullYear()`。
- `fundamentals.yml:27`：硬编码个人邮箱兜底改为必需 secret。
- `config/managers.json` 与 DB 同步方向补注释；`retire-manager.ts` 同步删 JSON 条目。

### 3.6 数据保留策略
- 三张 `*_ingest_runs` 表加 prune（保留 12 个月；其中 `market_ingestion_runs` 只写不读，连 watchdog 都不消费，可考虑直接停写）。
- 挂 weekly workflow（仿 prices-cleanup.yml）。

### 3.7 调度双轨文档化
Vercel Cron 3 条 vs GitHub Actions 6 条存在重叠：13F 两侧均有入口（互补但命名混淆）、SEC 基本面周六/周日双跑（`sec_ingest_runs` 双倍记账）。在 README 或 docs 补一张调度分工表，并决定去重。

---

## Phase 4 — P2 打磨（视精力）

| 事项 | 说明 | 前置 |
|---|---|---|
| SectionChart 22 个 hex → `--chart-*` token | 色相体系与 token 不同（蓝紫 vs 墨绿），视觉会变化 | 需设计确认 |
| 6 处 `db: any` → `SupabaseClient` | scripts/lib 四个文件 | 无 |
| subscribe/contact 加限流 | 当前仅 honeypot | 无 |
| SectionChartClient 透传壳合并 | 7 行纯转发 | 无 |
| `.npmrc` legacy-peer-deps 复核 | 确认是否仍需 | 无 |

---

## 执行顺序建议

```
Phase 1（止血）          Phase 2（门禁）
   1.1 鉴权 ──┐          2.1 runner ──┐
   1.2 debug-env         2.2 PR CI    ├──► Phase 3（大扫除，AI 决策后）──► Phase 4
   1.3 market-share bug ─┘      ▲
   1.4 env / 1.5 schema        └── 死代码删除放在 runner 就位后，有 check 兜底
```

原唯一阻塞项（Phase 3.1 的 AI 层去留）已于 2026-07-18 拍板并执行选项 C（拆除），Phase 3 其余事项不再受阻塞。
