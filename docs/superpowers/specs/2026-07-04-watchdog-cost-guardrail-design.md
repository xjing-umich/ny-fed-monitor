# watchdog 成本/配额护栏设计

- 日期：2026-07-04
- 分支：`plan/watchdog-cost-guardrail`（off `db-foundation`）
- 纲领对齐：[[north-star-strategy]] §4 自运转骨架「唯一缺口=可观测性」/ Phase 2 韧性。B+C 命根：A+C 下"成本失控是唯一能真正搞垮它的东西"。
- 范围：给已有 health-watchdog 补齐"成本/配额"那半（数据健康那半已全）。

## 问题

现有 `health-watchdog`（Vercel cron 日跑，`web/src/lib/health/*` + `/api/cron/health-watchdog`）只查**数据健康**（13F/macro/prices 新鲜度），不查**成本/配额**。而 Supabase DB 体积 / egress 是复发过的超标线（[[supabase-usage-egress]]）——"作者消失两个月"期间若用量悄悄涨爆，站会降级/断，无人知。

## 关键发现（2026-07-04 联网核实，决定形状）

"三路都查"可行，但**各路正确机制不同**（不是硬写三个自定义轮询器）：

| 信号 | 干净 API？ | 结论 |
|---|---|---|
| Vercel 用量 | ❌ 无可靠公开 REST usage 端点 | 用**原生 Spend Management**（Pro 默认已开，50/75/100% 邮件+web）→ 配置，非代码 |
| Supabase egress | ❌ 无清晰 usage 端点 | 靠**原生账单告警**（仅超额粗报）+ 已有 ISR 日级 revalidate 缓解 + spend cap 兜底 → 配置，非代码 |
| Supabase DB 体积 | ✅ SQL `pg_database_size` 可查 | **唯一值得自建**：原生只在超额粗报（无早警），故在 watchdog 加 80% 早警 → 代码 |

出处：[Vercel Spend Management](https://vercel.com/docs/spend-management)、[Supabase Cost Control](https://supabase.com/docs/guides/platform/cost-control)、[Supabase DB Size](https://supabase.com/docs/guides/platform/database-size)。

## 目标 / 非目标

**目标**：
1. （代码）watchdog 加 Supabase DB 体积 80% 早警，走现成邮件告警。
2. （ops）一页运行手册：开 Vercel Spend Management 金额 + Supabase spend cap + 对齐账单/告警邮箱。

**非目标（YAGNI）**：
- 不自建 Vercel/egress 用量轮询器（无可靠 API、脆弱、与原生重复）。
- 不做成本可视化/仪表盘（平台自带）。
- 不改现有数据健康检查、不改 alert.ts / cron / route。
- 不上 PostHog（纲领已定）。

## 约束（硬）

- 复用现有 watchdog 范式：纯判定函数进 `checks.ts`（可 `.check.ts` 裸跑）+ 取数进 `gather.ts` + 现成 Resend 邮件（`alert.ts` 不动）。
- **优雅降级**：DB 体积取数失败 / RPC 未部署 → 记 **info**（非 problem，不误告警），绝不抛、绝不拖垮 watchdog（沿用现有 self-error 容错，但"能力缺失"降为 info 避免噪声）。
- 阈值具名常量 + env 可覆盖（换套餐不改码）。
- server-only 边界不破；service key 只读用途，绝不进日志/邮件正文。
- 无 UI；纯后端。

## 既有事实（已读代码）

- `gatherHealth(today)`（`gather.ts`）：`Promise.all([gather13F, gatherMacro, gatherPrices])`，各返回 `{problems, info}`、各自 try/catch 转 problem，汇成 `HealthReport{ok, checkedAt, problems, info}`。
- `checks.ts`：纯判定 `evaluate13F`/`evaluateMacro`（+ prices 在 gather 内联判定）；`HealthProblem.pipeline: "13f"|"macro"|"prices"`。有 `checks.check.ts` 裸跑自检。
- `alert.ts`：`sendHealthAlert(report)` 仅 `!report.ok` 时发；Resend（`RESEND_API_KEY` + `RESEND_ALERTS_TO`，发信域 `send.thecompounder.fyi` 已验证）；邮件按 `[${p.pipeline}] ${p.source}: ${p.message}` 格式化 → **新增 pipeline 值自动适配**。
- `/api/cron/health-watchdog/route.ts`：日跑 Vercel cron，支持 `?dryRun=1` / `?test=1`。
- `getDb()`（`managers/db.ts`）用 **service role key** → 可调 security-definer RPC。
- `prices-cleanup.yml` 周清 prices 控 DB 体积（本护栏是它失灵/增长跑赢时的早警，非替代）。

## 设计

### Part 1（代码）— DB 体积 80% 早警进 watchdog

**① Postgres RPC（migration）** `web/supabase/migrations/2026xxxx_db_size_rpc.sql`：
```sql
create or replace function public.db_size_bytes()
returns bigint language sql security definer set search_path = '' as $$
  select pg_database_size(current_database());
$$;
grant execute on function public.db_size_bytes() to service_role;
```

**② 纯判定** 进 `checks.ts`：
- 扩 `HealthProblem.pipeline` 加 `"cost"`。
- `evaluateDbSize(usedBytes: number | null, limitMb: number, warnFraction: number): { problems; info }`：
  - `usedBytes == null` → info「DB 体积: 取数不可用，跳过」（降级，不告警）。
  - `used/limit >= warnFraction` → problem（pipeline "cost"，message 含已用 MB / 限额 / 百分比）。
  - 否则 → info「DB 体积 X MB / Y MB (Z%)」。

**③ 取数** 进 `gather.ts`：`gatherCost(today)`：
- `getDb().rpc("db_size_bytes")` → bytes；error / 无 RPC（如未部署迁移）→ `usedBytes = null`（降级）。
- 读 env `SUPABASE_DB_LIMIT_MB`（默认 500=免费层；Pro 8GB 则设 8192）、`DB_WARN_FRACTION`（默认 0.8）。
- 调 `evaluateDbSize`，try/catch 包裹（自身出错 → info 而非 problem）。
- 加进 `gatherHealth` 的 `Promise.all`。

**④ 自检** `checks.check.ts` 加 `evaluateDbSize` 断言：null 降级、80% 边界（未到/正好/超）、message 含百分比。

### Part 2（ops runbook）— 原生平台告警

新增 `docs/runbooks/cost-guardrails.md`（或并入部署文档），一页清单：
1. **Vercel**：Dashboard → 团队 → Settings → Spend Management → 设 spend 金额（如 $20/月，对齐纲领"营收覆盖成本"靶）→ 确认邮件通知收件人。Pro 默认已开，确认阈值即可。
2. **Supabase**：Org → Billing → 确认 Spend Cap 开启（Pro 默认开）；确认账单邮箱是常看的地址。
3. **对齐邮箱**：Vercel spend 通知 + Supabase 账单告警 + watchdog `RESEND_ALERTS_TO` 指向同一常看邮箱。

## 错误处理 / 降级

- RPC 未部署 / 出错 / env 缺 → `usedBytes = null` → info「跳过」，watchdog 其余照常、report 不因此变 `!ok`。
- 迁移部署后自动生效（无需改码）。
- Part 2 是人工一次性配置，不影响代码路径。

## 测试 / 验证

- `cd web && npx tsx src/lib/health/checks.check.ts` → 含新 `evaluateDbSize` 断言，passed。
- `cd web && npx tsc --noEmit` → exit 0。
- 部署后 `GET /api/cron/health-watchdog?dryRun=1` → JSON 含 DB 体积 info 行（或超阈时的 cost problem）。
- `?test=1` 通路已存在（不动）。

## 分解为执行块（建议）

1. **块 A — 纯判定 + 自检**：`checks.ts` 加 `evaluateDbSize` + pipeline `"cost"` + `checks.check.ts` 断言（裸跑）。
2. **块 B — RPC 迁移 + 取数接线**：migration `db_size_bytes` + `gatherCost` 并进 `gatherHealth`。
3. **块 C — ops runbook**：`docs/runbooks/cost-guardrails.md`（纯文档，用户照做配置）。

A→B 有依赖（B 用 A 的函数）；C 独立。
