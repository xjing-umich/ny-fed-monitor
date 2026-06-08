# Data Health Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个每日 Vercel cron 看门狗，独立核查 13F + 宏观两条管道的数据新鲜度，仅在「数据该新却没新」时给运营者发一封 Resend 邮件，健康时静默。

**Architecture:** 纯判定逻辑（`checks.ts`：`evaluate13F`/`evaluateMacro`，零 DB、零 server-only、可 tsx 自检）与取数装配（`gather.ts`：读 filings/market_freshness_status，喂给纯函数）分离；`alert.ts` 复用现有 Resend 发邮件；`api/cron/health-watchdog` route 编排鉴权→核查→告警。零新表，复用 1E `derive`、现有 Resend、现有 `ingestion/auth`。

**Tech Stack:** TypeScript、Next.js 16 App Router（heavily modified——改路由前读 `web/node_modules/next/dist/docs/`，但本计划只新增一个 cron route，不碰渲染）、Supabase、Resend、tsx（自检 runner，项目无 vitest）。

**关键约束：**
- 所有命令在 worktree 根 `/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/data-health-watchdog/` 下；Next 应用根是其下 `web/`。
- **node 20 必须**（worktree 内 `node -v` 应为 v20.x；若 v10 先 `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`，否则 tsc 误报 `??` 语法）。
- 类型门禁 `cd web && node_modules/typescript/bin/tsc --noEmit`；构建 `npm run build`。
- **不引 vitest**（项目无测试套件）；纯逻辑用 `node:assert` + `npx tsx` 自检。
- **零新 DB 表**；不改 macro 摄取/freshness 写入逻辑（只读）；对 1E 仅多导出一个私有函数。

**文件结构：**
- Modify: `web/src/lib/freshness/derive.ts` — 导出现有私有 `parseUTC`（供 checks 复用）
- Create: `web/src/lib/health/checks.ts` — 纯判定：类型 + `evaluate13F` + `evaluateMacro`（无 server-only/DB）
- Create: `web/src/lib/health/checks.check.ts` — tsx 自检（node:assert）
- Create: `web/src/lib/health/gather.ts` — 取数装配 `gatherHealth(today)`（读 DB 调纯函数）
- Create: `web/src/lib/health/alert.ts` — `sendHealthAlert(report)`（Resend，env 缺失降级）
- Create: `web/src/app/api/cron/health-watchdog/route.ts` — cron 入口（鉴权/编排/dryRun/test）
- Modify: `web/vercel.json` — 增一条 watchdog cron

---

## Task 1: 从 1E `derive.ts` 导出 `parseUTC`

**Files:**
- Modify: `web/src/lib/freshness/derive.ts:11`

`checks.ts` 需要复用 1E 已有的 `parseUTC`（把 `YYYY-MM-DD` 或 ISO 串解析成 UTC Date，非法/空→null）。当前它是模块私有，仅需加 `export`，行为不变。

- [ ] **Step 1: 加 export**

当前 `web/src/lib/freshness/derive.ts` 第 11 行：
```ts
function parseUTC(s: string | null): Date | null {
```
改为：
```ts
export function parseUTC(s: string | null): Date | null {
```

- [ ] **Step 2: tsc 确认无回归**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错（仅可见性变化）。

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/data-health-watchdog
git add web/src/lib/freshness/derive.ts
git commit -m "refactor(freshness): export parseUTC for reuse by health watchdog"
```

---

## Task 2: 纯判定模块 `checks.ts` + tsx 自检

**Files:**
- Create: `web/src/lib/health/checks.ts`
- Check: `web/src/lib/health/checks.check.ts`

纯逻辑、无 DB、无 server-only → 可 `npx tsx` 自检。判定规则见 spec §4/§5。

- [ ] **Step 1: 写自检（先失败）`checks.check.ts`**

```ts
// 纯判定自检——node:assert,零新依赖。运行: npx tsx src/lib/health/checks.check.ts
// 项目无常驻测试套件(solo dev),此为 ad-hoc 自检,不接 CI。
import assert from "node:assert/strict";
import { evaluate13F, evaluateMacro, type MacroStatusInput } from "./checks";

const today = new Date("2026-06-08T12:00:00Z"); // mostRecentDueQuarter → 2026-03-31

// --- evaluate13F ---
// 空库 → 1 个问题
{
  const r = evaluate13F(null, [], today);
  assert.equal(r.problems.length, 1, "空库应 1 问题");
  assert.equal(r.problems[0].pipeline, "13f");
}
// 整体落后(最新只到 2025-12-31 < 2026-03-31) → 1 问题
{
  const r = evaluate13F("2025-12-31", ["2025-12-31"], today);
  assert.equal(r.problems.length, 1, "落后应 1 问题");
  assert.match(r.problems[0].expected, /2026-03-31/);
}
// 当季已到(2026-03-31) → 0 问题, info 带覆盖率
{
  const r = evaluate13F("2026-03-31", ["2026-03-31", "2025-09-30"], today);
  assert.equal(r.problems.length, 0, "当季到位不应告警(Burry 个体晚报不触发)");
  assert.equal(r.info.length, 1);
  assert.match(r.info[0], /1\/2/, "覆盖率应 1/2 户到位");
}

// --- evaluateMacro ---
const mk = (o: Partial<MacroStatusInput>): MacroStatusInput => ({
  id: 1, name: "Src", isManual: false, freshnessStatus: "fresh",
  latestObservationDate: "2026-06-05", checkedAt: "2026-06-08T09:00:00Z", ...o,
});
// 全合成行(id=0) → freshness 从未写入
{
  const p = evaluateMacro([mk({ id: 0 }), mk({ id: 0, name: "B" })], today);
  assert.equal(p.length, 1, "全合成应 1 问题");
  assert.match(p[0].message, /从未写入/);
}
// 真实行 checkedAt 7 天前 → 管道停跑
{
  const p = evaluateMacro([mk({ checkedAt: "2026-06-01T09:00:00Z" })], today);
  assert.ok(p.some((x) => /停跑/.test(x.message)), "7天未刷新应报停跑");
}
// 非手动 failed → 报; 手动 failed → 跳过; fresh → 不报
{
  const p = evaluateMacro([
    mk({ name: "F", freshnessStatus: "failed" }),
    mk({ name: "M", freshnessStatus: "failed", isManual: true }),
    mk({ name: "OK", freshnessStatus: "fresh" }),
  ], today);
  const names = p.filter((x) => x.source !== "宏观整体").map((x) => x.source);
  assert.ok(names.includes("F"), "非手动 failed 应报");
  assert.ok(!names.includes("M"), "手动源应跳过");
  assert.ok(!names.includes("OK"), "fresh 不应报");
}
// stale / empty 触发, partial / unknown / manual_required 不触发
{
  const p = evaluateMacro([
    mk({ name: "S", freshnessStatus: "stale" }),
    mk({ name: "E", freshnessStatus: "empty" }),
    mk({ name: "P", freshnessStatus: "partial" }),
    mk({ name: "U", freshnessStatus: "unknown" }),
  ], today);
  const names = p.map((x) => x.source);
  assert.ok(names.includes("S") && names.includes("E"), "stale/empty 应报");
  assert.ok(!names.includes("P") && !names.includes("U"), "partial/unknown 不应报");
}

console.log("checks.check.ts: all assertions passed ✓");
```

- [ ] **Step 2: 运行自检确认失败（模块不存在）**

Run:
```bash
cd web && npx tsx src/lib/health/checks.check.ts
```
Expected: FAIL —— `Cannot find module './checks'`。
（注：若报 esbuild darwin 平台不匹配而非模块错误，是 worktree node_modules 缺 arm64 二进制的环境问题——从主仓库 `web/node_modules` 拷 `@esbuild/darwin-arm64` 进本 worktree 的 `node_modules/@esbuild/` 即可，属 gitignore 不入提交。）

- [ ] **Step 3: 写实现 `checks.ts`**

```ts
// 数据健康看门狗——纯判定逻辑。无 DB、无 server-only → 可独立 tsx 自检。
// 取数装配在 gather.ts，本文件只接收已取好的数据做判断。
// 用相对路径(而非 @/ 别名)导入,确保 npx tsx 自检时路径解析万无一失。
import { mostRecentDueQuarter, parseUTC } from "../freshness/derive";

export type HealthProblem = {
  pipeline: "13f" | "macro";
  source: string;
  message: string;
  asOf: string | null;
  expected: string;
};

export type HealthReport = {
  ok: boolean;
  checkedAt: string;
  problems: HealthProblem[];
  info: string[];
};

// 宏观判定的最小输入(由 gather.ts 从 MarketFreshnessStatusRow 映射而来,
// 故纯函数不依赖 server-only 类型)。id===0 表示 getFreshnessStatus 合成的
// "该源无真实状态记录"占位行。
export type MacroStatusInput = {
  id: number;
  name: string;
  isManual: boolean;
  freshnessStatus: string;
  latestObservationDate: string | null;
  checkedAt: string;
};

const MACRO_ALERT_STATUSES = new Set(["failed", "stale", "empty"]);
const MACRO_STALE_CHECKED_DAYS = 2;

// UTC 日历天差(向下取整)。from 为空 → Infinity(视为极陈)。
function daysBetweenUTC(from: Date | null, to: Date): number {
  if (!from) return Infinity;
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86400000);
}

// 13F「整体落后」判定。latestPeriod=库内最新季度; perManagerPeriods=每户最新季度。
export function evaluate13F(
  latestPeriod: string | null,
  perManagerPeriods: string[],
  today: Date
): { problems: HealthProblem[]; info: string[] } {
  const due = mostRecentDueQuarter(today);
  const dueStr = due.toISOString().slice(0, 10);
  if (!latestPeriod) {
    return {
      problems: [{ pipeline: "13f", source: "13F 整体", message: "库内无任何 filing", asOf: null, expected: `应到 ${dueStr}` }],
      info: [],
    };
  }
  const atDue = perManagerPeriods.filter((p) => p === dueStr).length;
  const info = [`13F 覆盖率: ${atDue}/${perManagerPeriods.length} 户已到 ${dueStr}`];
  const latest = parseUTC(latestPeriod);
  if (latest && latest < due) {
    return {
      problems: [{ pipeline: "13f", source: "13F 整体", message: "整体落后,管道可能漏了一整季", asOf: latestPeriod, expected: `应到 ${dueStr}` }],
      info,
    };
  }
  return { problems: [], info };
}

// 宏观判定。信号1: 真实行(id!==0)的 max(checkedAt) 超阈 → 停跑;
// 信号2: 非手动源 freshnessStatus ∈ {failed,stale,empty} → 报。
export function evaluateMacro(rows: MacroStatusInput[], today: Date): HealthProblem[] {
  const problems: HealthProblem[] = [];
  const real = rows.filter((r) => r.id !== 0);
  if (real.length === 0) {
    problems.push({ pipeline: "macro", source: "宏观整体", message: "freshness 从未写入(管道或未跑过)", asOf: null, expected: "应有每日刷新" });
  } else {
    const maxChecked = real.reduce((m, r) => (r.checkedAt > m ? r.checkedAt : m), real[0].checkedAt);
    const days = daysBetweenUTC(parseUTC(maxChecked), today);
    if (days > MACRO_STALE_CHECKED_DAYS) {
      problems.push({ pipeline: "macro", source: "宏观整体", message: `管道可能停跑: 状态 ${days} 天未刷新`, asOf: maxChecked.slice(0, 10), expected: `应 ≤ ${MACRO_STALE_CHECKED_DAYS} 天` });
    }
  }
  for (const r of rows) {
    if (r.isManual) continue;
    if (MACRO_ALERT_STATUSES.has(r.freshnessStatus)) {
      problems.push({ pipeline: "macro", source: r.name, message: `状态 ${r.freshnessStatus}`, asOf: r.latestObservationDate, expected: "应 fresh" });
    }
  }
  return problems;
}
```

- [ ] **Step 4: 运行自检确认通过**

Run:
```bash
cd web && npx tsx src/lib/health/checks.check.ts
```
Expected: PASS —— `checks.check.ts: all assertions passed ✓`，退出码 0。

- [ ] **Step 5: tsc**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错。

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/data-health-watchdog
git add web/src/lib/health/checks.ts web/src/lib/health/checks.check.ts
git commit -m "feat(watchdog): pure health-check logic for 13F + macro freshness"
```

---

## Task 3: 取数装配 `gather.ts`

**Files:**
- Create: `web/src/lib/health/gather.ts`

读 DB（filings + `getFreshnessStatus`），映射成纯函数输入，调用 `evaluate*`，组装 `HealthReport`。每个 check 各自 try/catch——一个挂了不掩盖另一个，错误本身作为一个 problem 纳入（spec §9）。

- [ ] **Step 1: 写实现**

```ts
import "server-only";
import { getDb } from "@/lib/managers/db";
import { getFreshnessStatus } from "@/lib/db/freshness";
import {
  evaluate13F,
  evaluateMacro,
  type HealthProblem,
  type HealthReport,
  type MacroStatusInput,
} from "./checks";

// 读 filings,算库内最新季度 + 每户最新季度。
async function gather13F(today: Date): Promise<{ problems: HealthProblem[]; info: string[] }> {
  try {
    const { data, error } = await getDb().from("filings").select("cik,period");
    if (error) throw error;
    const rows = (data ?? []) as { cik: string; period: string }[];
    const maxByCik = new Map<string, string>();
    for (const r of rows) {
      const cur = maxByCik.get(r.cik);
      if (!cur || r.period > cur) maxByCik.set(r.cik, r.period);
    }
    const perManagerPeriods = [...maxByCik.values()];
    const latestPeriod = perManagerPeriods.reduce<string | null>((m, p) => (!m || p > m ? p : m), null);
    return evaluate13F(latestPeriod, perManagerPeriods, today);
  } catch (e) {
    return {
      problems: [{ pipeline: "13f", source: "13F 核查", message: `核查自身出错: ${e instanceof Error ? e.message : String(e)}`, asOf: null, expected: "核查应成功" }],
      info: [],
    };
  }
}

// 读 market_freshness_status(含 source 关联),映射成纯函数输入。
async function gatherMacro(today: Date): Promise<HealthProblem[]> {
  try {
    const rows = await getFreshnessStatus();
    const inputs: MacroStatusInput[] = rows.map((r) => ({
      id: r.id,
      name: r.source?.name ?? `source#${r.source_id}`,
      isManual: r.source?.is_manual ?? false,
      freshnessStatus: r.freshness_status,
      latestObservationDate: r.latest_observation_date,
      checkedAt: r.checked_at,
    }));
    return evaluateMacro(inputs, today);
  } catch (e) {
    return [{ pipeline: "macro", source: "宏观核查", message: `核查自身出错: ${e instanceof Error ? e.message : String(e)}`, asOf: null, expected: "核查应成功" }];
  }
}

export async function gatherHealth(today: Date): Promise<HealthReport> {
  const [r13, macroProblems] = await Promise.all([gather13F(today), gatherMacro(today)]);
  const problems = [...r13.problems, ...macroProblems];
  return { ok: problems.length === 0, checkedAt: today.toISOString(), problems, info: r13.info };
}
```

- [ ] **Step 2: tsc**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错。（确认 `getFreshnessStatus` 行的 `.source?.is_manual`/`.source?.name` 类型存在——`MarketDataSource` 含这两个字段。）

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/data-health-watchdog
git add web/src/lib/health/gather.ts
git commit -m "feat(watchdog): gather 13F + macro health from DB"
```

---

## Task 4: 告警发送 `alert.ts`（Resend）

**Files:**
- Create: `web/src/lib/health/alert.ts`

复用现有 Resend 模式（同 `api/contact/route.ts`）。env 缺失（`RESEND_API_KEY` / `RESEND_ALERTS_TO`）降级——记日志、返回原因、**不抛错**（否则污染 cron 成功率）。`from` 可配，默认已验证域。

- [ ] **Step 1: 写实现**

```ts
import "server-only";
import { Resend } from "resend";
import type { HealthReport } from "./checks";

export type AlertResult = { alerted: boolean; reason?: string };

export async function sendHealthAlert(report: HealthReport): Promise<AlertResult> {
  if (report.ok) return { alerted: false, reason: "healthy" };

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.RESEND_ALERTS_TO;
  if (!apiKey || !to) {
    console.warn("[watchdog] RESEND_API_KEY / RESEND_ALERTS_TO 未配置,跳过告警");
    return { alerted: false, reason: "RESEND_API_KEY 或 RESEND_ALERTS_TO 未配置" };
  }
  // 已验证发送域 send.thecompounder.fyi(见 contact-form-resend 记忆);可用 env 覆盖。
  const from = process.env.RESEND_ALERTS_FROM || "Compounder Ops <ops@send.thecompounder.fyi>";
  const env = process.env.VERCEL_ENV || "local";

  const lines = report.problems.map(
    (p) => `[${p.pipeline}] ${p.source}: ${p.message}（截至 ${p.asOf ?? "—"}，${p.expected}）`
  );
  const infoBlock = report.info.length ? `\n\n诊断:\n${report.info.join("\n")}` : "";
  const text = `数据健康告警 · ${report.problems.length} 项\n\n${lines.join("\n")}${infoBlock}\n\ncheckedAt: ${report.checkedAt}\nenv: ${env}\n本邮件由 health-watchdog 自动发出。`;
  const subject = `[Compounder] 数据健康告警 · ${report.problems.length} 项`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, text });
  if (error) {
    console.error("[watchdog] Resend 发送失败:", error);
    return { alerted: false, reason: `resend error: ${error.message ?? String(error)}` };
  }
  return { alerted: true };
}
```

- [ ] **Step 2: tsc**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错。（`resend` 包已是项目依赖,见 `api/contact/route.ts`。）

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/data-health-watchdog
git add web/src/lib/health/alert.ts
git commit -m "feat(watchdog): Resend email alert (env-gated, degrades safely)"
```

---

## Task 5: Cron route `api/cron/health-watchdog`

**Files:**
- Create: `web/src/app/api/cron/health-watchdog/route.ts`

鉴权（复用 `isAuthorizedIngestRequest`）→ 核查 → 告警 → 返回 JSON。支持 `?dryRun=1`（只返回 health,不发邮件）与 `?test=1`（发一封测试告警验通路）。DB 未配 → 500（让 Vercel cron 失败通知兜底）。

- [ ] **Step 1: 写实现**

```ts
import { isAuthorizedIngestRequest, unauthorizedResponse } from "@/lib/ingestion/auth";
import { hasSupabaseEnv } from "@/lib/managers/db";
import { gatherHealth } from "@/lib/health/gather";
import { sendHealthAlert } from "@/lib/health/alert";
import type { HealthReport } from "@/lib/health/checks";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedIngestRequest(request)) return unauthorizedResponse();
  if (!hasSupabaseEnv()) {
    return Response.json({ ok: false, message: "Database not configured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const today = new Date();
  const report = await gatherHealth(today);

  // 只看健康,不发邮件
  if (url.searchParams.get("dryRun") === "1") {
    return Response.json({ ...report, alerted: false, dryRun: true });
  }

  // 发一封测试告警,验 Resend 通路
  if (url.searchParams.get("test") === "1") {
    const testReport: HealthReport = {
      ...report,
      ok: false,
      problems: [{ pipeline: "13f", source: "测试", message: "这是一封 health-watchdog 测试告警", asOf: null, expected: "忽略即可" }],
    };
    const result = await sendHealthAlert(testReport);
    return Response.json({ ...testReport, ...result, test: true });
  }

  const result = await sendHealthAlert(report);
  return Response.json({ ...report, ...result });
}
```

- [ ] **Step 2: tsc**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/data-health-watchdog
git add "web/src/app/api/cron/health-watchdog/route.ts"
git commit -m "feat(watchdog): cron route — auth, gather, alert, dryRun/test"
```

---

## Task 6: 注册 Vercel cron

**Files:**
- Modify: `web/vercel.json`

每日 13:00 UTC（21:00 HKT），晚于 13F（09:00 Mon/Thu）与宏观（10:00 工作日），每日跑（含周末）以抓"该跑没跑"。

- [ ] **Step 1: 加 cron 条目**

当前 `web/vercel.json`：
```json
{
  "crons": [
    {
      "path": "/api/cron/market-ingest",
      "schedule": "0 10 * * 1-5"
    }
  ]
}
```
改为：
```json
{
  "crons": [
    {
      "path": "/api/cron/market-ingest",
      "schedule": "0 10 * * 1-5"
    },
    {
      "path": "/api/cron/health-watchdog",
      "schedule": "0 13 * * *"
    }
  ]
}
```

- [ ] **Step 2: 校验 JSON**

Run:
```bash
cd web && node -e "console.log(JSON.stringify(require('./vercel.json').crons))"
```
Expected: 打印两条 cron，无解析错误。

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/data-health-watchdog
git add web/vercel.json
git commit -m "feat(watchdog): register daily health-watchdog cron"
```

---

## Task 7: 全量门禁 + 收尾

**Files:** 无（仅验证）

- [ ] **Step 1: 纯逻辑自检**

Run:
```bash
cd web && npx tsx src/lib/health/checks.check.ts
```
Expected: `checks.check.ts: all assertions passed ✓`。

- [ ] **Step 2: tsc 全量**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错。

- [ ] **Step 3: 生产构建（必过门禁）**

Run:
```bash
cd web && npm run build
```
Expected: 构建成功；产物里出现 `ƒ /api/cron/health-watchdog`（dynamic route）。
（注：若构建因 `lightningcss` / `@tailwindcss/oxide` / esbuild 报 arm64 原生二进制缺失，是 worktree node_modules 的平台问题——从主仓库 `web/node_modules` 拷对应 `*-darwin-arm64` 包进本 worktree 的 `node_modules/`，再重跑。属 gitignore，不入提交。）

- [ ] **Step 4: 真实库 dryRun 验收（需本地 Supabase 只读 key）**

若本 worktree `web/.env.local` 无 key，可临时从主仓库复制（**用绝对路径，验完删，勿用相对 rm**）：
```bash
cp /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web/.env.local /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/data-health-watchdog/web/.env.local
```
本地起服务并 dryRun（不会发邮件）：
```bash
cd web && npm run dev
# 另开一个终端:
curl -s "http://localhost:3000/api/cron/health-watchdog?dryRun=1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s),null,2)))"
```
Expected（对照 2026-06-08 已知库情况）：`ok:true` 或仅含与真实状态一致的 problems；13F 应 `ok`（库内已到 Q1 2026，Burry 个体晚报不触发整体落后）；`info` 含覆盖率行。看完 `Ctrl-C` 停 dev。
（开发环境无 `INGEST_SECRET` 时 `isAuthorizedIngestRequest` 放行,故 dryRun 无需鉴权头。）

- [ ] **Step 5: 确认工作树干净**

Run:
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/data-health-watchdog
git status --short
```
Expected: 干净（临时 `.env.local` 已删、未提交）。

---

## 验收标准（来自 spec §11）

- 构造 13F 整体落后 → 邮件点明落后季度；当季到位 → 不发。
- 宏观非手动源 failed/stale/empty 或 freshness >2 天未刷新 → 邮件列出；手动源不误报。
- `checks.check.ts` 自检通过；`tsc` + `npm run build` 通过。
- 未新建任何 DB 表；未改 macro 摄取逻辑；1E 仅多导出 `parseUTC`。
- `RESEND_ALERTS_TO` / `RESEND_API_KEY` 缺失 → 降级不崩，route 返回明确原因。
- `vercel.json` 新增 watchdog cron；鉴权与现有 cron 一致。

## 净增清单（自检：简洁）

- 改 `derive.ts` 导出 1 个函数。
- 新增纯模块 `checks.ts`（+ 自检）。
- 新增 `gather.ts`（取数装配）。
- 新增 `alert.ts`（Resend 告警）。
- 新增 route `api/cron/health-watchdog`。
- 改 `vercel.json` 加 1 条 cron。

零新表、零 macro 摄取改动、复用 1E + Resend + 现有鉴权；无新依赖。

## 运维 checklist（实现合并后人工一次性，spec §13）

- [ ] Vercel 环境变量加 `RESEND_ALERTS_TO`（运营邮箱）。
- [ ] 确认 `INGEST_SECRET` 已在 Vercel（现有 macro cron 已用）。
- [ ] Vercel 为 `health-watchdog` cron 开启**失败通知**（看门狗的看门狗）。
- [ ] 部署后 `?test=1` 验一封告警邮件能收到。
