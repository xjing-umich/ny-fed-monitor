# Data Health Watchdog — 运营侧数据新鲜度看门狗 + 失败告警

- 日期: 2026-06-08
- 适用: 跨「13F + 宏观」两条数据管道的运营告警——数据该新却没新时，给运营者发一封邮件
- 前置: Phase 1A-1E 已并入 `db-foundation`（脊梁/共识/价格/1E 新鲜度）；13F 自动管道已加固（Mon+Thu + 成功率护栏）
- 关联记忆: 全局数据准确性硬规则（确认最新、标注来源+日期）；[[data-layer-state]]；[[contact-form-resend]]（Resend 已接、域名 `send.thecompounder.fyi` 已验证）

## 1. 目标与非目标

**目标**：当站点数据「该新却没新」时，第一时间用邮件通知运营者（只有你）。覆盖最危险的失败模式——**管道压根没跑/静默变陈**（如 13F cron 没触发、宏观 Vercel cron 停跑），这是"跑挂才告警"抓不到的。

**非目标（本期明确不做）**：
- 不做任何 UI / 公开"数据状态"页（纯运营告警，健康时静默）。
- 不建 13F 运行日志表（`pipeline_runs`）——本期"整体落后"判定用不上（YAGNI）。
- 不做"已恢复"通知、不做状态翻转去重表（v1 无状态，留 v2）。
- 不碰价格（已合规暂停、不展示，盯它只会误报）。
- 不改 macro 既有摄取/freshness 写入逻辑——只**读**它的产物。

## 2. 设计原则

1. **独立核查**：看门狗核**原始数据**（filings 的最新 period、market_* 的最新 observation/checked_at），不轻信管道自报状态——这样"管道没跑导致状态没更新"也能揪出。
2. **零新表**：全部从已有数据派生。
3. **复用而非重造**：13F 判定复用 1E `derive`；邮件复用现有 Resend 接入；鉴权复用 `ingestion/auth`。
4. **健康即静默**：无问题不发邮件、不打扰。
5. **看门狗的看门狗**：看门狗自身挂掉由 Vercel 内置 cron 失败通知兜底（运营手动开启一次）。

## 3. 架构

每日一个 Vercel cron，触发一个 in-app route，编排「核查 → 告警」：

```
Vercel Cron (每日 13:00 UTC) → GET /api/cron/health-watchdog  (鉴权: Bearer INGEST_SECRET)
   → runHealthChecks(db, today)  →  HealthProblem[]
   → 有问题: sendHealthAlert(problems)  (Resend 邮件)
   → 无问题: 静默
   → 返回 JSON 摘要 (手动 GET 亦可查当前健康)
```

| 文件 | 职责 | 依赖 |
|---|---|---|
| `web/src/lib/health/checks.ts` | `check13F()` + `checkMacro()` + `runHealthChecks()`，产出归一 `HealthProblem[]` | `@/lib/freshness/derive`（1E）、`@/lib/managers/db`、读 filings / market_* |
| `web/src/lib/health/alert.ts` | `sendHealthAlert(problems, ctx)` 格式化+Resend 发送；env 缺失降级（记日志、不崩、不抛） | `resend` |
| `web/src/app/api/cron/health-watchdog/route.ts` | 鉴权 → 核查 → 告警 → 返回摘要；支持 `?dryRun=1`/`?test=1` | 上两者 + `@/lib/ingestion/auth` |
| `web/src/lib/health/checks.check.ts` | tsx 自检（node:assert，纯判定逻辑），**不引 vitest** | `@/lib/health/checks` 的纯函数 |

### 类型（`checks.ts` 导出）
```ts
export type HealthProblem = {
  pipeline: "13f" | "macro";
  source: string;        // "13F 整体" 或宏观源名
  message: string;       // 人类可读：什么坏了
  asOf: string | null;   // 数据截至日期 (YYYY-MM-DD) 或 null
  expected: string;      // 期望（如 "应到 2026-03-31" / "expected_lag_days=2"）
};
export type HealthReport = {
  ok: boolean;           // problems.length === 0
  checkedAt: string;     // ISO
  problems: HealthProblem[];
  info: string[];        // 不触发告警的诊断信息（如 13F 覆盖率）
};
```

## 4. 13F 核查逻辑（"整体落后"）

- 查库内最新季度：`select period from filings order by period desc limit 1` → `latestPeriod`。
- `dueQuarter = mostRecentDueQuarter(today)`（复用 1E `derive.ts`，最近一个已过 45 天截止的季度末）。
- **触发条件**：
  - `latestPeriod` 为空 → problem「13F 库内无任何 filing」。
  - `parseUTC(latestPeriod) < dueQuarter` → problem「13F 整体落后：库内最新季度 {latestPeriod}，应已到 {dueQuarter}——管道可能漏了一整季」。
- **诊断附信息（不触发，进 `info`）**：统计「{N}/{total} 户已到 {dueQuarter}」作覆盖率参考。
  - 实现：`select period from filings`（或按 cik 取 max(period)），数有多少户 max(period) === dueQuarter。
- **Burry 不误报**：个体晚报只要有人进度到位，`latestPeriod` 即到位，不触发。

> 注：13F 复用 1E 已有的 `mostRecentDueQuarter` / `parseUTC`（后者本期需从 `derive.ts` 导出，见 §8）。

## 5. 宏观核查逻辑（两个独立信号）

读 `market_freshness_status`（每源 `latest_observation_date` / `freshness_status` / `checked_at`）+ `market_data_sources`（`name` / `expected_lag_days` / `is_manual` / `update_frequency`）。

两套信号分工明确：信号 1 **独立**核查（抓"管道没跑"，不信任何自报），信号 2 **采信管道自报的 `freshness_status`** 但**只在真失败时告警**（`failed`/`empty`），天然滞后的 `stale` 降级为参考信息。这样既独立抓住最危险的"没跑"，又不为周更源的天然滞后刷屏。

- **信号 1 · 管道停跑（独立）**：所有源的 `max(checked_at)` 距 `today` > **2 天** → problem「宏观管道可能停跑：freshness 状态 {n} 天未刷新」。这抓"Vercel cron 没触发"。
  - 若 `market_freshness_status` 为空（从未写过）→ problem「宏观 freshness 从未写入」。
- **信号 2 · 源真失败（采信自报）**：逐源、仅**非手动**源（`is_manual=false`），`freshness_status ∈ {failed, empty}` → problem「宏观源 {name} 状态 {freshness_status}（截至 {latest_observation_date}）」。`failed`=拉取报错（如 Market Share 返回非 JSON），`empty`=拉到零数据——都是真问题。
  - **`stale` 不触发告警**，改为进 `info` 作参考：列出滞后源（如「宏观滞后(参考): Repo Financing(2026-05-06)…」）。**理由**（来自真实库验证 2026-06-08）：NY Fed 的 Repo/Settlement Fails/Primary Dealer 等周更源**天然滞后**，管道自身按 `expected_lag_days` 把它们标 `stale` 属正常；若 `stale` 也告警，看门狗会天天为这些源刷屏 → 运营者很快无视告警（最坏结局）。
  - `partial` / `manual_required` / `unknown` **不触发**（partial 为部分成功容忍；后两者主要对应手动/未知源）。
- **手动源跳过**（`is_manual=true`，如 SME）——靠人工更新，不纳入自动告警，避免长期误报。

> 复用现有读取器：优先用 `@/lib/db/freshness.ts` 的 `getFreshnessStatus()`（返回含 source 关联的行：`freshness_status` / `latest_observation_date` / `checked_at` + 源的 `name` / `is_manual`）。若该读取器不带 `is_manual`，补一次 `market_data_sources` 读取合并（仍无新表、无新查询路径）。

## 6. 告警投递（Resend）

- **渠道**：邮件，复用现有 Resend（`new Resend(env.RESEND_API_KEY)` → `resend.emails.send({...})`，同 `api/contact/route.ts` 模式）。
- **from**：`Compounder Ops <ops@send.thecompounder.fyi>`（域名 `send.thecompounder.fyi` 已在 Resend 验证，见 [[contact-form-resend]]）。
- **to**：新环境变量 `RESEND_ALERTS_TO`（运营邮箱）。**缺失则降级**：记 `console.warn`、route 返回 `{ alerted:false, reason:"RESEND_ALERTS_TO 未配置" }`、**不抛错**（否则会污染 cron 成功率）。
- **主题**：`[Compounder] 数据健康告警 · {N} 项`，必要时点名最严重项，如 `… · 13F 落后 + 2 宏观源异常`。无问题不发。
- **正文（纯文本）**：每个 problem 一行 `[{pipeline}] {source}: {message}（截至 {asOf}，{expected}）`；附 `info` 段；末尾 `checkedAt` + 环境（`VERCEL_ENV` / "local"）+「本邮件由 health-watchdog 自动发出」。
- **env 门控**：`RESEND_API_KEY` 缺失同样降级不崩。

## 7. 防刷屏（v1 无状态）

- 看门狗每日跑一次，**问题持续期间每天提醒一封**。整体落后/管道停跑属罕见事件，坏了就该被持续提醒到修复；零状态、零新表。
- **不发"已恢复"通知**（静默=恢复）。"仅状态翻转才发 + 恢复确认"留 v2。

## 8. Cron / 鉴权 / 对 1E 的微改

- `web/vercel.json` 的 `crons` 增一条：
  ```json
  { "path": "/api/cron/health-watchdog", "schedule": "0 13 * * *" }
  ```
  **每日 13:00 UTC（21:00 HKT）**：晚于 13F（09:00 Mon/Thu）与宏观（10:00 工作日），当天两管道跑完再体检；每日跑（含周末）才能抓"该跑没跑"。
- **鉴权**复用 `isAuthorizedIngestRequest(request)`（Bearer `INGEST_SECRET`），与现有 `api/cron/market-ingest` 同套；生产无 secret → 401。
- **对 1E 的微改**：从 `web/src/lib/freshness/derive.ts` **导出** `parseUTC`（当前为模块内私有），供 `checks.ts` 比较日期复用，避免重复实现。`mostRecentDueQuarter` 已导出。不改 1E 任何行为。

## 9. 错误处理

- `check13F()` 与 `checkMacro()` 各自 try/catch——一个查询失败不掩盖另一个；失败本身作为一个 `HealthProblem`（pipeline 对应、message=「核查自身出错: {err}」）纳入告警，宁可吵也别瞎报健康。
- route 顶层：DB 不可达 / 未配 Supabase env → 返回 500（让 Vercel cron 失败通知兜底），不静默成功。
- **看门狗的看门狗**：运营在 Vercel 项目 Settings 为该 cron 开启失败通知（一次性手动，spec 附运维 checklist 提醒）。

## 10. 测试与验证门禁

- **纯逻辑自检** `web/src/lib/health/checks.check.ts`（node:assert + `npx tsx`，与 1E 一致，**不引 vitest**）：
  - 13F：`latestPeriod` 早于 dueQuarter → 触发；等于/晚于 → 不触发；空 → 触发。
  - 宏观：`freshness_status ∈ {failed,empty}` 的非手动源被列入 problems；`stale` 进 info 不告警；`is_manual` 源被跳过；`partial/manual_required/unknown` 不触发；`max(checked_at)` 超 2 天 → 触发停跑信号。
  - 为可测，核查的纯判定部分（给定输入行→problems）抽成不依赖 DB 的纯函数 `evaluate13F(latestPeriod, perManagerPeriods, today)` 与 `evaluateMacro(rows, today)`，DB 读取层只负责取数后喂给它们。
- **手动验收**：本地/preview 用 `GET /api/cron/health-watchdog?dryRun=1` 看 health JSON（不发邮件）；`?test=1` 发一封测试告警确认 Resend 通路。对线上库跑一次 dryRun 验真实判定（仿之前 13F 体检脚本）。
- **门禁**：`node_modules/typescript/bin/tsc --noEmit` + `npm run build`（用 node 20）。

## 11. 验收标准

- 库内 13F 整体落后（构造 latestPeriod < dueQuarter）→ 收到一封点明落后季度的邮件；正常（当季已到）→ 不发。
- 宏观某非手动源 failed / 超期，或 freshness 状态 >2 天未刷新 → 邮件列出；手动源不误报。
- `checks.check.ts` 纯逻辑自检通过；`tsc` + `build` 通过。
- 未新建任何 DB 表；未改 macro 摄取逻辑；1E 仅多导出 `parseUTC`（行为不变）。
- `RESEND_ALERTS_TO` / `RESEND_API_KEY` 缺失时降级不崩，route 返回明确原因。
- `web/vercel.json` 新增 watchdog cron；鉴权与现有 cron 一致。

## 12. 净增清单（自检：简洁）

- 新增 `lib/health/checks.ts`（核查 + 纯判定函数）+ `checks.check.ts`（自检）。
- 新增 `lib/health/alert.ts`（Resend 告警）。
- 新增 route `api/cron/health-watchdog`。
- 改 `web/vercel.json` 加 1 条 cron。
- 改 `lib/freshness/derive.ts` 导出 `parseUTC`（1 处可见性）。
- 新环境变量 `RESEND_ALERTS_TO`（运维配置，非代码）。

零新表、零 macro 摄取改动、复用 1E + Resend + 现有鉴权。

## 13. 运维 checklist（实现后人工一次性）

- [ ] Vercel 环境变量加 `RESEND_ALERTS_TO`（运营邮箱）。
- [ ] 确认 `INGEST_SECRET` 已在 Vercel（现有 macro cron 已用，应已存在）。
- [ ] Vercel 项目为 `health-watchdog` cron 开启**失败通知**（看门狗的看门狗）。
- [ ] 部署后 `?test=1` 验一封告警邮件能收到。
