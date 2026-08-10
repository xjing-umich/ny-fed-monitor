# watchdog 成本/配额护栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给已有的 health-watchdog 补齐"成本/配额"那半——加 Supabase DB 体积 80% 早警（代码），并出一页平台原生告警运行手册（配置），守住"作者消失两个月站还自跑"的韧性底线。

**Architecture:** 复用现有 watchdog 范式——纯判定函数 `evaluateDbSize` 进 `checks.ts`（配 `.check.ts` 裸跑）+ 取数 `gatherCost` 进 `gather.ts` 并入 `gatherHealth` 的 `Promise.all` + 现成 Resend 邮件（`alert.ts` 不动，格式串 `[${pipeline}]…` 自动适配新 pipeline 值）。DB 体积经 security-definer RPC `db_size_bytes()` 取。降级：RPC 未部署/取数失败 → 记 info（非 problem，不误告警、不拖垮 watchdog）。

**Tech Stack:** TypeScript 纯函数 + `node:assert` 裸跑 `.check.ts`、Postgres security-definer 函数（migration）、Supabase service-role RPC、Resend（既有）。

## Global Constraints

- 分支：`plan/watchdog-cost-guardrail`，已 rebase 到最新 `db-foundation`。**用已建好的 worktree** `.claude/worktrees/watchdog`；**禁**碰无关在途文件。
- **对齐现况（spec 2026-07-04 后 db-foundation 已变）**：`gatherHealth` 现为 `Promise.all([gather13F, gatherPrices])`（**gatherMacro 已随 macro 退役删除**）——本计划加 `gatherCost` 成三元组。`HealthProblem` 真实形状 = `{ pipeline: "13f"|"prices"; source; message; asOf: string|null; expected }`（比 spec 草图多 `source`/`asOf`/`expected`，cost problem 必须填全）。
- **降级即 info 非 problem**：gatherCost 的 catch 分支返回 `info`（与 gatherPrices 把自错转 problem **故意不同**）——能力缺失/RPC 未部署不该误报警，`report.ok` 不因此变 false。
- 阈值具名常量 + env 可覆盖：`SUPABASE_DB_LIMIT_MB`（默认 500=免费层；Pro 8GB 设 8192）、`DB_WARN_FRACTION`（默认 0.8）。
- server-only 边界不破；service key 只读用途，绝不进日志/邮件正文。无 UI，纯后端。
- 不改现有数据健康检查、不动 `alert.ts` / cron `route.ts` / `?test=1` 通路。不自建 Vercel/egress 轮询器（无可靠 API，见 spec）。
- 验证：`cd web && npx tsx src/lib/health/checks.check.ts`（含新断言，全过）+ `npx tsc --noEmit`（零错）。**禁 `next build`**（本机 google fonts 被墙）。migration/RPC 与 gather 取数无法本地单测（无 Supabase 凭据），靠 Task 1 纯函数测试 + tsc + 部署后 `?dryRun=1` 抽查。

## File Structure

- 改 `web/src/lib/health/checks.ts` — `HealthProblem.pipeline` 加 `"cost"` + 新纯函数 `evaluateDbSize`。
- 改 `web/src/lib/health/checks.check.ts` — `evaluateDbSize` 断言。
- 新建 `web/supabase/migrations/20260725_db_size_rpc.sql` — security-definer `db_size_bytes()`。
- 改 `web/src/lib/health/gather.ts` — `gatherCost` + 并入 `gatherHealth`。
- 新建 `docs/runbooks/cost-guardrails.md` — 平台原生告警一页手册。

---

### Task 1: 纯判定 `evaluateDbSize` + pipeline "cost"（TDD）

**Files:**
- Modify: `web/src/lib/health/checks.ts`
- Test: `web/src/lib/health/checks.check.ts`

**Interfaces:**
- Produces:
  ```ts
  // checks.ts —— HealthProblem.pipeline 增加 "cost"
  export function evaluateDbSize(
    usedBytes: number | null,
    limitMb: number,
    warnFraction: number,
  ): { problems: HealthProblem[]; info: string[] };
  ```
- Consumes: 既有 `HealthProblem` 类型。

- [ ] **Step 1: 加 pipeline 值 + 写失败测试**

先把 `checks.ts` 的 `HealthProblem.pipeline` 从 `"13f" | "prices"` 改为 `"13f" | "prices" | "cost"`（仅加类型联合成员，别的不动）。

在 `web/src/lib/health/checks.check.ts` 末尾（现有 `evaluate13F` 断言之后）追加：
```ts
import { evaluate13F, evaluateDbSize } from "./checks";
// ↑ 若文件顶部已 import evaluate13F,改成合并这一行；勿重复 import。

// --- evaluateDbSize ---
// null(取数不可用) → 0 问题, info 含"跳过"
{
  const r = evaluateDbSize(null, 500, 0.8);
  assert.equal(r.problems.length, 0, "null 应 0 问题(降级)");
  assert.match(r.info[0], /跳过/);
}
// 60% (300MB/500) < 80% → 0 问题, info 含百分比
{
  const r = evaluateDbSize(300 * 1_048_576, 500, 0.8);
  assert.equal(r.problems.length, 0, "60% 应 0 问题");
  assert.match(r.info[0], /60%/);
}
// 正好 80% (400MB/500) ≥ 阈值 → 1 问题, pipeline "cost", message 含百分比
{
  const r = evaluateDbSize(400 * 1_048_576, 500, 0.8);
  assert.equal(r.problems.length, 1, "80% 边界应 1 问题");
  assert.equal(r.problems[0].pipeline, "cost");
  assert.match(r.problems[0].message, /80%/);
}
// 90% (450MB/500) 超阈 → 1 问题
{
  const r = evaluateDbSize(450 * 1_048_576, 500, 0.8);
  assert.equal(r.problems.length, 1, "90% 应 1 问题");
  assert.match(r.problems[0].message, /90%/);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run（`web/` 下）：`npx tsx src/lib/health/checks.check.ts`
Expected: 失败（`evaluateDbSize` 未定义 / 未导出）。

- [ ] **Step 3: 写实现**

在 `web/src/lib/health/checks.ts` 末尾追加（贴合现有 evaluate 函数返回 `{problems, info}` 范式）：
```ts
/**
 * Supabase DB 体积早警(纯判定)。usedBytes=null → 降级 info(取数不可用,不告警)。
 * 达到/超过 limitMb×warnFraction → cost problem;否则 info 报当前占用。
 * 平台原生告警只在超额粗报,此处提供 80% 早警窗口。
 */
export function evaluateDbSize(
  usedBytes: number | null,
  limitMb: number,
  warnFraction: number,
): { problems: HealthProblem[]; info: string[] } {
  if (usedBytes == null) {
    return { problems: [], info: ["DB 体积: 取数不可用，跳过"] };
  }
  const usedMb = usedBytes / 1_048_576;
  const pct = usedMb / limitMb;
  const pctStr = `${Math.round(pct * 100)}%`;
  if (pct >= warnFraction) {
    return {
      problems: [{
        pipeline: "cost",
        source: "Supabase DB 体积",
        message: `已用 ${Math.round(usedMb)} MB / ${limitMb} MB (${pctStr})`,
        asOf: null,
        expected: `应 < ${Math.round(warnFraction * 100)}%`,
      }],
      info: [],
    };
  }
  return { problems: [], info: [`DB 体积 ${Math.round(usedMb)} MB / ${limitMb} MB (${pctStr})`] };
}
```

- [ ] **Step 4: 运行测试确认通过 + 类型门**

Run（`web/` 下）：`npx tsx src/lib/health/checks.check.ts` → 全过（含既有 evaluate13F 断言）。
Run：`npx tsc --noEmit` → 零错误。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/health/checks.ts web/src/lib/health/checks.check.ts
git commit -m "feat(watchdog): DB体积早警纯判定evaluateDbSize+pipeline cost(80%阈值,null降级)"
```

---

### Task 2: RPC 迁移 + `gatherCost` 取数接线

**Files:**
- Create: `web/supabase/migrations/20260725_db_size_rpc.sql`
- Modify: `web/src/lib/health/gather.ts`

**Interfaces:**
- Consumes: `evaluateDbSize`（Task 1）、既有 `getDb()`（`@/lib/managers/db`，service role）、既有 `gatherHealth` 组装。

- [ ] **Step 1: RPC 迁移**

新建 `web/supabase/migrations/20260725_db_size_rpc.sql`：
```sql
-- watchdog 成本护栏:只读库体积,security definer 供 service_role 调用。
create or replace function public.db_size_bytes()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select pg_database_size(current_database());
$$;

grant execute on function public.db_size_bytes() to service_role;
```

- [ ] **Step 2: `gatherCost` + 并入 `gatherHealth`**

在 `web/src/lib/health/gather.ts`：
① 顶部 import 补 `evaluateDbSize`（与现有 `evaluate13F` 等同源 `./checks`，合并 import 别重复）。
② 加常量（文件顶部，import 之后）：
```ts
const DB_LIMIT_MB = Number(process.env.SUPABASE_DB_LIMIT_MB ?? 500);
const DB_WARN_FRACTION = Number(process.env.DB_WARN_FRACTION ?? 0.8);
```
③ 加 `gatherCost`（放在 `gatherPrices` 之后、`gatherHealth` 之前）：
```ts
// 成本护栏:DB 体积早警。降级口径与数据健康检查故意不同——取数失败/RPC 未部署 → info(非 problem),
// 能力缺失不该误报警、不该把 report.ok 拉成 false。
async function gatherCost(_today: Date): Promise<{ problems: HealthProblem[]; info: string[] }> {
  try {
    const { data, error } = await getDb().rpc("db_size_bytes");
    if (error) throw error;
    const usedBytes = data == null ? null : Number(data);
    return evaluateDbSize(Number.isFinite(usedBytes) ? usedBytes : null, DB_LIMIT_MB, DB_WARN_FRACTION);
  } catch (e) {
    return { problems: [], info: [`DB 体积: 取数不可用，跳过 (${e instanceof Error ? e.message : String(e)})`] };
  }
}
```
④ 把 `gatherHealth` 的 `Promise.all` 从两元改三元：
```ts
export async function gatherHealth(today: Date): Promise<HealthReport> {
  const [r13, rPrices, rCost] = await Promise.all([gather13F(today), gatherPrices(today), gatherCost(today)]);
  const problems = [...r13.problems, ...rPrices.problems, ...rCost.problems];
  const info = [...r13.info, ...rPrices.info, ...rCost.info];
  return { ok: problems.length === 0, checkedAt: today.toISOString(), problems, info };
}
```

- [ ] **Step 3: 类型门**

Run（`web/` 下）：`npx tsc --noEmit` → 零错误。
（`gatherCost` 走 DB，无本地单测；降级/阈值逻辑已由 Task 1 纯函数测试覆盖，此处仅接线 + tsc。）

- [ ] **Step 4: Commit**

```bash
git add web/supabase/migrations/20260725_db_size_rpc.sql web/src/lib/health/gather.ts
git commit -m "feat(watchdog): db_size_bytes RPC迁移+gatherCost并入gatherHealth(降级即info)"
```

---

### Task 3: ops 运行手册（平台原生告警）

**Files:**
- Create: `docs/runbooks/cost-guardrails.md`

**Interfaces:** 无代码；纯文档，供用户一次性照做配置。

- [ ] **Step 1: 写运行手册**

新建 `docs/runbooks/cost-guardrails.md`：
```markdown
# 成本护栏运行手册

站点自动运转，成本悄涨是唯一能无声搞垮它的东西。三路防线：两路平台原生告警（一次性配置）+ 一路 watchdog 早警（已随代码上线）。

## 1. Vercel — Spend Management（配置）

Dashboard → 选团队 → Settings → Spend Management：
- 设一个月度金额上限（建议对齐"营收覆盖成本"靶，如 $20/月）。
- 确认通知邮箱是你常看的地址。
- Pro 默认已开 50/75/100% 邮件+web 告警，确认阈值即可。

## 2. Supabase — Spend Cap + 账单邮箱（配置）

Org → Billing：
- 确认 **Spend Cap** 开启（Pro 默认开；开着=超额即停增用量，不产生意外账单）。
- 确认账单/告警邮箱是常看地址。

## 3. Supabase DB 体积 — watchdog 80% 早警（已上线，需部署迁移）

- 迁移 `20260725_db_size_rpc.sql` 部署后自动生效（`db_size_bytes()` RPC）。
- watchdog 日跑时，DB 体积达 `SUPABASE_DB_LIMIT_MB × DB_WARN_FRACTION`（默认 500MB × 0.8 = 400MB）→ 发 Resend 邮件早警。
- 换套餐只改 env（免费 500 / Pro 8192），不改码。
- 与周清 prices（`prices-cleanup.yml`）互补：清理失灵或增长跑赢时，这条早警兜底。

## 4. 邮箱对齐

Vercel spend 通知 + Supabase 账单告警 + watchdog `RESEND_ALERTS_TO` → 指向**同一个常看邮箱**，否则告警发了没人看等于没有。

## 验证

- 部署迁移后：`GET /api/cron/health-watchdog?dryRun=1` → 返回 JSON 的 `info` 应含一行「DB 体积 X MB / Y MB (Z%)」（或超阈时 `problems` 里的 cost 条目）。
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/cost-guardrails.md
git commit -m "docs(watchdog): 成本护栏运行手册(Vercel Spend/Supabase Cap/DB体积早警/邮箱对齐)"
```

---

## 验收（部署后）

1. Task 1 `checks.check.ts` 全过（含 evaluateDbSize null/60%/80% 边界/90%）；每 Task `npx tsc --noEmit` 零错。
2. 迁移 `20260725_db_size_rpc.sql` apply 到 Supabase（授权后）。
3. `GET /api/cron/health-watchdog?dryRun=1` → JSON `info` 含 DB 体积行（当前占用远低于 80% → info 非 problem，report 仍 `ok:true`）。
4. 迁移未部署时探针：`gatherCost` 走 catch → info「取数不可用，跳过」，watchdog 其余照常、`report.ok` 不受影响（降级正确）。
5. runbook 照做：Vercel Spend Management 金额已设、Supabase Spend Cap 开启、三处告警邮箱对齐同一地址。

## Self-Review

- **Spec 覆盖**：spec §设计 Part 1 ①RPC→Task 2 Step 1；②纯判定+pipeline cost→Task 1；③gatherCost 取数并入→Task 2 Step 2；④check 断言→Task 1；Part 2 runbook→Task 3。spec §错误处理(降级即 info)→Global Constraints + Task 2 gatherCost catch。无遗漏。
- **占位扫描**：无 TBD/TODO；纯函数、RPC SQL、gather 接线、runbook 全给完整内容与真实符号（`HealthProblem`/`gatherHealth`/`getDb`/`evaluate13F` 范式）。
- **类型一致**：`evaluateDbSize` 签名（Task 1 定义）→ Task 2 `gatherCost` 调用同签名；`HealthProblem.pipeline` 加 `"cost"`（Task 1）→ Task 2 cost problem 用之；返回形状 `{problems, info}` 与既有 evaluate/gather 一致。
- **顺序/风险**：Task 1（纯函数+类型，可裸跑测）→ Task 2（RPC+接线，依赖 Task 1 的函数）→ Task 3（独立文档）。每提交点独立编译。不动 alert.ts/cron/现有健康检查；降级保证 watchdog 不被拖垮。**对齐了 spec 后 db-foundation 的真实变化**（gatherMacro 已删、HealthProblem 多字段）。
