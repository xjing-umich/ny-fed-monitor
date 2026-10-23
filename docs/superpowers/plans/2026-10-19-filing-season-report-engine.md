# 申报季内容引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每季自动生成“季度超级投资者共识报告”Learn 页（申报中实时刷新、截止后由站长审预览一键定稿），并用同一份数据按 zh/en 分发第一封 newsletter。

**Architecture:** `quarterly_reports` 表每季一行，`payload` 只存数据（数字、ticker、issuer、投资人 slug/姓名）。纯函数 `buildQuarterlyReport` 复用全站同一套 consensus 计算口径，按报告季度锁定取数；页面与邮件都从同一份 payload 渲染。定稿冻结的是站长看过的那份预览 payload，发送由 GitHub `workflow_dispatch` 触发，可安全重跑。

**Tech Stack:** Next.js 16 App Router（RSC/ISR）、TypeScript、Supabase Postgres（supabase-js）、Resend 6.12.4（Segments + Broadcasts）、GitHub Actions、`tsx` 跑 `*.check.ts` 断言。

**Spec:** `docs/superpowers/specs/2026-10-19-filing-season-report-engine-design.md`

## Global Constraints

- 工作目录：worktree `/Users/junlinzhu/Desktop/TheCompounder/ny-fed-monitor-report`，分支 `plan/filing-season-report-engine`；PR base = `db-foundation`。
- Node 20：先 `export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"`。
- 本仓 Next.js 有破坏性变更：写路由代码前读 `web/node_modules/next/dist/docs/` 中相关章节（AGENTS.md 要求）。
- 测试写法：`*.check.ts` + 本地 `assert` + `process.exit(1)`，用 `npx tsx <file>` 运行；`src/lib/reports/*` 内一律用**相对路径** import（不用 `@/`），保证 tsx 可直接跑。
- 合规：只说位置和计数；不出现买卖建议、目标价、评级。
- 文案遵守 `web/docs/copy-voice.md`；中英各自独立判断；不用 “—” 表示缺失。
- 正文 SSR；不新增客户端组件（订阅表单只改已有 `NewsletterForm`）。
- 不新增 npm 依赖。
- 申报截止：`filingDeadline(period)`（季末 + 45 天）；可定稿：`today > deadline` 且 `coverage_filed / coverage_total ≥ 0.9`。
- 共识最少持有人：`CONSENSUS_MIN_HOLDERS = 2`（复用 `src/lib/aggregations.ts` 的常量值，报告侧以同名常量引用）。
- 板块条数：共识买入/卖出各 Top 10；持有人数最多 Top 10；击球区交集全部；名家每人 1–2 条；邮件每板块前 3 条。
- 发件人：`Compounder <newsletter@send.thecompounder.fyi>`。
- 新 env：`RESEND_SEGMENT_EN_ID`、`RESEND_SEGMENT_ZH_ID`、可选 `NEWSLETTER_POSTAL_ADDRESS`、可选 `NEWSLETTER_REPLY_TO`。

## Review Focus

1. **报告季度已申报、但库里没有更早一季申报的投资人**（新纳入跟踪）：期望不计入共识买卖与持有人数环比（否则全部持仓都会被算成“新建仓”），但计入持有人数。→ Task 2 测试。
2. **CUSIP 未解析出 ticker 的持仓**：期望以 issuer 显示、不生成 `/stocks/<cusip>` 链接（避免 404 链）。→ Task 2 测试 `ticker === null`，Task 4 测试链接函数。
3. **issuer 名含 `&`、`<`、引号**（如 “AT&T INC”、“PROCTER & GAMBLE”）：期望邮件 HTML 正确转义，纯文本版原样。→ Task 5 测试。
4. **已定稿的旧报告在以后改了渲染代码后仍要能渲染**：期望 v1 payload fixture 永远能被页面文案与邮件渲染。→ Task 5 用仓库内 fixture 测试。
5. **定稿发送部分失败后重跑 / `dry_run`**：期望 `dry_run` 绝不改状态，重跑只补发失败语言，未预览不得定稿。→ Task 3 测试 `planFinalize`。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `web/supabase/migrations/20261019_create_quarterly_reports.sql` | 建表 |
| `web/src/lib/reports/types.ts` | payload、行、输入类型 |
| `web/src/lib/reports/period.ts` | 报告季度、slug 解析/生成（纯） |
| `web/src/lib/consensus/compute.ts` | **新增导出** `diffHoldings`（从 scripts 搬来，全站同一口径） |
| `web/src/lib/reports/build.ts` | `buildQuarterlyReport`（纯） |
| `web/src/lib/reports/readiness.ts` | `reportReadiness`、`payloadHash`、`planFinalize`（纯） |
| `web/src/lib/reports/copy.ts` | 双语文案：标题、结论句、标签、链接（纯，页面与邮件共用） |
| `web/src/lib/reports/email.ts` | `renderReportEmail`（纯） |
| `web/src/lib/reports/fixtures/v1-final.json` | 冻结 payload 样本（回归用） |
| `web/scripts/lib/loadReportInput.ts` | 按报告季度从库取数（I/O） |
| `web/scripts/report.ts` | 生成/刷新 live 行、发预览（`npm run report`） |
| `web/scripts/report-finalize-send.ts` | 定稿 + 群发（`npm run report:finalize`） |
| `web/scripts/newsletter-backfill-segment.ts` | 老订阅者归入 EN segment（一次性） |
| `web/scripts/report-consistency.ts` | 报告与 consensus 表逐数核对 |
| `web/src/lib/reports/read.ts` | 服务端读报告（server-only） |
| `web/src/components/reports/ReportArticle.tsx` | 报告页 RSC |
| `web/src/app/[lang]/learn/[slug]/page.tsx` | 报告分支 |
| `web/src/app/[lang]/learn/[slug]/opengraph-image.tsx` | 报告分支 |
| `web/src/app/[lang]/learn/page.tsx` | “最新”位放最新报告 |
| `web/src/app/sitemap.ts` | 收录报告页 |
| `web/src/lib/revalidate/paths.ts`、`web/src/app/api/revalidate/route.ts` | 报告刷新范围 |
| `web/src/components/home/HeroMasthead.tsx` | 申报季进度行加报告链接 |
| `web/src/app/api/subscribe/route.ts`、`web/src/components/shell/NewsletterForm.tsx`、`web/src/lib/footer.ts`、`web/src/lib/legal.ts` | 订阅语言与诚实文案 |
| `web/src/lib/health/checks.ts`、`web/src/lib/health/gather.ts` | 未定稿提醒 |
| `.github/workflows/ingest.yml`、`.github/workflows/report-finalize-send.yml` | 调度 |

---

### Task 1: 基线、建表、类型与报告季度工具

**Files:**
- Create: `web/supabase/migrations/20261019_create_quarterly_reports.sql`
- Create: `web/src/lib/reports/types.ts`
- Create: `web/src/lib/reports/period.ts`
- Test: `web/src/lib/reports/period.check.ts`

**Interfaces:**
- Produces:
  - 类型：`ReportPayload`、`ReportRow`、`ReportInput`、`ReportManagerInput`、`ReportHolding`、`ReportStock`、`ConsensusMoveItem`、`MostHeldItem`、`StrikeZoneItem`、`FeaturedEntry`、`FeaturedMove`、`Section<T>`、`EmptyReason`、`MoveKind`、`ReportLang`
  - `reportPeriodFor(today: Date): string`（最近一个季末 ≤ today 的季度，`YYYY-MM-DD`）
  - `reportSlug(period: string): string`（`"2026-09-30"` → `"q3-2026-superinvestor-consensus"`）
  - `parseReportSlug(slug: string): string | null`（反向；非法 → null）
  - `priorQuarter(period: string): string`（`"2026-09-30"` → `"2026-06-30"`）

- [ ] **Step 1: 准备 worktree 依赖并跑基线**

```bash
cd /Users/junlinzhu/Desktop/TheCompounder/ny-fed-monitor-report/web
export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"
npm ci
npx tsc --noEmit && npx tsx scripts/lib/computeConsensus.check.ts && npx tsx scripts/revalidate-paths.check.ts
```
Expected: tsc exit 0；两个 check 打印 OK。

- [ ] **Step 2: 写迁移**

`web/supabase/migrations/20261019_create_quarterly_reports.sql`：

```sql
-- 季度共识报告快照：每季一行。payload 只存数据，文案在渲染时由模板生成。
-- 定稿冻结由写入方保证：report.ts 只在 status='live' 时更新（见 upsert_live_report）。
create table if not exists quarterly_reports (
  period                  date primary key,
  status                  text not null check (status in ('live','final')),
  payload                 jsonb not null,
  payload_hash            text not null,
  coverage_filed          int  not null,
  coverage_total          int  not null,
  valuation_as_of         date,
  first_live_at           timestamptz not null default now(),
  generated_at            timestamptz not null default now(),
  preview_payload         jsonb,
  preview_valuation_as_of date,
  preview_sent_at         timestamptz,
  finalized_at            timestamptz,
  sends                   jsonb not null default '{}'::jsonb
);

-- live 行的写入口：新行插入；已存在且仍为 live 才更新；final 行原样不动。
-- 返回 'inserted' | 'updated' | 'unchanged' | 'frozen'。
create or replace function upsert_live_report(
  p_period date, p_payload jsonb, p_hash text,
  p_filed int, p_total int, p_valuation_as_of date
) returns text language plpgsql as $$
declare cur record;
begin
  select status, payload_hash into cur from quarterly_reports where period = p_period for update;
  if not found then
    insert into quarterly_reports(period, status, payload, payload_hash, coverage_filed, coverage_total, valuation_as_of)
    values (p_period, 'live', p_payload, p_hash, p_filed, p_total, p_valuation_as_of);
    return 'inserted';
  end if;
  if cur.status = 'final' then return 'frozen'; end if;
  if cur.payload_hash = p_hash then return 'unchanged'; end if;
  update quarterly_reports
     set payload = p_payload, payload_hash = p_hash, coverage_filed = p_filed,
         coverage_total = p_total, valuation_as_of = p_valuation_as_of, generated_at = now()
   where period = p_period and status = 'live';
  return 'updated';
end $$;

-- 定稿：只把已预览的 live 行冻结为预览那一份。返回是否成功冻结。
create or replace function finalize_report(p_period date) returns boolean language plpgsql as $$
begin
  update quarterly_reports
     set status = 'final', payload = preview_payload, valuation_as_of = preview_valuation_as_of,
         finalized_at = now()
   where period = p_period and status = 'live' and preview_payload is not null;
  return found;
end $$;
```

- [ ] **Step 3: 写类型**

`web/src/lib/reports/types.ts`：

```ts
// 季度共识报告的数据形状。payload 只存数据(数字/ticker/issuer/slug/姓名),不存成句文案:
// 文案由 copy.ts 在渲染时按语言生成,所以中英天然同值。
// schemaVersion 只增不改:已定稿的旧报告必须永远能被渲染(见 fixtures/v1-final.json)。

export type ReportLang = "en" | "zh";
export type MoveKind = "new" | "increased" | "decreased" | "exited";
export type EmptyReason = "no_filers" | "no_qualifying" | "no_valuation";

/** ticker 为 null = CUSIP 未解析;此时只显示 issuer,不生成个股页链接。key 恒为非空(ticker ?? cusip)。 */
export type ReportStock = { key: string; ticker: string | null; issuer: string };

export type ConsensusMoveItem = ReportStock & {
  managerCount: number;
  netValue: number;
  dominantKind: MoveKind;
};
export type MostHeldItem = ReportStock & { holderCount: number; holderDelta: number };
export type StrikeZoneItem = ReportStock & {
  holderCount: number;
  position: "strike_zone" | "below";
  marginPct: number;
};
export type FeaturedMove = ReportStock & { kind: MoveKind; weightBefore: number; weightAfter: number };
export type FeaturedEntry = {
  slug: string;
  person: string;
  personZh: string | null;
  filed: boolean;
  moves: FeaturedMove[];
};
export type Section<T> = { items: T[]; emptyReason: EmptyReason | null };

export type ReportPayload = {
  schemaVersion: 1;
  period: string; // 季末 YYYY-MM-DD
  coverage: { filed: number; total: number };
  bought: Section<ConsensusMoveItem>;
  sold: Section<ConsensusMoveItem>;
  mostHeld: Section<MostHeldItem>;
  strikeZone: Section<StrikeZoneItem>;
  featured: FeaturedEntry[];
};

export type ReportStatus = "live" | "final";
export type ReportSends = Partial<Record<ReportLang, { broadcastId: string; sentAt: string }>>;

/** quarterly_reports 一行(读层映射后的 camelCase)。 */
export type ReportRow = {
  period: string;
  status: ReportStatus;
  payload: ReportPayload;
  payloadHash: string;
  coverageFiled: number;
  coverageTotal: number;
  valuationAsOf: string | null;
  firstLiveAt: string;
  generatedAt: string;
  previewPayload: ReportPayload | null;
  previewValuationAsOf: string | null;
  previewSentAt: string | null;
  finalizedAt: string | null;
  sends: ReportSends;
};

export type ReportHolding = {
  cusip: string;
  issuer: string;
  value: number;
  shares: number;
  weight: number; // 组合权重,小数(0.042 = 4.2%),与 ingest 写入口径一致
  putCall: string | null;
};

export type ReportManagerInput = {
  slug: string;
  person: string;
  personZh: string | null;
  /** 报告季度 P 的持仓;null = 尚未申报 P。 */
  current: ReportHolding[] | null;
  /** 早于 P 的最近一季持仓(与全站口径一致);null = 库里没有更早申报。 */
  prior: ReportHolding[] | null;
};

export type ReportInput = {
  period: string;
  /** 仅活跃投资人(freshness13F !== "inactive")。 */
  managers: ReportManagerInput[];
  cusipMap: Map<string, { ticker: string | null; name: string | null }>;
  /** key = ticker 大写;只含 reliable 且(击球区 或 价值带以下)且通过 isImplausibleBand 的票。 */
  bargains: Map<string, { inStrikeZone: boolean; marginPct: number }>;
  featuredSlugs: string[];
};
```

- [ ] **Step 4: 写失败的测试**

`web/src/lib/reports/period.check.ts`：

```ts
/** Run: cd web && npx tsx src/lib/reports/period.check.ts */
import { reportPeriodFor, reportSlug, parseReportSlug, priorQuarter } from "./period";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

assert(reportPeriodFor(new Date("2026-10-19T00:00:00Z")) === "2026-09-30", "10/19 → Q3");
assert(reportPeriodFor(new Date("2026-09-30T12:00:00Z")) === "2026-09-30", "季末当天即该季");
assert(reportPeriodFor(new Date("2026-09-29T00:00:00Z")) === "2026-06-30", "季末前一天 → 上一季");
assert(reportPeriodFor(new Date("2026-01-05T00:00:00Z")) === "2025-12-31", "跨年 → Q4 上年");

assert(reportSlug("2026-09-30") === "q3-2026-superinvestor-consensus", "slug Q3");
assert(reportSlug("2025-12-31") === "q4-2025-superinvestor-consensus", "slug Q4");
assert(parseReportSlug("q2-2026-superinvestor-consensus") === "2026-06-30", "parse Q2");
assert(parseReportSlug("q1-2026-superinvestor-consensus") === "2026-03-31", "parse Q1");
assert(parseReportSlug("q5-2026-superinvestor-consensus") === null, "Q5 非法");
assert(parseReportSlug("how-to-read-a-13f") === null, "普通文章不是报告");
assert(parseReportSlug("q3-2026-superinvestor-consensus-x") === null, "尾巴多余");

assert(priorQuarter("2026-09-30") === "2026-06-30", "prior Q3");
assert(priorQuarter("2026-03-31") === "2025-12-31", "prior 跨年");

console.log("period.check OK");
```

- [ ] **Step 5: 运行，确认失败**

Run: `cd web && npx tsx src/lib/reports/period.check.ts`
Expected: FAIL（模块 `./period` 不存在）。

- [ ] **Step 6: 实现**

`web/src/lib/reports/period.ts`：

```ts
// 报告季度与 slug。slug 沿用 Q1 手写报告的形态:q{N}-{YYYY}-superinvestor-consensus。

const QUARTER_ENDS: Array<[number, number]> = [
  [3, 31],
  [6, 30],
  [9, 30],
  [12, 31],
];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** 最近一个季末 ≤ today(UTC)的季度。 */
export function reportPeriodFor(today: Date): string {
  const t = iso(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
  for (const y of [today.getUTCFullYear(), today.getUTCFullYear() - 1]) {
    for (const [m, d] of [...QUARTER_ENDS].reverse()) {
      const qe = iso(y, m, d);
      if (qe <= t) return qe;
    }
  }
  return iso(today.getUTCFullYear() - 1, 12, 31);
}

export function priorQuarter(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const idx = QUARTER_ENDS.findIndex(([qm]) => qm === m);
  if (idx <= 0) return iso(y - 1, 12, 31);
  const [pm, pd] = QUARTER_ENDS[idx - 1];
  return iso(y, pm, pd);
}

export function reportSlug(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return `q${q}-${y}-superinvestor-consensus`;
}

const SLUG_RE = /^q([1-4])-(\d{4})-superinvestor-consensus$/;

export function parseReportSlug(slug: string): string | null {
  const m = SLUG_RE.exec(slug);
  if (!m) return null;
  const [qm, qd] = QUARTER_ENDS[Number(m[1]) - 1];
  return iso(Number(m[2]), qm, qd);
}
```

- [ ] **Step 7: 运行测试与 tsc**

Run: `cd web && npx tsx src/lib/reports/period.check.ts && npx tsc --noEmit`
Expected: `period.check OK`；tsc exit 0。

- [ ] **Step 8: 在 Supabase 执行迁移**

迁移需站长在 Supabase SQL Editor 执行（或用项目既有方式）。执行后验证：

```sql
select upsert_live_report('1999-12-31','{}'::jsonb,'h',0,0,null);  -- 期望 'inserted'
select upsert_live_report('1999-12-31','{}'::jsonb,'h',0,0,null);  -- 期望 'unchanged'
delete from quarterly_reports where period = '1999-12-31';
```

- [ ] **Step 9: Commit**

```bash
git add web/supabase/migrations/20261019_create_quarterly_reports.sql web/src/lib/reports/types.ts web/src/lib/reports/period.ts web/src/lib/reports/period.check.ts
git commit -m "feat(reports): quarterly_reports 表、报告类型与季度/slug 工具"
```

---

### Task 2: 报告生成纯函数

**Files:**
- Modify: `web/src/lib/consensus/compute.ts`（新增导出 `diffHoldings`）
- Modify: `web/scripts/lib/computeConsensus.ts:21-35`（删本地 `diff`，改用 `diffHoldings`）
- Create: `web/src/lib/reports/build.ts`
- Test: `web/src/lib/reports/build.check.ts`

**Interfaces:**
- Consumes: Task 1 全部类型；`computeConsensus(scan, cusipMap)`（`src/lib/consensus/compute.ts`）
- Produces:
  - `diffHoldings(latest: DiffRow[], prior: DiffRow[]): ScanChange[]`，`DiffRow = { cusip: string; issuer: string; value: number | string; shares: number | string; put_call?: string | null }`
  - `CONSENSUS_MIN_HOLDERS_REPORT = 2`
  - `buildQuarterlyReport(input: ReportInput): ReportPayload`

- [ ] **Step 1: 把 `diff` 搬进 compute.ts 并导出**

在 `web/src/lib/consensus/compute.ts` 末尾追加（逻辑与 `scripts/lib/computeConsensus.ts` 现有 `diff` 逐字一致）：

```ts
// QoQ 变动:latest 对 prior 按 cusip+期权类型比对。全站与季度报告共用这一份口径。
export type DiffRow = { cusip: string; issuer: string; value: number | string; shares: number | string; put_call?: string | null };
export function diffHoldings(latest: DiffRow[], prior: DiffRow[]): ScanChange[] {
  const keyOfHolding = (h: DiffRow) => `${h.cusip}|${h.put_call ?? ""}`;
  const lm = new Map(latest.map((h) => [keyOfHolding(h), h]));
  const pm = new Map(prior.map((h) => [keyOfHolding(h), h]));
  const out: ScanChange[] = [];
  for (const [k, lh] of lm) {
    const ph = pm.get(k);
    if (!ph) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "new", value: Number(lh.value), putCall: lh.put_call ?? undefined });
    else if (Number(lh.shares) > Number(ph.shares)) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "increased", value: Number(lh.value), putCall: lh.put_call ?? undefined });
    else if (Number(lh.shares) < Number(ph.shares)) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "decreased", value: Number(lh.value), putCall: lh.put_call ?? undefined });
  }
  for (const [k, ph] of pm) if (!lm.has(k)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", value: Number(ph.value), putCall: ph.put_call ?? undefined });
  return out;
}
```

在 `web/scripts/lib/computeConsensus.ts` 中删除本地 `function diff(...)`（第 21–35 行），import 行加 `diffHoldings`，并把 `changesOf` 里的 `diff(r.latestH, r.priorH)` 改成 `diffHoldings(r.latestH, r.priorH)`。

Run: `cd web && npx tsx scripts/lib/computeConsensus.check.ts && npx tsc --noEmit`
Expected: OK；exit 0（纯搬家，行为不变）。

- [ ] **Step 2: 写失败的测试**

`web/src/lib/reports/build.check.ts`：

```ts
/** Run: cd web && npx tsx src/lib/reports/build.check.ts */
import { buildQuarterlyReport } from "./build";
import type { ReportHolding, ReportInput, ReportManagerInput } from "./types";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}
const h = (cusip: string, shares: number, weight: number, issuer = cusip, putCall: string | null = null): ReportHolding =>
  ({ cusip, issuer, value: shares * 10, shares, weight, putCall });
const mgr = (slug: string, current: ReportHolding[] | null, prior: ReportHolding[] | null): ReportManagerInput =>
  ({ slug, person: slug.toUpperCase(), personZh: null, current, prior });

const cusipMap = new Map([
  ["C_AAPL", { ticker: "AAPL", name: "APPLE INC" }],
  ["C_GOOG", { ticker: "GOOG", name: "ALPHABET INC" }],
  ["C_KO", { ticker: "KO", name: "COCA COLA CO" }],
  // C_UNRES 故意不在表里 → ticker null
]);

const base: ReportInput = {
  period: "2026-09-30",
  managers: [
    // a: 加仓 AAPL、新建 GOOG、清仓 KO
    mgr("a", [h("C_AAPL", 200, 0.6), h("C_GOOG", 50, 0.4)], [h("C_AAPL", 100, 0.5), h("C_KO", 10, 0.5)]),
    // b: 新建 GOOG,AAPL 不变
    mgr("b", [h("C_AAPL", 10, 0.5), h("C_GOOG", 10, 0.5)], [h("C_AAPL", 10, 1)]),
    // c: 新纳入跟踪,无更早申报 → 不计入买卖与环比,但计入持有人数
    mgr("c", [h("C_GOOG", 5, 0.5), h("C_UNRES", 5, 0.5, "MYSTERY CORP")], null),
    // d: 尚未申报 P
    mgr("d", null, [h("C_AAPL", 10, 1)]),
    // e: 只有期权变动,不应计入
    mgr("e", [h("C_KO", 1, 0, "COCA COLA CO", "Call")], [h("C_AAPL", 1, 1, "APPLE INC")]),
  ],
  cusipMap,
  bargains: new Map([["GOOG", { inStrikeZone: true, marginPct: 0.35 }], ["AAPL", { inStrikeZone: false, marginPct: 0.1 }]]),
  featuredSlugs: ["a", "d", "c", "zzz-not-tracked"],
};

const p = buildQuarterlyReport(base);

assert(p.schemaVersion === 1 && p.period === "2026-09-30", "版本与季度");
assert(p.coverage.filed === 4 && p.coverage.total === 5, `覆盖 4/5, got ${p.coverage.filed}/${p.coverage.total}`);

const goodBuy = p.bought.items.find((i) => i.key === "GOOG");
assert(!!goodBuy && goodBuy.managerCount === 2, `GOOG 买入应为 a+b=2(c 无上季不计), got ${goodBuy?.managerCount}`);
assert(p.bought.items[0].key === "GOOG", "买入按人数排序,GOOG 第一");
assert(!p.bought.items.some((i) => i.key === "KO"), "期权 Call 不计入买入");
const koSell = p.sold.items.find((i) => i.key === "KO");
assert(!!koSell && koSell.managerCount === 1 && koSell.dominantKind === "exited", "KO 清仓 1 人");
const aaplSellByE = p.sold.items.find((i) => i.key === "AAPL");
assert(!!aaplSellByE && aaplSellByE.managerCount === 1, "e 清掉长仓 AAPL 计入卖出");

const goog = p.mostHeld.items.find((i) => i.key === "GOOG")!;
assert(goog.holderCount === 3, `GOOG 持有人 a,b,c=3, got ${goog.holderCount}`);
assert(goog.holderDelta === 2, `GOOG 环比只在有上季的已申报者内比:a,b 新持有 → +2, got ${goog.holderDelta}`);
const aapl = p.mostHeld.items.find((i) => i.key === "AAPL")!;
assert(aapl.holderCount === 2, `AAPL 持有人 a,b=2(d 未申报不计), got ${aapl.holderCount}`);
assert(aapl.holderDelta === -1, `AAPL 环比:a,b 持有不变,e 清仓 → -1, got ${aapl.holderDelta}`);

const unres = p.mostHeld.items.find((i) => i.key === "C_UNRES")!;
assert(unres.ticker === null && unres.issuer === "MYSTERY CORP", "未解析 CUSIP:ticker null,issuer 保留");
assert(p.mostHeld.items.find((i) => i.key === "GOOG")!.ticker === "GOOG", "已解析 ticker 保留");

assert(p.strikeZone.items.length === 2, `击球区交集:GOOG(3人)、AAPL(2人)都 ≥2, got ${p.strikeZone.items.length}`);
assert(p.strikeZone.items[0].key === "GOOG" && p.strikeZone.items[0].position === "strike_zone", "GOOG 击球区且排第一");
assert(p.strikeZone.items[1].position === "below", "AAPL 价值带以下");

const fa = p.featured.find((f) => f.slug === "a")!;
assert(fa.filed && fa.moves.length === 2, "a 已申报,取 2 条");
assert(fa.moves[0].key === "KO" && fa.moves[0].kind === "exited", `a 权重变化最大的是 KO 清仓(0.5→0), got ${fa.moves[0].key}`);
const fd = p.featured.find((f) => f.slug === "d")!;
assert(!fd.filed && fd.moves.length === 0, "d 未申报");
const fc = p.featured.find((f) => f.slug === "c")!;
assert(fc.filed && fc.moves.length === 0, "c 已申报但无上季 → 无动作");
assert(!p.featured.some((f) => f.slug === "zzz-not-tracked"), "名单里不在活跃列表的 slug 跳过");

// 空季度
const empty = buildQuarterlyReport({ ...base, managers: base.managers.map((m) => ({ ...m, current: null })) });
assert(empty.coverage.filed === 0, "无人申报");
assert(empty.bought.emptyReason === "no_filers" && empty.mostHeld.emptyReason === "no_filers", "无人申报 → no_filers");
assert(empty.strikeZone.emptyReason === "no_filers", "击球区 no_filers");

// 无估值数据
const noVal = buildQuarterlyReport({ ...base, bargains: new Map() });
assert(noVal.strikeZone.items.length === 0 && noVal.strikeZone.emptyReason === "no_valuation", "无估值 → no_valuation");

// 有估值但无交集
const noHit = buildQuarterlyReport({ ...base, bargains: new Map([["KO", { inStrikeZone: true, marginPct: 0.4 }]]) });
assert(noHit.strikeZone.emptyReason === "no_qualifying", "无交集 → no_qualifying");

console.log("build.check OK");
```

- [ ] **Step 3: 运行，确认失败**

Run: `cd web && npx tsx src/lib/reports/build.check.ts`
Expected: FAIL（`./build` 不存在）。

- [ ] **Step 4: 实现**

`web/src/lib/reports/build.ts`：

```ts
// 季度报告生成(纯函数,无 I/O)。买卖口径直接复用 computeConsensus,与 buys/sells 页同源;
// 不同点只有一处:输入锁定在报告季度 P,且没有更早申报的投资人不产生买卖(否则其全部持仓都会被算成“新建仓”)。
import { computeConsensus, diffHoldings, type ScanInput, type ScanChange } from "../consensus/compute";
import type {
  ConsensusMoveItem, FeaturedEntry, FeaturedMove, MostHeldItem, MoveKind, ReportHolding,
  ReportInput, ReportPayload, ReportStock, Section, StrikeZoneItem,
} from "./types";

export const CONSENSUS_MIN_HOLDERS_REPORT = 2;
const TOP_N = 10;
const FEATURED_MOVES = 2;

const toDiffRows = (hs: ReportHolding[]) =>
  hs.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: h.value, shares: h.shares, put_call: h.putCall }));

function section<T>(items: T[], emptyReason: Section<T>["emptyReason"]): Section<T> {
  return { items, emptyReason: items.length ? null : emptyReason };
}

export function buildQuarterlyReport(input: ReportInput): ReportPayload {
  const { period, managers, cusipMap, bargains, featuredSlugs } = input;
  const knownTickers = new Set([...cusipMap.values()].map((v) => v.ticker).filter((t): t is string => !!t));
  const stock = (key: string, issuer: string): ReportStock => ({ key, ticker: knownTickers.has(key) ? key : null, issuer });
  const keyOf = (cusip: string) => cusipMap.get(cusip)?.ticker ?? cusip;

  const filers = managers.filter((m) => m.current !== null);
  const coverage = { filed: filers.length, total: managers.length };
  const noFilers = filers.length === 0;

  // —— 共识买卖:复用全站 computeConsensus
  const scan: ScanInput[] = filers.map((m) => ({
    slug: m.slug,
    holdings: m.current!.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: h.value, putCall: h.putCall ?? undefined })),
    changes: m.prior ? diffHoldings(toDiffRows(m.current!), toDiffRows(m.prior)) : [],
  }));
  const { holdings, moves } = computeConsensus(scan, cusipMap);
  const toMove = (r: (typeof moves)[number]): ConsensusMoveItem => ({
    ...stock(r.ticker, r.issuer), managerCount: r.manager_count, netValue: r.net_value, dominantKind: r.dominant_kind,
  });
  const bought = moves.filter((r) => r.direction === "bought").slice(0, TOP_N).map(toMove);
  const sold = moves.filter((r) => r.direction === "sold").slice(0, TOP_N).map(toMove);

  // —— 持有人数环比:只在“已申报 P 且有更早申报”的同一批人内自比(申报季中不会因有人没申报而虚降)
  const longKeys = (hs: ReportHolding[]) => new Set(hs.filter((h) => !h.putCall).map((h) => keyOf(h.cusip)));
  const delta = new Map<string, number>();
  for (const m of filers) {
    if (!m.prior) continue;
    const now = longKeys(m.current!);
    const before = longKeys(m.prior);
    for (const k of now) if (!before.has(k)) delta.set(k, (delta.get(k) ?? 0) + 1);
    for (const k of before) if (!now.has(k)) delta.set(k, (delta.get(k) ?? 0) - 1);
  }
  const allHeld: MostHeldItem[] = holdings.map((r) => ({
    ...stock(r.ticker, r.issuer), holderCount: r.holder_count, holderDelta: delta.get(r.ticker) ?? 0,
  }));

  // —— 击球区交集
  const strike: StrikeZoneItem[] = allHeld
    .filter((r) => r.ticker && r.holderCount >= CONSENSUS_MIN_HOLDERS_REPORT && bargains.has(r.ticker))
    .map((r) => {
      const b = bargains.get(r.ticker!)!;
      return { key: r.key, ticker: r.ticker, issuer: r.issuer, holderCount: r.holderCount, position: b.inStrikeZone ? "strike_zone" as const : "below" as const, marginPct: b.marginPct };
    })
    .sort((a, b) => b.holderCount - a.holderCount || b.marginPct - a.marginPct);
  const strikeReason = noFilers ? "no_filers" : bargains.size === 0 ? "no_valuation" : "no_qualifying";

  // —— 名家动作:权重变化绝对值最大的 1–2 条
  const bySlug = new Map(managers.map((m) => [m.slug, m]));
  const featured: FeaturedEntry[] = [];
  for (const slug of featuredSlugs) {
    const m = bySlug.get(slug);
    if (!m) continue;
    const entry: FeaturedEntry = { slug, person: m.person, personZh: m.personZh, filed: m.current !== null, moves: [] };
    if (m.current && m.prior) entry.moves = topWeightMoves(m.current, m.prior, keyOf, stock);
    featured.push(entry);
  }

  const reason = noFilers ? "no_filers" : "no_qualifying";
  return {
    schemaVersion: 1,
    period,
    coverage,
    bought: section(bought, reason),
    sold: section(sold, reason),
    mostHeld: section(allHeld.slice(0, TOP_N), reason),
    strikeZone: section(strike, strikeReason),
    featured,
  };
}

function topWeightMoves(
  current: ReportHolding[],
  prior: ReportHolding[],
  keyOf: (cusip: string) => string,
  stock: (key: string, issuer: string) => ReportStock,
): FeaturedMove[] {
  const changes: ScanChange[] = diffHoldings(toDiffRows(current), toDiffRows(prior)).filter((c) => !c.putCall);
  const weightOf = (hs: ReportHolding[], cusip: string) => hs.find((h) => h.cusip === cusip && !h.putCall)?.weight ?? 0;
  return changes
    .map((c) => {
      const before = weightOf(prior, c.cusip);
      const after = weightOf(current, c.cusip);
      return { ...stock(keyOf(c.cusip), c.issuer), kind: c.kind as MoveKind, weightBefore: before, weightAfter: after };
    })
    .sort((a, b) => Math.abs(b.weightAfter - b.weightBefore) - Math.abs(a.weightAfter - a.weightBefore))
    .slice(0, FEATURED_MOVES);
}
```

- [ ] **Step 5: 运行测试**

Run: `cd web && npx tsx src/lib/reports/build.check.ts && npx tsc --noEmit`
Expected: `build.check OK`；exit 0。若 issuer 断言失败，检查 `computeConsensus` 对未解析 CUSIP 的 issuer 取值（`name ?? h.issuer`），以该函数行为为准修正测试期望前先确认它与页面一致。

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/consensus/compute.ts web/scripts/lib/computeConsensus.ts web/src/lib/reports/build.ts web/src/lib/reports/build.check.ts
git commit -m "feat(reports): buildQuarterlyReport,买卖口径复用 computeConsensus;diffHoldings 收归一处"
```

---

### Task 3: 可定稿判断、payload 哈希、定稿发送计划

**Files:**
- Create: `web/src/lib/reports/readiness.ts`
- Test: `web/src/lib/reports/readiness.check.ts`

**Interfaces:**
- Consumes: `ReportRow`、`ReportPayload`、`ReportLang`（Task 1）；`filingDeadline`（`src/lib/freshness/derive.ts`）
- Produces:
  - `READY_COVERAGE = 0.9`
  - `reportReadiness(row: Pick<ReportRow,"period"|"coverageFiled"|"coverageTotal">, today: Date): { ready: boolean; reason: "before_deadline" | "low_coverage" | "ready" }`
  - `payloadHash(p: ReportPayload): string`（稳定 JSON → sha256 hex）
  - `planFinalize(row: ReportRow | null, action: "preview" | "finalize", dryRun: boolean): FinalizePlan`
  - `type FinalizePlan = { kind: "error"; message: string } | { kind: "preview"; to: "ops" } | { kind: "run"; freeze: boolean; sendLangs: ReportLang[]; to: "segments" | "ops" }`

- [ ] **Step 1: 写失败的测试**

`web/src/lib/reports/readiness.check.ts`：

```ts
/** Run: cd web && npx tsx src/lib/reports/readiness.check.ts */
import { reportReadiness, payloadHash, planFinalize } from "./readiness";
import type { ReportPayload, ReportRow } from "./types";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const r = { period: "2026-09-30", coverageFiled: 90, coverageTotal: 97 };
assert(reportReadiness(r, new Date("2026-11-14T12:00:00Z")).reason === "before_deadline", "截止日当天(11/14)仍未到");
assert(reportReadiness(r, new Date("2026-11-16T12:00:00Z")).reason === "ready", "截止后且 90/97≥0.9 → ready");
assert(reportReadiness({ ...r, coverageFiled: 80 }, new Date("2026-11-20T00:00:00Z")).reason === "low_coverage", "80/97 < 0.9");
assert(reportReadiness({ ...r, coverageTotal: 0, coverageFiled: 0 }, new Date("2026-12-01T00:00:00Z")).reason === "low_coverage", "total=0 不得 ready");

const p1 = { schemaVersion: 1, period: "2026-09-30", coverage: { filed: 1, total: 2 } } as unknown as ReportPayload;
const p2 = { coverage: { total: 2, filed: 1 }, period: "2026-09-30", schemaVersion: 1 } as unknown as ReportPayload;
assert(payloadHash(p1) === payloadHash(p2), "键序不同哈希相同");
assert(payloadHash(p1) !== payloadHash({ ...p1, period: "2026-06-30" } as ReportPayload), "内容不同哈希不同");

const row = (over: Partial<ReportRow>): ReportRow => ({
  period: "2026-09-30", status: "live", payload: p1, payloadHash: "h", coverageFiled: 90, coverageTotal: 97,
  valuationAsOf: null, firstLiveAt: "", generatedAt: "", previewPayload: null, previewValuationAsOf: null,
  previewSentAt: null, finalizedAt: null, sends: {}, ...over,
});

assert(planFinalize(null, "finalize", false).kind === "error", "无行 → error");
assert(planFinalize(row({}), "preview", false).kind === "preview", "preview 动作");
const noPrev = planFinalize(row({}), "finalize", false);
assert(noPrev.kind === "error" && /preview/.test(noPrev.message), "未预览不得定稿");

const fresh = planFinalize(row({ previewPayload: p1, previewSentAt: "x" }), "finalize", false);
assert(fresh.kind === "run" && fresh.freeze && fresh.to === "segments" && fresh.sendLangs.join() === "en,zh", "首次定稿:冻结并发两种语言");

const partial = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" } } }), "finalize", false);
assert(partial.kind === "run" && !partial.freeze && partial.sendLangs.join() === "zh", "重跑:已 final 不再冻结,只补发 zh");

const done = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" }, zh: { broadcastId: "b2", sentAt: "t" } } }), "finalize", false);
assert(done.kind === "run" && done.sendLangs.length === 0, "全部已发 → 无事可做");

const dry = planFinalize(row({ previewPayload: p1, previewSentAt: "x" }), "finalize", true);
assert(dry.kind === "run" && !dry.freeze && dry.to === "ops" && dry.sendLangs.join() === "en,zh", "dry_run:不冻结,只发给站长");

const dryFinal = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" } } }), "finalize", true);
assert(dryFinal.kind === "run" && dryFinal.sendLangs.join() === "en,zh", "dry_run 不受 sends 影响,两种都发给站长");

assert(planFinalize(row({ status: "final" }), "preview", false).kind === "error", "已定稿不能再预览");

console.log("readiness.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx src/lib/reports/readiness.check.ts`
Expected: FAIL（`./readiness` 不存在）。

- [ ] **Step 3: 实现**

`web/src/lib/reports/readiness.ts`：

```ts
import { createHash } from "node:crypto";
import { filingDeadline } from "../freshness/derive";
import type { ReportLang, ReportPayload, ReportRow } from "./types";

export const READY_COVERAGE = 0.9;
const LANGS: ReportLang[] = ["en", "zh"];

export function reportReadiness(
  row: Pick<ReportRow, "period" | "coverageFiled" | "coverageTotal">,
  today: Date,
): { ready: boolean; reason: "before_deadline" | "low_coverage" | "ready" } {
  const deadline = filingDeadline(row.period);
  // 截止日当天仍允许申报:严格大于“截止日的次日 0 点”才算已过。
  if (!deadline || today.getTime() < deadline.getTime() + 86_400_000) return { ready: false, reason: "before_deadline" };
  if (row.coverageTotal <= 0 || row.coverageFiled / row.coverageTotal < READY_COVERAGE) return { ready: false, reason: "low_coverage" };
  return { ready: true, reason: "ready" };
}

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]));
  }
  return v;
}

export function payloadHash(p: ReportPayload): string {
  return createHash("sha256").update(JSON.stringify(stable(p))).digest("hex");
}

export type FinalizePlan =
  | { kind: "error"; message: string }
  | { kind: "preview"; to: "ops" }
  | { kind: "run"; freeze: boolean; sendLangs: ReportLang[]; to: "segments" | "ops" };

export function planFinalize(row: ReportRow | null, action: "preview" | "finalize", dryRun: boolean): FinalizePlan {
  if (!row) return { kind: "error", message: "该季度还没有报告行(尚无投资人申报?)" };
  if (action === "preview") {
    if (row.status === "final") return { kind: "error", message: "报告已定稿,不能再生成预览" };
    return { kind: "preview", to: "ops" };
  }
  if (!row.previewPayload) return { kind: "error", message: "还没有预览:先运行 action=preview" };
  if (dryRun) return { kind: "run", freeze: false, sendLangs: [...LANGS], to: "ops" };
  const pending = LANGS.filter((l) => !row.sends[l]);
  return { kind: "run", freeze: row.status === "live", sendLangs: pending, to: "segments" };
}
```

- [ ] **Step 4: 运行测试**

Run: `cd web && npx tsx src/lib/reports/readiness.check.ts && npx tsc --noEmit`
Expected: `readiness.check OK`；exit 0。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/reports/readiness.ts web/src/lib/reports/readiness.check.ts
git commit -m "feat(reports): 可定稿判断、payload 哈希与定稿发送计划(幂等、dry_run)"
```

---

### Task 4: 双语文案（页面与邮件共用）

**Files:**
- Create: `web/src/lib/reports/copy.ts`
- Test: `web/src/lib/reports/copy.check.ts`

**Interfaces:**
- Consumes: Task 1 类型；`quarterLabel`（`src/lib/freshness/derive.ts`）；`localePath`、`stockPath`、`investorPath`、`SITE_ORIGIN`（`src/lib/urls.ts`，用相对路径 `../urls`）
- Produces:
  - `reportTitle(period: string, lang: ReportLang): string`
  - `reportDescription(p: ReportPayload, status: ReportStatus, lang: ReportLang): string`（= 结论句）
  - `statusLine(row: { status: ReportStatus; coverageFiled: number; coverageTotal: number; finalizedAt: string | null }, lang): string`
  - `valuationNote(asOf: string | null, lang): string`
  - `emptyText(reason: EmptyReason, lang): string`
  - `kindLabel(kind: MoveKind, lang): string`
  - `sectionTitles(lang): { bought; sold; mostHeld; strikeZone; featured; method; source }`
  - `stockHref(s: ReportStock, lang): string | null`（ticker 为 null → null）
  - `reportUrl(period: string, lang): string`（绝对 URL）
  - `personName(f: FeaturedEntry, lang): string`
  - `pct(x: number): string`（`0.042` → `"4.2%"`）

- [ ] **Step 1: 写失败的测试**

`web/src/lib/reports/copy.check.ts`：

```ts
/** Run: cd web && npx tsx src/lib/reports/copy.check.ts */
import { reportTitle, reportDescription, statusLine, stockHref, reportUrl, pct, emptyText, kindLabel } from "./copy";
import type { ReportPayload } from "./types";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const p: ReportPayload = {
  schemaVersion: 1, period: "2026-09-30", coverage: { filed: 61, total: 97 },
  bought: { items: [{ key: "GOOG", ticker: "GOOG", issuer: "ALPHABET INC", managerCount: 12, netValue: 1, dominantKind: "increased" }], emptyReason: null },
  sold: { items: [], emptyReason: "no_qualifying" },
  mostHeld: { items: [{ key: "GOOG", ticker: "GOOG", issuer: "ALPHABET INC", holderCount: 17, holderDelta: 2 }], emptyReason: null },
  strikeZone: { items: [{ key: "X", ticker: "X", issuer: "X", holderCount: 2, position: "strike_zone", marginPct: 0.3 }], emptyReason: null },
  featured: [],
};

assert(reportTitle("2026-09-30", "en").includes("Q3 2026"), "en 标题含季度");
assert(reportTitle("2026-09-30", "zh").includes("Q3 2026"), "zh 标题含季度");

const enLive = reportDescription(p, "live", "en");
assert(enLive.includes("61 of 97"), `live 结论带覆盖率: ${enLive}`);
assert(enLive.includes("12 superinvestors") && enLive.includes("GOOG"), `买入条目以 ticker 出现: ${enLive}`);
assert(enLive.includes("17") && enLive.includes("+2"), "持有人数与环比");
assert(enLive.includes("1 stock"), `击球区单数: ${enLive}`);
const enFinal = reportDescription(p, "final", "en");
assert(!enFinal.includes("61 of 97"), "final 结论不带覆盖率前缀");
const zh = reportDescription(p, "live", "zh");
assert(zh.includes("97 位中 61 位") && zh.includes("12 位") && zh.includes("17 位"), `zh 结论: ${zh}`);
assert(!/—/.test(enLive + zh), "不出现 —");

const empty = reportDescription({ ...p, bought: { items: [], emptyReason: "no_filers" }, mostHeld: { items: [], emptyReason: "no_filers" }, strikeZone: { items: [], emptyReason: "no_filers" } }, "live", "en");
assert(empty.length > 0 && !empty.includes("undefined"), `全空也能出一句: ${empty}`);

assert(statusLine({ status: "live", coverageFiled: 61, coverageTotal: 97, finalizedAt: null }, "zh").includes("97 位中已有 61 位申报"), "zh live 状态条");
assert(statusLine({ status: "final", coverageFiled: 94, coverageTotal: 97, finalizedAt: "2026-11-18T03:00:00Z" }, "en").includes("2026-11-18"), "en final 状态条带日期");

assert(stockHref({ key: "C_UNRES", ticker: null, issuer: "MYSTERY" }, "en") === null, "未解析 ticker 不出链接");
assert(stockHref({ key: "GOOG", ticker: "GOOG", issuer: "A" }, "en") === "/stocks/GOOG", "en 链接无前缀");
assert(stockHref({ key: "GOOG", ticker: "GOOG", issuer: "A" }, "zh") === "/zh/stocks/GOOG", "zh 链接");
assert(reportUrl("2026-09-30", "en") === "https://thecompounder.fyi/learn/q3-2026-superinvestor-consensus", "en 绝对 URL");
assert(reportUrl("2026-09-30", "zh") === "https://thecompounder.fyi/zh/learn/q3-2026-superinvestor-consensus", "zh 绝对 URL");
assert(pct(0.042) === "4.2%" && pct(0) === "0%", "百分比");
assert(emptyText("no_valuation", "zh").length > 0 && kindLabel("exited", "en").length > 0, "标签非空");

console.log("copy.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx src/lib/reports/copy.check.ts`
Expected: FAIL（`./copy` 不存在）。

- [ ] **Step 3: 实现**

`web/src/lib/reports/copy.ts`（写完对照 `web/docs/copy-voice.md` 自检英文与中文各一遍）：

```ts
// 季度报告双语文案。页面与邮件都从这里取字,保证同一事实同一说法。
// 只描述已发生的申报与估值位置,不给买卖建议。
import { quarterLabel } from "../freshness/derive";
import { localePath, stockPath, SITE_ORIGIN } from "../urls";
import { reportSlug } from "./period";
import type { EmptyReason, FeaturedEntry, MoveKind, ReportLang, ReportPayload, ReportStatus, ReportStock } from "./types";

export const pct = (x: number): string => `${Number((x * 100).toFixed(1))}%`;
const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
const label = (s: ReportStock): string => s.ticker ?? s.issuer;

export function reportTitle(period: string, lang: ReportLang): string {
  const q = quarterLabel(period);
  return lang === "zh" ? `${q} 超级投资者共识报告` : `${q} Superinvestor Consensus Report`;
}

export function reportDescription(p: ReportPayload, status: ReportStatus, lang: ReportLang): string {
  const q = quarterLabel(p.period);
  const parts: string[] = [];
  const b = p.bought.items[0];
  const h = p.mostHeld.items[0];
  const sz = p.strikeZone.items.length;
  if (lang === "zh") {
    if (b) parts.push(`${b.managerCount} 位超级投资者新建或加仓 ${label(b)}`);
    if (h) parts.push(`持有人数最多的是 ${label(h)}（${h.holderCount} 位，较上季 ${signed(h.holderDelta)}）`);
    if (sz) parts.push(`被至少 2 位持有的股票中，有 ${sz} 只处在击球区或价值带以下`);
    const body = parts.length ? parts.join("；") : "已申报的投资人中暂无满足条件的共识动作";
    const prefix = status === "live" ? `截至目前（${p.coverage.total} 位中 ${p.coverage.filed} 位已申报）` : q;
    return `${prefix}：${body}。`;
  }
  if (b) parts.push(`${b.managerCount} superinvestors opened or added to ${label(b)}`);
  if (h) parts.push(`the most widely held stock is ${label(h)} (${h.holderCount} holders, ${signed(h.holderDelta)} vs. last quarter)`);
  if (sz) parts.push(`${sz} ${sz === 1 ? "stock" : "stocks"} held by two or more sit in the strike zone or below the value band`);
  const body = parts.length ? parts.join("; ") : "no consensus moves qualify among the funds that have filed";
  const prefix = status === "live" ? `So far (${p.coverage.filed} of ${p.coverage.total} filed)` : q;
  return `${prefix}: ${body}.`;
}

export function statusLine(
  row: { status: ReportStatus; coverageFiled: number; coverageTotal: number; finalizedAt: string | null },
  lang: ReportLang,
): string {
  const day = row.finalizedAt ? row.finalizedAt.slice(0, 10) : "";
  if (row.status === "live") {
    return lang === "zh"
      ? `${row.coverageTotal} 位中已有 ${row.coverageFiled} 位申报 · 每次有新申报后更新`
      : `${row.coverageFiled} of ${row.coverageTotal} have filed · updates after each new filing`;
  }
  return lang === "zh"
    ? `定稿于 ${day} · ${row.coverageTotal} 位中 ${row.coverageFiled} 位已申报`
    : `Final as of ${day} · ${row.coverageFiled} of ${row.coverageTotal} filed`;
}

export function valuationNote(asOf: string | null, lang: ReportLang): string {
  if (!asOf) return lang === "zh" ? "估值位置暂不可用。" : "Valuation positions are not available yet.";
  return lang === "zh" ? `价值位置按 ${asOf} 收盘价计算。` : `Valuation positions use closing prices as of ${asOf}.`;
}

export function emptyText(reason: EmptyReason, lang: ReportLang): string {
  const zh: Record<EmptyReason, string> = {
    no_filers: "本季还没有投资人申报。",
    no_qualifying: "本季暂无满足条件的股票。",
    no_valuation: "估值数据暂不可用，本节暂缺。",
  };
  const en: Record<EmptyReason, string> = {
    no_filers: "No tracked investor has filed for this quarter yet.",
    no_qualifying: "No stock meets the criteria this quarter.",
    no_valuation: "Valuation data is unavailable, so this section is empty for now.",
  };
  return (lang === "zh" ? zh : en)[reason];
}

export function kindLabel(kind: MoveKind, lang: ReportLang): string {
  const zh: Record<MoveKind, string> = { new: "新建仓", increased: "加仓", decreased: "减仓", exited: "清仓" };
  const en: Record<MoveKind, string> = { new: "New position", increased: "Added", decreased: "Trimmed", exited: "Sold out" };
  return (lang === "zh" ? zh : en)[kind];
}

export function sectionTitles(lang: ReportLang) {
  return lang === "zh"
    ? { bought: "共识买入", sold: "共识卖出", mostHeld: "持有人数最多", strikeZone: "被共同持有、处在击球区或价值带以下", featured: "名家动作", method: "方法与口径", source: "来源：SEC EDGAR 13F 申报" }
    : { bought: "Consensus buys", sold: "Consensus sells", mostHeld: "Most widely held", strikeZone: "Co-held stocks in the strike zone or below the value band", featured: "Notable investors", method: "Method and definitions", source: "Source: SEC EDGAR 13F filings" };
}

export function stockHref(s: ReportStock, lang: ReportLang): string | null {
  return s.ticker ? stockPath(lang, s.ticker) : null;
}

export function reportUrl(period: string, lang: ReportLang): string {
  return `${SITE_ORIGIN}${localePath(lang, `/learn/${reportSlug(period)}`)}`;
}

export function personName(f: FeaturedEntry, lang: ReportLang): string {
  return lang === "zh" && f.personZh ? f.personZh : f.person;
}
```

- [ ] **Step 4: 运行测试**

Run: `cd web && npx tsx src/lib/reports/copy.check.ts && npx tsc --noEmit`
Expected: `copy.check OK`；exit 0。若 `urls.ts` 的 `import type { Lang } from "@/lib/nav"` 在 tsx 下报解析错误，把 copy.ts 改为从 `../urls` 只取函数并确认 tsx 能解析 tsconfig paths（tsx 原生支持 `paths`；type-only import 会被擦除）。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/reports/copy.ts web/src/lib/reports/copy.check.ts
git commit -m "feat(reports): 报告双语文案(结论句、状态条、空板块原因、链接)"
```

---

### Task 5: 邮件渲染 + 冻结 payload fixture

**Files:**
- Create: `web/src/lib/reports/email.ts`
- Create: `web/src/lib/reports/fixtures/v1-final.json`
- Test: `web/src/lib/reports/email.check.ts`

**Interfaces:**
- Consumes: Task 1 类型；Task 4 全部 copy 函数
- Produces:
  - `type EmailMeta = { status: ReportStatus; coverageFiled: number; coverageTotal: number; finalizedAt: string | null; valuationAsOf: string | null; isFirstIssue: boolean; postalAddress?: string }`
  - `renderReportEmail(p: ReportPayload, meta: EmailMeta, lang: ReportLang): { subject: string; previewText: string; html: string; text: string }`
  - `UNSUBSCRIBE_TOKEN = "{{{RESEND_UNSUBSCRIBE_URL}}}"`

- [ ] **Step 1: 写 fixture**

`web/src/lib/reports/fixtures/v1-final.json`（v1 定稿样本；以后任何渲染改动都必须仍能渲染它）：

```json
{
  "schemaVersion": 1,
  "period": "2026-06-30",
  "coverage": { "filed": 94, "total": 97 },
  "bought": { "items": [
    { "key": "GOOG", "ticker": "GOOG", "issuer": "ALPHABET INC", "managerCount": 9, "netValue": 1200000000, "dominantKind": "increased" },
    { "key": "T", "ticker": "T", "issuer": "AT&T INC", "managerCount": 5, "netValue": 300000000, "dominantKind": "new" },
    { "key": "C_UNRES", "ticker": null, "issuer": "SMITH <&> \"JONES\" HOLDINGS", "managerCount": 2, "netValue": 1000000, "dominantKind": "new" }
  ], "emptyReason": null },
  "sold": { "items": [], "emptyReason": "no_qualifying" },
  "mostHeld": { "items": [
    { "key": "GOOG", "ticker": "GOOG", "issuer": "ALPHABET INC", "holderCount": 17, "holderDelta": 2 }
  ], "emptyReason": null },
  "strikeZone": { "items": [], "emptyReason": "no_valuation" },
  "featured": [
    { "slug": "berkshire-hathaway", "person": "Warren Buffett", "personZh": "巴菲特", "filed": true, "moves": [
      { "key": "AAPL", "ticker": "AAPL", "issuer": "APPLE INC", "kind": "decreased", "weightBefore": 0.28, "weightAfter": 0.22 }
    ] },
    { "slug": "scion-asset-management", "person": "Michael Burry", "personZh": null, "filed": false, "moves": [] }
  ]
}
```

- [ ] **Step 2: 写失败的测试**

`web/src/lib/reports/email.check.ts`：

```ts
/** Run: cd web && npx tsx src/lib/reports/email.check.ts */
import fs from "node:fs";
import path from "node:path";
import { renderReportEmail, UNSUBSCRIBE_TOKEN } from "./email";
import type { ReportPayload } from "./types";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const p = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/v1-final.json"), "utf8")) as ReportPayload;
const meta = { status: "final" as const, coverageFiled: 94, coverageTotal: 97, finalizedAt: "2026-10-25T00:00:00Z", valuationAsOf: "2026-10-24", isFirstIssue: true };

const en = renderReportEmail(p, meta, "en");
assert(en.subject.includes("Q2 2026"), `en subject: ${en.subject}`);
assert(en.previewText.length > 0 && en.previewText.length <= 200, "previewText 非空且不过长");
assert(en.html.includes(UNSUBSCRIBE_TOKEN) && en.text.includes(UNSUBSCRIBE_TOKEN), "退订占位符两版都有");
assert(en.html.includes("AT&amp;T INC") || en.html.includes(">T<"), "AT&T 转义或以 ticker 显示");
assert(en.html.includes("SMITH &lt;&amp;&gt; &quot;JONES&quot; HOLDINGS"), "未解析 issuer 在 HTML 中完整转义");
assert(!/<&>/.test(en.html), "HTML 中不出现未转义的 <&>");
assert(en.text.includes('SMITH <&> "JONES" HOLDINGS'), "纯文本版原样");
assert(!en.html.includes("/stocks/C_UNRES"), "未解析 ticker 不出链接");
assert(en.html.includes("https://thecompounder.fyi/learn/q2-2026-superinvestor-consensus"), "en 完整报告链接");
assert(en.html.includes("https://thecompounder.fyi/zh/learn/q2-2026-superinvestor-consensus"), "en 版顶部有中文版链接");
assert(/first issue/i.test(en.text), "首期提醒句");
assert(en.text.includes("2026-10-24"), "价值位置日期");
assert(/not investment advice/i.test(en.text), "不构成投资建议");
assert((en.html.match(/<tr/g) ?? []).length >= 3, "板块有表格行");

const zh = renderReportEmail(p, { ...meta, isFirstIssue: false }, "zh");
assert(zh.subject.includes("Q2 2026"), "zh subject");
assert(zh.html.includes("https://thecompounder.fyi/zh/learn/q2-2026-superinvestor-consensus"), "zh 完整报告链接");
assert(!zh.html.includes("中文版 →"), "zh 版不放中文版链接");
assert(!/这是第一期/.test(zh.text), "非首期不出现首期句");
assert(zh.text.includes("巴菲特"), "zh 用中文名");
assert(zh.text.includes("未申报"), "未申报名家标注");
assert(zh.text.includes("不构成投资建议"), "zh 免责");

const addr = renderReportEmail(p, { ...meta, postalAddress: "PO Box 1, Ann Arbor, MI" }, "en");
assert(addr.text.includes("PO Box 1"), "可选通讯地址");
assert(!en.text.includes("PO Box"), "未配置地址时不渲染");

console.log("email.check OK");
```

- [ ] **Step 3: 运行，确认失败**

Run: `cd web && npx tsx src/lib/reports/email.check.ts`
Expected: FAIL（`./email` 不存在）。

- [ ] **Step 4: 实现**

`web/src/lib/reports/email.ts`：

```ts
// 季度报告邮件(纯函数)。与报告页同一份 payload、同一套文案;表格式简单 HTML,兼容主流邮件客户端。
import {
  emptyText, kindLabel, personName, pct, reportDescription, reportTitle, reportUrl, sectionTitles, stockHref, valuationNote,
} from "./copy";
import { SITE_ORIGIN } from "../urls";
import type { EmptyReason, ReportLang, ReportPayload, ReportStatus, ReportStock } from "./types";

export const UNSUBSCRIBE_TOKEN = "{{{RESEND_UNSUBSCRIBE_URL}}}";
const EMAIL_TOP = 3;

export type EmailMeta = {
  status: ReportStatus;
  coverageFiled: number;
  coverageTotal: number;
  finalizedAt: string | null;
  valuationAsOf: string | null;
  isFirstIssue: boolean;
  postalAddress?: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function stockCellHtml(s: ReportStock, lang: ReportLang): string {
  const href = stockHref(s, lang);
  const name = esc(s.ticker ?? s.issuer);
  return href ? `<a href="${SITE_ORIGIN}${href}" style="color:#1a1a1a">${name}</a>` : name;
}
const stockText = (s: ReportStock) => s.ticker ?? s.issuer;

type Row = { cells: string[]; textCells: string[] };

function block(title: string, sec: { emptyReason: EmptyReason | null }, rows: Row[], lang: ReportLang) {
  const html = rows.length
    ? `<table role="presentation" width="100%" cellpadding="6" style="border-collapse:collapse;font-size:14px">${rows
        .map((r) => `<tr>${r.cells.map((c) => `<td style="border-bottom:1px solid #eee">${c}</td>`).join("")}</tr>`)
        .join("")}</table>`
    : `<p style="color:#666;font-size:14px">${esc(emptyText(sec.emptyReason ?? "no_qualifying", lang))}</p>`;
  const text = rows.length ? rows.map((r) => `- ${r.textCells.join(" · ")}`).join("\n") : emptyText(sec.emptyReason ?? "no_qualifying", lang);
  return {
    html: `<h2 style="font-size:16px;margin:24px 0 8px">${esc(title)}</h2>${html}`,
    text: `${title}\n${text}`,
  };
}

export function renderReportEmail(p: ReportPayload, meta: EmailMeta, lang: ReportLang) {
  const t = sectionTitles(lang);
  const zh = lang === "zh";
  const title = reportTitle(p.period, lang);
  const conclusion = reportDescription(p, meta.status, lang);
  const people = zh ? "位" : "funds";

  const moveRows = (items: typeof p.bought.items): Row[] =>
    items.slice(0, EMAIL_TOP).map((i) => ({
      cells: [stockCellHtml(i, lang), esc(`${i.managerCount} ${people}`), esc(kindLabel(i.dominantKind, lang))],
      textCells: [stockText(i), `${i.managerCount} ${people}`, kindLabel(i.dominantKind, lang)],
    }));
  const heldRows: Row[] = p.mostHeld.items.slice(0, EMAIL_TOP).map((i) => {
    const d = i.holderDelta > 0 ? `+${i.holderDelta}` : `${i.holderDelta}`;
    const c = zh ? `${i.holderCount} 位（较上季 ${d}）` : `${i.holderCount} holders (${d})`;
    return { cells: [stockCellHtml(i, lang), esc(c)], textCells: [stockText(i), c] };
  });
  const szRows: Row[] = p.strikeZone.items.slice(0, EMAIL_TOP).map((i) => {
    const pos = i.position === "strike_zone" ? (zh ? "击球区" : "Strike zone") : (zh ? "价值带以下" : "Below value band");
    const c = zh ? `${i.holderCount} 位持有` : `${i.holderCount} holders`;
    return { cells: [stockCellHtml(i, lang), esc(c), esc(pos)], textCells: [stockText(i), c, pos] };
  });
  const featRows: Row[] = p.featured.map((f) => {
    const name = personName(f, lang);
    const what = !f.filed
      ? (zh ? "未申报" : "Not filed yet")
      : f.moves.length
        ? f.moves.map((m) => `${kindLabel(m.kind, lang)} ${stockText(m)} ${pct(m.weightBefore)} → ${pct(m.weightAfter)}`).join(zh ? "；" : "; ")
        : (zh ? "本季无可比动作" : "No comparable moves");
    return { cells: [esc(name), esc(what)], textCells: [name, what] };
  });

  const blocks = [
    block(t.bought, p.bought, moveRows(p.bought.items), lang),
    block(t.sold, p.sold, moveRows(p.sold.items), lang),
    block(t.mostHeld, p.mostHeld, heldRows, lang),
    block(t.strikeZone, p.strikeZone, szRows, lang),
    block(t.featured, { emptyReason: "no_qualifying" }, featRows, lang),
  ];

  const url = reportUrl(p.period, lang);
  const zhLink = reportUrl(p.period, "zh");
  const first = meta.isFirstIssue
    ? (zh ? "你之前在 thecompounder.fyi 订阅了季度更新，这是第一期。" : "You subscribed to quarterly updates on thecompounder.fyi. This is the first issue.")
    : "";
  const cta = zh ? "看完整报告" : "Read the full report";
  const disclaimer = zh ? "仅供学习，不构成投资建议。" : "For education only. Not investment advice.";
  const unsub = zh ? "退订" : "Unsubscribe";
  const source = `${t.source} · ${valuationNote(meta.valuationAsOf, lang)}`;
  const addr = meta.postalAddress ? meta.postalAddress : "";

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#fff;color:#1a1a1a;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;line-height:1.5">
<div style="max-width:600px;margin:0 auto">
${zh ? "" : `<p style="font-size:13px;margin:0 0 12px"><a href="${zhLink}" style="color:#555">中文版 →</a></p>`}
${first ? `<p style="font-size:14px;color:#555">${esc(first)}</p>` : ""}
<h1 style="font-size:20px;margin:0 0 8px">${esc(title)}</h1>
<p style="font-size:15px">${esc(conclusion)}</p>
${blocks.map((b) => b.html).join("\n")}
<p style="margin:28px 0"><a href="${url}" style="background:#1a1a1a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px">${esc(cta)}</a></p>
<p style="font-size:12px;color:#666">${esc(source)}<br>${esc(disclaimer)}${addr ? `<br>${esc(addr)}` : ""}<br><a href="${UNSUBSCRIBE_TOKEN}" style="color:#666">${unsub}</a></p>
</div></body></html>`;

  const text = [
    zh ? "" : `中文版: ${zhLink}`,
    first,
    title,
    conclusion,
    ...blocks.map((b) => b.text),
    `${cta}: ${url}`,
    source,
    disclaimer,
    addr,
    `${unsub}: ${UNSUBSCRIBE_TOKEN}`,
  ].filter(Boolean).join("\n\n");

  const subject = zh
    ? `${title}：${p.coverage.filed} 家机构这季动了什么`
    : `${title}: what ${p.coverage.filed} funds did`;
  return { subject, previewText: conclusion.slice(0, 200), html, text };
}
```

- [ ] **Step 5: 运行测试**

Run: `cd web && npx tsx src/lib/reports/email.check.ts && npx tsc --noEmit`
Expected: `email.check OK`；exit 0。

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/reports/email.ts web/src/lib/reports/email.check.ts web/src/lib/reports/fixtures/v1-final.json
git commit -m "feat(reports): 报告邮件渲染(HTML 转义、退订占位、首期提醒)+ v1 冻结样本"
```

---

### Task 6: 取数与生成脚本（live 刷新 + 预览）

**Files:**
- Create: `web/scripts/lib/loadReportInput.ts`
- Create: `web/scripts/lib/reportDb.ts`
- Create: `web/scripts/report.ts`
- Create: `web/config/report-featured.json`
- Modify: `web/package.json`（scripts 加 `"report": "tsx scripts/report.ts"`）
- Test: `web/scripts/lib/loadReportInput.check.ts`

**Interfaces:**
- Consumes: `buildQuarterlyReport`（Task 2）；`payloadHash`、`reportReadiness`（Task 3）；`renderReportEmail`（Task 5）；`reportPeriodFor`（Task 1）；`latestDistinctPeriodFilings` 的同一规则；`freshness13F`、`globalLatestPeriod`；`isImplausibleBand`（`src/lib/valuation/deriveValuationVerdict.ts`）
- Produces:
  - `pickFilingsForPeriod(rows: FilingRow[], period: string): { current: FilingRow | null; prior: FilingRow | null }`（纯，导出供测试）
  - `loadReportInput(db, period: string): Promise<{ input: ReportInput; valuationAsOf: string | null }>`
  - `reportDb.readReport(db, period): Promise<ReportRow | null>`、`reportDb.mapRow(raw): ReportRow`
  - `sendPreview(db, row: ReportRow, payload: ReportPayload, valuationAsOf: string | null): Promise<void>`（`scripts/report.ts` 导出，Task 9 复用）
  - `env: Record<string, string>`、`makeDb(): SupabaseClient`（`scripts/report.ts` 导出，Task 9/10/12 复用）
  - `npm run report`：GitHub output `report_changed=true|false`

- [ ] **Step 1: 写失败的测试**

`web/scripts/lib/loadReportInput.check.ts`：

```ts
/** Run: cd web && npx tsx scripts/lib/loadReportInput.check.ts */
import { pickFilingsForPeriod } from "./loadReportInput";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const rows = [
  { id: 30, period: "2026-09-30", filed_at: "2026-11-10" },
  { id: 31, period: "2026-09-30", filed_at: "2026-11-20" }, // 同季修正件,更新
  { id: 20, period: "2026-06-30", filed_at: "2026-08-14" },
  { id: 10, period: "2026-03-31", filed_at: "2026-05-15" },
];
const a = pickFilingsForPeriod(rows, "2026-09-30");
assert(a.current?.id === 31, `current 取同季最新, got ${a.current?.id}`);
assert(a.prior?.id === 20, `prior 取早于 P 的最近一季, got ${a.prior?.id}`);

const b = pickFilingsForPeriod(rows, "2026-06-30");
assert(b.current?.id === 20 && b.prior?.id === 10, "历史季度 Q2:current Q2、prior Q1(不被更新的 Q3 干扰)");

const c = pickFilingsForPeriod(rows.filter((r) => r.period !== "2026-09-30"), "2026-09-30");
assert(c.current === null && c.prior?.id === 20, "未申报 P:current null");

const d = pickFilingsForPeriod([{ id: 5, period: "2026-09-30", filed_at: "2026-11-01" }], "2026-09-30");
assert(d.current?.id === 5 && d.prior === null, "新纳入:无更早申报");

const e = pickFilingsForPeriod([{ id: 1, period: "2026-09-30", filed_at: "2026-11-01" }, { id: 2, period: "2025-12-31", filed_at: "2026-02-10" }], "2026-09-30");
assert(e.prior?.period === "2025-12-31", "跳季:prior 取早于 P 的最近一季(与全站口径一致)");

console.log("loadReportInput.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx scripts/lib/loadReportInput.check.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写名家配置**

`web/config/report-featured.json`（slug 均已在 `config/managers.json` 中核对存在）：

```json
["berkshire-hathaway", "pershing-square", "scion-asset-management", "himalaya-capital", "hh-international", "baupost-group", "duquesne-family-office", "pabrai-funds", "oaktree", "fundsmith"]
```

- [ ] **Step 4: 实现取数**

`web/scripts/lib/loadReportInput.ts`：

```ts
// 按报告季度 P 取数。与 computeAndStoreConsensus 同一套表、同一套分页与去重规则,
// 区别只是 period 锁定在 P,而不是“每户最新两季”。
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { freshness13F, globalLatestPeriod } from "../../src/lib/freshness/derive";
import { isImplausibleBand } from "../../src/lib/valuation/deriveValuationVerdict";
import type { ReportHolding, ReportInput, ReportManagerInput } from "../../src/lib/reports/types";

type FilingRow = { id: number; period: string; filed_at: string | null };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readAll(db: any, table: string, cols: string, filter?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols);
    if (filter) q = filter(q);
    q = q.range(from, from + 999);
    const { data, error } = await q;
    if (error) throw new Error(`${table} read: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const newer = (a: FilingRow, b: FilingRow) => {
  const x = a.filed_at ?? "";
  const y = b.filed_at ?? "";
  return x > y || (x === y && a.id > b.id);
};

/** P 的申报(同季多份取最新)与早于 P 的最近一季申报。 */
export function pickFilingsForPeriod(rows: FilingRow[], period: string): { current: FilingRow | null; prior: FilingRow | null } {
  let current: FilingRow | null = null;
  let prior: FilingRow | null = null;
  for (const r of rows) {
    if (r.period === period) {
      if (!current || newer(r, current)) current = r;
    } else if (r.period < period) {
      if (!prior || r.period > prior.period || (r.period === prior.period && newer(r, prior))) prior = r;
    }
  }
  return { current, prior };
}

const toHolding = (h: any): ReportHolding => ({
  cusip: h.cusip, issuer: h.issuer, value: Number(h.value), shares: Number(h.shares),
  weight: Number(h.weight ?? 0), putCall: h.put_call ?? null,
});

export async function loadReportInput(db: any, period: string): Promise<{ input: ReportInput; valuationAsOf: string | null }> {
  const seeds = JSON.parse(fs.readFileSync(path.join(__dirname, "../../config/managers.json"), "utf8")) as Array<{ slug: string; people?: Array<{ name: string; zh?: string }> }>;
  const zhBySlug = new Map(seeds.map((s) => [s.slug, s.people?.[0]?.zh ?? null]));
  const featuredSlugs = JSON.parse(fs.readFileSync(path.join(__dirname, "../../config/report-featured.json"), "utf8")) as string[];

  const cusipMap = new Map<string, { ticker: string | null; name: string | null }>();
  for (const r of await readAll(db, "security_cusips", "cusip,ticker,issuer", (q) => q.order("cusip", { ascending: true })))
    cusipMap.set(r.cusip, { ticker: r.ticker, name: r.issuer });

  const managers = await readAll(db, "managers", "cik,slug,person", (q) => q.order("cik", { ascending: true }));
  const raw: Array<{ m: any; latestPeriod: string | null; current: FilingRow | null; prior: FilingRow | null }> = [];
  for (const m of managers) {
    const rows = (await readAll(db, "filings", "id,period,filed_at", (q) =>
      q.eq("cik", m.cik).order("period", { ascending: false }).order("id", { ascending: false }).limit(16),
    )) as FilingRow[];
    const latestPeriod = rows.reduce<string | null>((acc, r) => (!acc || r.period > acc ? r.period : acc), null);
    raw.push({ m, latestPeriod, ...pickFilingsForPeriod(rows, period) });
  }

  // 活跃口径与全站一致:相对全库最新季落后 ≥4 季的视为停报,整户剔除。
  const gl = globalLatestPeriod(raw.map((r) => r.latestPeriod));
  const active = raw.filter((r) => freshness13F(r.latestPeriod, gl) !== "inactive");

  const holdingsOf = async (f: FilingRow | null) =>
    f
      ? (await readAll(db, "holdings", "cusip,issuer,value,shares,weight,put_call", (q) => q.eq("filing_id", f.id).order("id", { ascending: true }))).map(toHolding)
      : null;

  const out: ReportManagerInput[] = [];
  for (const r of active) {
    out.push({
      slug: r.m.slug,
      person: r.m.person,
      personZh: zhBySlug.get(r.m.slug) ?? null,
      current: await holdingsOf(r.current),
      prior: await holdingsOf(r.prior),
    });
  }

  const { data: vrows, error: verr } = await db
    .from("valuation_snapshot")
    .select("ticker,range_lo,range_hi,price,price_date,margin_pct,in_strike_zone,verdict_bucket")
    .eq("reliable", true)
    .or("in_strike_zone.eq.true,verdict_bucket.eq.below")
    .limit(500);
  if (verr) throw new Error(`valuation_snapshot read: ${verr.message}`);
  const bargains = new Map<string, { inStrikeZone: boolean; marginPct: number }>();
  let valuationAsOf: string | null = null;
  for (const v of vrows ?? []) {
    const marginPct = v.margin_pct == null ? null : Number(v.margin_pct);
    if (marginPct == null || marginPct <= 0) continue;
    if (isImplausibleBand({ rangeLo: Number(v.range_lo), rangeHi: Number(v.range_hi), price: Number(v.price), marginPct })) continue;
    bargains.set(String(v.ticker).toUpperCase(), { inStrikeZone: !!v.in_strike_zone, marginPct });
    if (v.price_date && (!valuationAsOf || v.price_date > valuationAsOf)) valuationAsOf = v.price_date;
  }

  return { input: { period, managers: out, cusipMap, bargains, featuredSlugs }, valuationAsOf };
}
```

说明：击球区筛选条件与 `readBargainVerdicts`（`src/lib/valuation/valuationSnapshot.ts:109`）逐条一致（`reliable`、`in_strike_zone or below`、`margin_pct > 0`、`!isImplausibleBand`）。若 `isImplausibleBand` 所在文件在 tsx 下因 import 链报错，改为在该文件旁新建无依赖的 `plausibility.ts` 导出它、原文件 re-export。

- [ ] **Step 5: 实现行读写**

`web/scripts/lib/reportDb.ts`：

```ts
import type { ReportRow } from "../../src/lib/reports/types";

export function mapRow(r: any): ReportRow {
  return {
    period: r.period, status: r.status, payload: r.payload, payloadHash: r.payload_hash,
    coverageFiled: r.coverage_filed, coverageTotal: r.coverage_total, valuationAsOf: r.valuation_as_of,
    firstLiveAt: r.first_live_at, generatedAt: r.generated_at, previewPayload: r.preview_payload,
    previewValuationAsOf: r.preview_valuation_as_of, previewSentAt: r.preview_sent_at,
    finalizedAt: r.finalized_at, sends: r.sends ?? {},
  };
}

export async function readReport(db: any, period: string): Promise<ReportRow | null> {
  const { data, error } = await db.from("quarterly_reports").select("*").eq("period", period).maybeSingle();
  if (error) throw new Error(`quarterly_reports read: ${error.message}`);
  return data ? mapRow(data) : null;
}
```

- [ ] **Step 6: 实现生成脚本**

`web/scripts/report.ts`：

```ts
/**
 * 季度报告 live 刷新 + 可定稿时发预览。用法: npm run report [-- --period=2026-06-30]
 * ingest 之后运行。payload 不变则什么都不写(不刷缓存、不改 generated_at)。
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import { buildQuarterlyReport } from "../src/lib/reports/build";
import { payloadHash, reportReadiness } from "../src/lib/reports/readiness";
import { renderReportEmail } from "../src/lib/reports/email";
import { reportPeriodFor, reportSlug } from "../src/lib/reports/period";
import type { ReportPayload, ReportRow } from "../src/lib/reports/types";
import { loadReportInput } from "./lib/loadReportInput";
import { readReport } from "./lib/reportDb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}
export const env = loadEnv();

function setActionOutput(key: string, value: string) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${key}=${value}\n`);
}

export function makeDb() {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  return createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });
}

/** 把中英两版真实渲染的邮件发给站长,并记录这份 payload 作为待定稿版本。 */
export async function sendPreview(db: any, row: ReportRow, payload: ReportPayload, valuationAsOf: string | null): Promise<void> {
  const key = env.RESEND_API_KEY;
  const to = env.RESEND_ALERTS_TO;
  if (!key || !to) throw new Error("缺少 RESEND_API_KEY / RESEND_ALERTS_TO,无法发预览");
  const resend = new Resend(key);
  const from = env.RESEND_ALERTS_FROM || "Compounder Ops <ops@send.thecompounder.fyi>";
  const meta = { status: "final" as const, coverageFiled: payload.coverage.filed, coverageTotal: payload.coverage.total, finalizedAt: new Date().toISOString(), valuationAsOf, isFirstIssue: true, postalAddress: env.NEWSLETTER_POSTAL_ADDRESS || undefined };
  const how = `\n\n[预览] ${reportSlug(row.period)} · 覆盖 ${payload.coverage.filed}/${payload.coverage.total}\n确认无误后:GitHub → Actions → Report finalize & send → Run workflow(period=${row.period}, action=finalize)。\n想用更新的数据先跑 action=preview。`;
  for (const lang of ["en", "zh"] as const) {
    const e = renderReportEmail(payload, meta, lang);
    const { error } = await resend.emails.send({ from, to, subject: `[预览 ${lang}] ${e.subject}`, html: e.html, text: e.text + how });
    if (error) throw new Error(`预览发送失败(${lang}): ${error.message}`);
  }
  const { error } = await db.from("quarterly_reports")
    .update({ preview_payload: payload, preview_valuation_as_of: valuationAsOf, preview_sent_at: new Date().toISOString() })
    .eq("period", row.period).eq("status", "live");
  if (error) throw new Error(`记录预览失败: ${error.message}`);
}

async function main() {
  const db = makeDb();
  const arg = process.argv.find((a) => a.startsWith("--period="));
  const period = arg ? arg.slice("--period=".length) : reportPeriodFor(new Date());
  const { input, valuationAsOf } = await loadReportInput(db, period);
  const payload = buildQuarterlyReport(input);

  if (payload.coverage.filed === 0) {
    console.log(`[report] ${period}: 尚无投资人申报,不建行`);
    setActionOutput("report_changed", "false");
    return;
  }
  const hash = payloadHash(payload);
  const { data: result, error } = await db.rpc("upsert_live_report", {
    p_period: period, p_payload: payload, p_hash: hash,
    p_filed: payload.coverage.filed, p_total: payload.coverage.total, p_valuation_as_of: valuationAsOf,
  });
  if (error) throw new Error(`upsert_live_report 失败: ${error.message}`);
  console.log(`[report] ${period}: ${result} · 覆盖 ${payload.coverage.filed}/${payload.coverage.total}`);
  setActionOutput("report_changed", result === "inserted" || result === "updated" ? "true" : "false");

  const row = await readReport(db, period);
  if (!row || row.status !== "live" || row.previewSentAt) return;
  if (!reportReadiness(row, new Date()).ready) return;
  await sendPreview(db, row, row.payload, row.valuationAsOf);
  console.log(`[report] ${period}: 已满足定稿条件,预览已发给站长`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
```

`web/package.json` scripts 增加：

```json
"report": "tsx scripts/report.ts",
```

- [ ] **Step 7: 运行测试与本地真库试跑**

Run: `cd web && npx tsx scripts/lib/loadReportInput.check.ts && npx tsc --noEmit`
Expected: `loadReportInput.check OK`；exit 0。

本地试跑（需要仓库根 `.env.local` 有 Supabase 服务端密钥，且 Task 1 迁移已执行）：

Run: `cd web && npm run report -- --period=2026-06-30`
Expected: 打印 `[report] 2026-06-30: inserted · 覆盖 n/m`；再跑一次打印 `unchanged`。Q2 已过截止日：若覆盖率 ≥ 90%，会尝试发预览到 `RESEND_ALERTS_TO`；本地没有该 env 时会报错退出，这是预期行为（Task 12 彩排时再配）。

- [ ] **Step 8: Commit**

```bash
git add web/scripts/lib/loadReportInput.ts web/scripts/lib/loadReportInput.check.ts web/scripts/lib/reportDb.ts web/scripts/report.ts web/config/report-featured.json web/package.json
git commit -m "feat(reports): 按季度取数与 live 刷新脚本;满足定稿条件时发预览"
```

---

### Task 7: 报告页与刷新范围

**Files:**
- Create: `web/src/lib/reports/read.ts`
- Create: `web/src/components/reports/ReportArticle.tsx`
- Modify: `web/src/app/[lang]/learn/[slug]/page.tsx`
- Modify: `web/src/lib/revalidate/paths.ts`
- Modify: `web/src/app/api/revalidate/route.ts`
- Test: `web/scripts/revalidate-paths.check.ts`（已有，须仍通过）+ 手动 curl

**Interfaces:**
- Consumes: Task 1/4 全部；`getDb`、`hasSupabaseEnv`、`withRetry`（`src/lib/managers/db.ts`）
- Produces:
  - `readReportRow(period: string): Promise<ReportRow | null>`（React `cache`，任何异常返回 null 并 `console.error`）
  - `listReportPeriods(): Promise<Array<{ period: string; generatedAt: string; status: ReportStatus }>>`
  - `REPORT_PATHS`（`paths.ts` 导出，`DATA_DRIVEN_PATHS` 的子集）
  - `<ReportArticle row={ReportRow} lang={Lang} />`

- [ ] **Step 1: 读 Next 16 文档**

读 `web/node_modules/next/dist/docs/` 中关于 `generateStaticParams`、`dynamicParams`、`revalidate` 路由段配置和 `revalidatePath` 的章节。确认两点后再写代码：(a) 带 `export const revalidate` 的动态段页面，未在 `generateStaticParams` 中列出的 slug 首次访问时生成并缓存；(b) `revalidatePath("/[lang]/learn/[slug]", "page")` 会刷新该路由的全部已生成页面。

- [ ] **Step 2: 服务端读层**

`web/src/lib/reports/read.ts`：

```ts
import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb, withRetry } from "@/lib/managers/db";
import type { ReportRow, ReportStatus } from "./types";

function mapRow(r: Record<string, any>): ReportRow {
  return {
    period: r.period, status: r.status, payload: r.payload, payloadHash: r.payload_hash,
    coverageFiled: r.coverage_filed, coverageTotal: r.coverage_total, valuationAsOf: r.valuation_as_of,
    firstLiveAt: r.first_live_at, generatedAt: r.generated_at, previewPayload: null,
    previewValuationAsOf: null, previewSentAt: null, finalizedAt: r.finalized_at, sends: {},
  };
}

/** 读一份报告。页面只需要公开字段:不取 preview_* 与 sends(既省 egress,也不把未定稿预览暴露到页面)。 */
export const readReportRow = cache(async (period: string): Promise<ReportRow | null> => {
  if (!hasSupabaseEnv()) return null;
  try {
    const { data, error } = await withRetry(() =>
      getDb().from("quarterly_reports")
        .select("period,status,payload,payload_hash,coverage_filed,coverage_total,valuation_as_of,first_live_at,generated_at,finalized_at")
        .eq("period", period).maybeSingle(),
    );
    if (error) {
      const code = (error as { code?: string }).code;
      if (code !== "42P01" && code !== "PGRST205") console.error(`readReportRow 失败: ${(error as Error).message}`);
      return null;
    }
    return data ? mapRow(data) : null;
  } catch (e) {
    console.error(`readReportRow 异常: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
});

export const listReportPeriods = cache(async (): Promise<Array<{ period: string; generatedAt: string; status: ReportStatus }>> => {
  if (!hasSupabaseEnv()) return [];
  try {
    const { data, error } = await withRetry(() =>
      getDb().from("quarterly_reports").select("period,generated_at,status").order("period", { ascending: false }),
    );
    if (error) return [];
    return (data ?? []).map((r: any) => ({ period: r.period, generatedAt: r.generated_at, status: r.status }));
  } catch {
    return [];
  }
});
```

- [ ] **Step 3: 报告页组件**

`web/src/components/reports/ReportArticle.tsx`（RSC；样式沿用 learn/ProseDoc 的 token 与 class；写前看一眼 `src/components/legal/ProseDoc.tsx` 的版式并对齐宽度 `max-w-[720px]`）：

```tsx
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { investorPath, localePath } from "@/lib/urls";
import {
  emptyText, kindLabel, personName, pct, reportDescription, reportTitle, sectionTitles, statusLine, stockHref, valuationNote,
} from "@/lib/reports/copy";
import type { ReportRow, ReportStock, Section } from "@/lib/reports/types";

function StockCell({ s, lang }: { s: ReportStock; lang: Lang }) {
  const href = stockHref(s, lang);
  const name = s.ticker ?? s.issuer;
  return href ? (
    <Link href={href} className="text-[var(--tt-text)] underline decoration-[var(--tt-faint)] underline-offset-2 hover:text-[var(--tt-accent)]">{name}</Link>
  ) : (
    <span>{name}</span>
  );
}

function Block<T>({ title, source, sec, lang, children }: { title: string; source: string; sec: Section<T>; lang: Lang; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-4 border-b border-[var(--tt-border)] pb-2">
        <h2 className="text-lg font-medium text-[var(--tt-text)]">{title}</h2>
        <span className="font-data text-xs text-[var(--tt-muted)]">{source}</span>
      </div>
      {sec.items.length ? children : <p className="mt-3 text-[15px] text-[var(--tt-muted)]">{emptyText(sec.emptyReason ?? "no_qualifying", lang)}</p>}
    </section>
  );
}

const th = "py-2 pr-3 text-left text-xs font-normal text-[var(--tt-muted)]";
const td = "py-2 pr-3 text-[15px] text-[var(--tt-text)] border-t border-[var(--tt-border)]";

export default function ReportArticle({ row, lang }: { row: ReportRow; lang: Lang }) {
  const p = row.payload;
  const t = sectionTitles(lang);
  const zh = lang === "zh";
  const src = `SEC EDGAR · ${p.period}`;
  const filedNote = row.status === "live" ? (zh ? `已申报的 ${p.coverage.filed} 位中` : `Among the ${p.coverage.filed} that have filed`) : "";

  const moveTable = (items: typeof p.bought.items) => (
    <table className="mt-3 w-full">
      <thead><tr><th className={th}>{zh ? "股票" : "Stock"}</th><th className={th}>{zh ? "人数" : "Funds"}</th><th className={th}>{zh ? "主要动作" : "Main move"}</th></tr></thead>
      <tbody>{items.map((i) => (
        <tr key={i.key}><td className={td}><StockCell s={i} lang={lang} /></td><td className={`${td} font-data`}>{i.managerCount}</td><td className={td}>{kindLabel(i.dominantKind, lang)}</td></tr>
      ))}</tbody>
    </table>
  );

  return (
    <article className="mx-auto max-w-[720px] py-8 sm:py-10">
      <p className="tt-eyebrow">{zh ? "季度报告" : "Quarterly report"}</p>
      <h1 className="mt-2 text-balance text-3xl font-medium leading-tight text-[var(--tt-text)]">{reportTitle(p.period, lang)}</h1>
      <p className="mt-3 font-data text-xs text-[var(--tt-muted)]">{statusLine(row, lang)}</p>
      <p className="mt-5 text-lg leading-relaxed text-[var(--tt-text)]">{reportDescription(p, row.status, lang)}</p>
      {filedNote ? <p className="mt-2 text-sm text-[var(--tt-muted)]">{zh ? "申报季进行中，下表计数均以已申报者为准，不是终值。" : "Filing season is in progress. Counts below cover only funds that have filed and are not final."}</p> : null}

      <Block title={t.bought} source={src} sec={p.bought} lang={lang}>{moveTable(p.bought.items)}</Block>
      <Block title={t.sold} source={src} sec={p.sold} lang={lang}>{moveTable(p.sold.items)}</Block>

      <Block title={t.mostHeld} source={src} sec={p.mostHeld} lang={lang}>
        <table className="mt-3 w-full">
          <thead><tr><th className={th}>{zh ? "股票" : "Stock"}</th><th className={th}>{zh ? "持有人数" : "Holders"}</th><th className={th}>{zh ? "较上季" : "vs. last quarter"}</th></tr></thead>
          <tbody>{p.mostHeld.items.map((i) => (
            <tr key={i.key}><td className={td}><StockCell s={i} lang={lang} /></td><td className={`${td} font-data`}>{i.holderCount}</td><td className={`${td} font-data`}>{i.holderDelta > 0 ? `+${i.holderDelta}` : i.holderDelta}</td></tr>
          ))}</tbody>
        </table>
      </Block>

      <Block title={t.strikeZone} source={valuationNote(row.valuationAsOf, lang)} sec={p.strikeZone} lang={lang}>
        <table className="mt-3 w-full">
          <thead><tr><th className={th}>{zh ? "股票" : "Stock"}</th><th className={th}>{zh ? "持有人数" : "Holders"}</th><th className={th}>{zh ? "位置" : "Position"}</th></tr></thead>
          <tbody>{p.strikeZone.items.map((i) => (
            <tr key={i.key}><td className={td}><StockCell s={i} lang={lang} /></td><td className={`${td} font-data`}>{i.holderCount}</td><td className={td}>{i.position === "strike_zone" ? (zh ? "击球区" : "Strike zone") : (zh ? "价值带以下" : "Below value band")}</td></tr>
          ))}</tbody>
        </table>
      </Block>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4 border-b border-[var(--tt-border)] pb-2">
          <h2 className="text-lg font-medium text-[var(--tt-text)]">{t.featured}</h2>
          <span className="font-data text-xs text-[var(--tt-muted)]">{src}</span>
        </div>
        <ul className="mt-3 flex flex-col gap-3">
          {p.featured.map((f) => (
            <li key={f.slug} className="text-[15px] text-[var(--tt-text)]">
              <Link href={investorPath(lang, f.slug)} className="font-medium text-[var(--tt-text)] hover:text-[var(--tt-accent)]">{personName(f, lang)}</Link>
              <span className="text-[var(--tt-muted)]">{zh ? "：" : ": "}</span>
              {!f.filed
                ? <span className="text-[var(--tt-muted)]">{zh ? "未申报" : "Not filed yet"}</span>
                : f.moves.length === 0
                  ? <span className="text-[var(--tt-muted)]">{zh ? "本季无可比动作（缺上一季申报）" : "No comparable moves (no prior filing)"}</span>
                  : f.moves.map((m, i) => (
                      <span key={m.key}>{i ? (zh ? "；" : "; ") : ""}{kindLabel(m.kind, lang)} <StockCell s={m} lang={lang} /> <span className="font-data">{pct(m.weightBefore)} → {pct(m.weightAfter)}</span></span>
                    ))}
            </li>
          ))}
        </ul>
      </section>

      <details className="mt-10 border-t border-[var(--tt-border)] pt-4">
        <summary className="cursor-pointer text-[15px] font-medium text-[var(--tt-text)]">{t.method}</summary>
        <div className="mt-3 flex flex-col gap-2 text-[15px] leading-relaxed text-[var(--ink-2)]">
          {(zh ? [
            `数据来自 SEC EDGAR 上的 13F 申报，覆盖本站跟踪的 ${p.coverage.total} 位活跃超级投资者（一年以上未申报者不计）。同季有修正申报时取合并后的版本。`,
            "共识买入 / 卖出：统计本季相对上一季新建仓或加仓 / 减仓或清仓的投资人数，期权不计；没有更早申报可比的投资人不计入买卖。",
            "持有人数“较上季”：只在本季已申报、且有上一季申报的同一批投资人内比较，避免申报季中有人尚未申报造成虚降。",
            `击球区与价值带：来自本站估值引擎的保守价值区间，只取数据可靠的结果。${valuationNote(row.valuationAsOf, lang)}这里只描述价格相对价值区间的位置，不构成买卖建议。`,
            row.status === "final" ? "本报告定稿后不再随迟到申报或修正申报变化；最新情况见实时共识页。" : "申报季结束、覆盖率达标后，本报告会定稿冻结。",
          ] : [
            `Data comes from 13F filings on SEC EDGAR for the ${p.coverage.total} active superinvestors this site tracks (funds silent for a year or more are excluded). Where a quarter was amended, the merged version is used.`,
            "Consensus buys / sells count the funds that opened or added to / trimmed or sold out of a position versus the prior quarter. Options are excluded, and funds with no earlier filing to compare against are left out of buys and sells.",
            "Holder change vs. last quarter compares the same funds only: those that have filed this quarter and also filed the prior one, so funds that have not filed yet do not drag counts down.",
            `Strike zone and value band come from this site's conservative valuation range, using reliable results only. ${valuationNote(row.valuationAsOf, lang)} They describe where price sits relative to value and are not a recommendation.`,
            row.status === "final" ? "This report is frozen once final; later or amended filings do not change it. See the live consensus page for the current picture." : "Once the filing season closes and coverage is high enough, this report will be finalized and frozen.",
          ]).map((s) => <p key={s.slice(0, 24)}>{s}</p>)}
          <p>
            <Link href={localePath(lang, "/investors/consensus")} className="text-[var(--tt-accent)]">{zh ? "实时共识页 →" : "Live consensus page →"}</Link>
          </p>
        </div>
      </details>

      <p className="mt-8 font-data text-xs text-[var(--tt-muted)]">{t.source} · {zh ? "仅供学习，不构成投资建议。" : "For education only. Not investment advice."}</p>
    </article>
  );
}
```


- [ ] **Step 4: learn/[slug] 加报告分支**

修改 `web/src/app/[lang]/learn/[slug]/page.tsx`：

1. 顶部增加：

```ts
import { parseReportSlug } from "@/lib/reports/period";
import { readReportRow, listReportPeriods } from "@/lib/reports/read";
import { reportTitle, reportDescription } from "@/lib/reports/copy";
import { reportSlug } from "@/lib/reports/period";
import ReportArticle from "@/components/reports/ReportArticle";

// 报告页读库:ingest / 定稿后由 /api/revalidate?source=report 按需刷新;7 天兜底。
export const revalidate = 604800;
```

2. `generateStaticParams` 改为 async，追加报告 slug：

```ts
export async function generateStaticParams() {
  const reports = (await listReportPeriods()).map((r) => reportSlug(r.period));
  return [...ARTICLE_SLUGS, ...reports].flatMap((slug) => [
    { lang: "en", slug },
    { lang: "zh", slug },
  ]);
}
```

3. `generateMetadata` 在 `getArticle` 之前：

```ts
  const reportPeriod = !getArticle(slug, lang) ? parseReportSlug(slug) : null;
  if (reportPeriod) {
    const row = await readReportRow(reportPeriod);
    if (!row) return {};
    return {
      title: `${reportTitle(row.period, lang)} — Compounder`,
      description: reportDescription(row.payload, row.status, lang),
      alternates: altFor(lang, `/learn/${slug}`),
    };
  }
```

4. `ArticlePage` 在 `const article = getArticle(slug, lang);` 之前：

```tsx
  const reportPeriod = !getArticle(slug, lang) ? parseReportSlug(slug) : null;
  if (reportPeriod) {
    const row = await readReportRow(reportPeriod);
    if (!row) notFound();
    const url = absoluteUrl(localePath(lang, `/learn/${slug}`));
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: reportTitle(row.period, lang),
      description: reportDescription(row.payload, row.status, lang),
      image: `${url}/opengraph-image`,
      datePublished: row.firstLiveAt,
      dateModified: row.generatedAt,
      inLanguage: lang === "zh" ? "zh-CN" : "en",
      author: { "@type": "Organization", name: "Compounder", url: "https://thecompounder.fyi" },
      publisher: { "@type": "Organization", name: "Compounder", logo: { "@type": "ImageObject", url: "https://thecompounder.fyi/icon.png" } },
      mainEntityOfPage: url,
    };
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <ReportArticle row={row} lang={lang} />
      </>
    );
  }
```

手写文章优先：Q1 的 `q1-2026-superinvestor-consensus` 在 `ARTICLES` 中，永远走原分支。

- [ ] **Step 5: 刷新范围**

`web/src/lib/revalidate/paths.ts`：在 `DATA_DRIVEN_PATHS` 中加入 `"/[lang]/learn/[slug]"`（learn 首页在 Task 8 加），并追加导出：

```ts
/**
 * 报告刷新只碰 learn 下的页面(十几页),不触发整站 ~2200 页重新生成,
 * 避免把 Vercel Hobby 的 ISR Writes 额度用穿。必须是 DATA_DRIVEN_PATHS 的子集。
 */
export const REPORT_PATHS = ["/[lang]/learn/[slug]"] as const satisfies readonly (typeof DATA_DRIVEN_PATHS)[number][];
```

`web/src/app/api/revalidate/route.ts`：把 for 循环改为：

```ts
  const paths: readonly string[] = source === "report" ? REPORT_PATHS : DATA_DRIVEN_PATHS;
  for (const path of paths) {
    revalidatePath(path, "page");
  }
```

并更新 import 与返回体 `revalidated: paths`；同时把文件头注释里“`source` 仅用于回显”改为“`source=report` 只刷新报告相关页，其余来源刷新全部数据页”。

- [ ] **Step 6: 验证**

Run: `cd web && npx tsx scripts/revalidate-paths.check.ts && npx tsc --noEmit && npm run build`
Expected: check OK（`/[lang]/learn/[slug]` 已带 revalidate 且已登记）；tsc exit 0；build 通过。

本地（`.env.local` 有 Supabase、Task 6 已为 Q2 建行）：

```bash
cd web && npm run dev
curl -s http://localhost:3000/learn/q2-2026-superinvestor-consensus | grep -o 'Q2 2026 Superinvestor Consensus Report' | head -1
curl -s http://localhost:3000/zh/learn/q2-2026-superinvestor-consensus | grep -o '持有人数最多' | head -1
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/learn/q4-2030-superinvestor-consensus
curl -s http://localhost:3000/learn/q1-2026-superinvestor-consensus | grep -o 'Last updated' | head -1
```
Expected：前两条各输出一次标题/标签（SSR 可见）；第三条 `404`；第四条确认 Q1 手写文章不受影响。

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/reports/read.ts web/src/components/reports/ReportArticle.tsx "web/src/app/[lang]/learn/[slug]/page.tsx" web/src/lib/revalidate/paths.ts web/src/app/api/revalidate/route.ts
git commit -m "feat(reports): 季度报告页(learn 路由分支、SSR 四板块、方法 details),source=report 只刷 learn"
```

---

### Task 8: 报告入口：Learn 首页、sitemap、OG、首页 masthead

**Files:**
- Modify: `web/src/app/[lang]/learn/page.tsx`
- Modify: `web/src/lib/revalidate/paths.ts`（加 `"/[lang]/learn"` 到两个清单）
- Modify: `web/src/app/sitemap.ts:70-72`
- Modify: `web/src/app/[lang]/learn/[slug]/opengraph-image.tsx`
- Modify: `web/src/components/home/HeroMasthead.tsx:115-143`

**Interfaces:**
- Consumes: `listReportPeriods`、`readReportRow`（Task 7）；`reportSlug`、`reportTitle`、`reportDescription`（Task 1/4）
- Produces: 无新导出

- [ ] **Step 1: Learn 首页“最新”位放最新报告**

`web/src/app/[lang]/learn/page.tsx`：
- 加 `export const revalidate = 604800;`
- 组件改 async 已是；在 `const latest = getLatest(lang);` 之后：

```ts
  const [newestReport] = await listReportPeriods();
  const reportRow = newestReport ? await readReportRow(newestReport.period) : null;
  const latestCard = reportRow
    ? {
        slug: reportSlug(reportRow.period),
        title: reportTitle(reportRow.period, lang),
        description: reportDescription(reportRow.payload, reportRow.status, lang),
        updated: reportRow.generatedAt.slice(0, 10),
      }
    : latest;
```

- “最新”区块把 `latest` 全部替换为 `latestCard`。当最新报告占据“最新”位时，原 `latest` 手写文章保留在 `rest` 中：把 `listRest(lang)` 换成 `reportRow ? listArticles(lang).filter((a) => a.slug !== FEATURED_SLUG) : listRest(lang)`（import `listArticles`、`FEATURED_SLUG`）。

`web/src/lib/revalidate/paths.ts`：`DATA_DRIVEN_PATHS` 加 `"/[lang]/learn"`；`REPORT_PATHS` 改为 `["/[lang]/learn/[slug]", "/[lang]/learn"]`。

- [ ] **Step 2: sitemap**

`web/src/app/sitemap.ts` 在 `for (const slug of ARTICLE_SLUGS)` 循环之后追加（`entry` 的第 4 个参数是 lastModified，见文件第 32 行签名）：

```ts
  for (const r of await listReportPeriods()) {
    const slug = reportSlug(r.period);
    if (ARTICLE_SLUGS.includes(slug)) continue; // 手写版优先(Q1)
    urls.push(entry(`/learn/${slug}`, "weekly", 0.7, r.generatedAt.slice(0, 10)));
  }
```

若 `entry` 签名不是 `(path, changefreq, priority, lastModified?)`，按文件中实际签名传参。

- [ ] **Step 3: OG 图**

`web/src/app/[lang]/learn/[slug]/opengraph-image.tsx`：在 `const article = getArticle(slug, lang);` 之后：

```ts
  const reportPeriod = !article ? parseReportSlug(slug) : null;
  if (reportPeriod) {
    const row = await readReportRow(reportPeriod);
    return ogCard({
      eyebrow: lang === "zh" ? "季度报告" : "Quarterly report",
      title: reportTitle(reportPeriod, lang),
      subtitle: row ? clamp(reportDescription(row.payload, row.status, lang), 110) : undefined,
    });
  }
```

（OG 图仍是 force-static + 7 天；报告结论在申报季中变化时 OG 可能落后，可接受，标题不变。）

- [ ] **Step 4: 首页 masthead 链接**

`web/src/components/home/HeroMasthead.tsx`：在 `filingProgressText` 段落内追加链接（申报季进度行出现时，报告必然已有行，因为至少 1 位已申报新季）：

```tsx
        {filingProgressText && filing && (
          <p className="mt-1.5 font-data text-xs text-[var(--tt-muted)]">
            {filingProgressText}{" "}
            <Link href={localePath(lang, `/learn/${reportSlug(filing.maxPeriod)}`)} className="text-[var(--tt-accent)] no-underline hover:underline">
              {lang === "zh" ? `${quarterLabel(filing.maxPeriod)} 报告 →` : `${quarterLabel(filing.maxPeriod)} report →`}
            </Link>
          </p>
        )}
```

替换原 `{filingProgressText && (...)}` 段；补 `Link`、`localePath`、`reportSlug` 的 import。`filing.maxPeriod` 字段名以 `EffectiveMovesPeriod` 类型为准（`src/lib/freshness/derive.ts:108`）。

- [ ] **Step 5: 验证**

Run: `cd web && npx tsx scripts/revalidate-paths.check.ts && npx tsc --noEmit && npm run build`
Expected: 全部通过。

```bash
cd web && npm run dev
curl -s http://localhost:3000/learn | grep -o 'Q2 2026 Superinvestor Consensus Report' | head -1
curl -s http://localhost:3000/sitemap.xml | grep -o 'q2-2026-superinvestor-consensus' | head -2
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:3000/learn/q2-2026-superinvestor-consensus/opengraph-image
```
Expected：Learn 首页出现报告标题；sitemap 有 en/zh 两条；OG 返回 `200 image/png`。

- [ ] **Step 6: Commit**

```bash
git add "web/src/app/[lang]/learn/page.tsx" web/src/lib/revalidate/paths.ts web/src/app/sitemap.ts "web/src/app/[lang]/learn/[slug]/opengraph-image.tsx" web/src/components/home/HeroMasthead.tsx
git commit -m "feat(reports): 报告入口——Learn 最新位、sitemap、OG 结论句、首页申报季进度行链接"
```

---

### Task 9: 定稿与群发

**Files:**
- Create: `web/scripts/report-finalize-send.ts`
- Create: `.github/workflows/report-finalize-send.yml`
- Modify: `web/package.json`（加 `"report:finalize": "tsx scripts/report-finalize-send.ts"`）

**Interfaces:**
- Consumes: `planFinalize`（Task 3）；`renderReportEmail`（Task 5）；`readReport`（Task 6）；`makeDb`、`env`、`sendPreview`（`scripts/report.ts`）；`loadReportInput`、`buildQuarterlyReport`
- Produces: CLI `npm run report:finalize -- --period=YYYY-MM-DD --action=preview|finalize [--dry-run]`

- [ ] **Step 1: 实现**

`web/scripts/report-finalize-send.ts`：

```ts
/**
 * 定稿并群发。用法:
 *   npm run report:finalize -- --period=2026-09-30 --action=preview
 *   npm run report:finalize -- --period=2026-09-30 --action=finalize [--dry-run]
 * 决策全部在 planFinalize(纯函数,有测试);这里只执行。可安全重跑。
 */
import { Resend } from "resend";
import { planFinalize } from "../src/lib/reports/readiness";
import { renderReportEmail } from "../src/lib/reports/email";
import { buildQuarterlyReport } from "../src/lib/reports/build";
import { reportSlug } from "../src/lib/reports/period";
import type { ReportLang } from "../src/lib/reports/types";
import { loadReportInput } from "./lib/loadReportInput";
import { readReport } from "./lib/reportDb";
import { env, makeDb, sendPreview } from "./report";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];

async function revalidateReport() {
  if (!env.INGEST_SECRET) { console.warn("缺 INGEST_SECRET,跳过刷新缓存"); return; }
  const res = await fetch("https://thecompounder.fyi/api/revalidate?source=report", { method: "POST", headers: { Authorization: `Bearer ${env.INGEST_SECRET}` } });
  if (!res.ok) throw new Error(`revalidate 失败: ${res.status}`);
}

async function main() {
  const period = arg("period");
  const action = (arg("action") ?? "finalize") as "preview" | "finalize";
  const dryRun = process.argv.includes("--dry-run");
  if (!period || !/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new Error("需要 --period=YYYY-MM-DD");
  const db = makeDb();
  const row = await readReport(db, period);
  const plan = planFinalize(row, action, dryRun);
  console.log(`[finalize] ${period} action=${action} dryRun=${dryRun} → ${JSON.stringify(plan)}`);

  if (plan.kind === "error") throw new Error(plan.message);
  if (plan.kind === "preview") {
    const { input, valuationAsOf } = await loadReportInput(db, period);
    await sendPreview(db, row!, buildQuarterlyReport(input), valuationAsOf);
    console.log("[finalize] 新预览已发给站长");
    return;
  }

  if (plan.freeze) {
    const { data: ok, error } = await db.rpc("finalize_report", { p_period: period });
    if (error) throw new Error(`finalize_report 失败: ${error.message}`);
    if (!ok) throw new Error("定稿未生效(状态已变化?)— 重新读取后再试");
    await revalidateReport();
    console.log("[finalize] 已冻结并刷新报告页");
  }
  if (plan.sendLangs.length === 0) { console.log("[finalize] 无需发送"); return; }

  const fresh = (await readReport(db, period))!;
  const payload = dryRun ? fresh.previewPayload! : fresh.payload;
  const valuationAsOf = dryRun ? fresh.previewValuationAsOf : fresh.valuationAsOf;
  const { data: others, error: oErr } = await db.from("quarterly_reports").select("period,sends");
  if (oErr) throw new Error(`读历史发送记录失败: ${oErr.message}`);
  const priorIssues = (others ?? []).filter((r: any) => r.period !== period && Object.keys(r.sends ?? {}).length > 0).length;
  const meta = {
    status: "final" as const, coverageFiled: payload.coverage.filed, coverageTotal: payload.coverage.total,
    finalizedAt: fresh.finalizedAt ?? new Date().toISOString(), valuationAsOf,
    isFirstIssue: priorIssues === 0, postalAddress: env.NEWSLETTER_POSTAL_ADDRESS || undefined,
  };

  const resend = new Resend(env.RESEND_AUDIENCE_API_KEY);
  const from = "Compounder <newsletter@send.thecompounder.fyi>";
  const segment: Record<ReportLang, string | undefined> = { en: env.RESEND_SEGMENT_EN_ID, zh: env.RESEND_SEGMENT_ZH_ID };

  for (const lang of plan.sendLangs) {
    const e = renderReportEmail(payload, meta, lang);
    if (plan.to === "ops") {
      const ops = new Resend(env.RESEND_API_KEY);
      const { error } = await ops.emails.send({ from, to: env.RESEND_ALERTS_TO, subject: `[dry-run ${lang}] ${e.subject}`, html: e.html, text: e.text });
      if (error) throw new Error(`dry-run 发送失败(${lang}): ${error.message}`);
      console.log(`[finalize] dry-run ${lang} 已发给站长`);
      continue;
    }
    if (!env.RESEND_AUDIENCE_API_KEY || !segment[lang]) throw new Error(`缺 RESEND_AUDIENCE_API_KEY 或 ${lang} segment id`);
    const created = await resend.broadcasts.create({
      segmentId: segment[lang]!, from, replyTo: env.NEWSLETTER_REPLY_TO || undefined,
      subject: e.subject, previewText: e.previewText, html: e.html, text: e.text,
      name: `${reportSlug(period)}-${lang}`,
    });
    if (created.error || !created.data) throw new Error(`broadcast 创建失败(${lang}): ${created.error?.message}`);
    const sent = await resend.broadcasts.send(created.data.id);
    if (sent.error) throw new Error(`broadcast 发送失败(${lang}): ${sent.error.message}`);
    const sends = { ...(await readReport(db, period))!.sends, [lang]: { broadcastId: created.data.id, sentAt: new Date().toISOString() } };
    const { error } = await db.from("quarterly_reports").update({ sends }).eq("period", period);
    if (error) throw new Error(`记录发送失败(${lang}),broadcast ${created.data.id} 已发出 — 手动补记,勿重跑该语言: ${error.message}`);
    console.log(`[finalize] ${lang} 已群发 broadcast ${created.data.id}`);
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
```

`isFirstIssue` 用“其它季度是否发过”判断：Q2 彩排只走 dry-run、不写 `sends`，所以 Q3 正式发送时仍是首期。`scripts/report.ts` 的 `main()` 只在直接运行时执行（已用 `isMain` 守卫），被 import 时不会跑。

- [ ] **Step 2: workflow**

`.github/workflows/report-finalize-send.yml`：

```yaml
name: Report finalize & send
on:
  workflow_dispatch:
    inputs:
      period:
        description: "报告季度季末日,如 2026-09-30"
        required: true
      action:
        description: "preview = 用当前数据重发预览;finalize = 冻结预览版本并群发"
        type: choice
        options: [finalize, preview]
        default: finalize
      dry_run:
        description: "只发给站长,不改状态(彩排用)"
        type: boolean
        default: false
concurrency: { group: report-finalize, cancel-in-progress: false }
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
        working-directory: web
      - run: npm run report:finalize -- --period=${{ inputs.period }} --action=${{ inputs.action }} ${{ inputs.dry_run && '--dry-run' || '' }}
        working-directory: web
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          RESEND_AUDIENCE_API_KEY: ${{ secrets.RESEND_AUDIENCE_API_KEY }}
          RESEND_SEGMENT_EN_ID: ${{ secrets.RESEND_SEGMENT_EN_ID }}
          RESEND_SEGMENT_ZH_ID: ${{ secrets.RESEND_SEGMENT_ZH_ID }}
          RESEND_ALERTS_TO: ${{ secrets.RESEND_ALERTS_TO }}
          RESEND_ALERTS_FROM: ${{ secrets.RESEND_ALERTS_FROM }}
          NEWSLETTER_POSTAL_ADDRESS: ${{ secrets.NEWSLETTER_POSTAL_ADDRESS }}
          NEWSLETTER_REPLY_TO: ${{ secrets.NEWSLETTER_REPLY_TO }}
          INGEST_SECRET: ${{ secrets.INGEST_SECRET }}
```

- [ ] **Step 3: 验证**

Run: `cd web && npx tsc --noEmit && npx tsx src/lib/reports/readiness.check.ts`
Expected: exit 0；OK。

本地对 Q2 跑 dry-run（需要 `.env.local` 里有 `RESEND_API_KEY`、`RESEND_ALERTS_TO`）：

Run: `cd web && npm run report:finalize -- --period=2026-06-30 --action=preview && npm run report:finalize -- --period=2026-06-30 --action=finalize --dry-run`
Expected：站长收到 `[预览 en]`、`[预览 zh]` 和 `[dry-run en]`、`[dry-run zh]` 四封；之后查库 `select status, sends from quarterly_reports where period='2026-06-30'` 仍是 `live`、`{}`。

- [ ] **Step 4: Commit**

```bash
git add web/scripts/report-finalize-send.ts .github/workflows/report-finalize-send.yml web/package.json
git commit -m "feat(reports): 定稿并按 segment 群发(冻结预览版本、可安全重跑、dry-run)"
```

---

### Task 10: 订阅记录语言 + 诚实文案

**Files:**
- Modify: `web/src/app/api/subscribe/route.ts`
- Modify: `web/src/components/shell/NewsletterForm.tsx:24-30`
- Modify: `web/src/lib/footer.ts:32,50`
- Modify: `web/src/lib/legal.ts`（隐私页“Your Choices”/收集项段落 + `lastUpdated`，中英两处）
- Create: `web/scripts/newsletter-backfill-segment.ts`
- Create: `web/src/app/api/subscribe/lang.ts` + Test: `web/src/app/api/subscribe/lang.check.ts`

**Interfaces:**
- Produces: `normalizeLang(v: unknown): "en" | "zh"`

- [ ] **Step 1: 写失败的测试**

`web/src/app/api/subscribe/lang.check.ts`：

```ts
/** Run: cd web && npx tsx src/app/api/subscribe/lang.check.ts */
import { normalizeLang } from "./lang";
function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exit(1); } }
assert(normalizeLang("zh") === "zh", "zh");
assert(normalizeLang("en") === "en", "en");
assert(normalizeLang(undefined) === "en", "缺省 en");
assert(normalizeLang("ZH") === "en", "大小写不匹配按缺省");
assert(normalizeLang(["zh"]) === "en", "非字符串 en");
console.log("lang.check OK");
```

Run: `cd web && npx tsx src/app/api/subscribe/lang.check.ts` → Expected: FAIL（模块不存在）。

- [ ] **Step 2: 实现 `lang.ts` 与订阅接口**

`web/src/app/api/subscribe/lang.ts`：

```ts
export function normalizeLang(v: unknown): "en" | "zh" {
  return v === "zh" ? "zh" : "en";
}
```

`web/src/app/api/subscribe/route.ts`：在邮箱校验后、`resend.contacts.create` 处改为：

```ts
  const lang = normalizeLang(body.lang);
  const segmentId = lang === "zh" ? process.env.RESEND_SEGMENT_ZH_ID : process.env.RESEND_SEGMENT_EN_ID;
  const resend = new Resend(API_KEY);
  try {
    const { error } = await resend.contacts.create({
      email,
      audienceId: AUDIENCE_ID,
      unsubscribed: false,
    });
    if (error && !/already exists/i.test(error.message ?? "")) {
      return Response.json({ ok: false, error: "Failed to subscribe. Please try again." }, { status: 502 });
    }
    // 语言分组失败不影响订阅成功:没有分组的联系人按 EN 处理(见 newsletter-backfill-segment)。
    if (segmentId) {
      const seg = await resend.contacts.segments.add({ email, segmentId });
      if (seg.error && !/already/i.test(seg.error.message ?? "")) console.error(`[subscribe] segment add 失败: ${seg.error.message}`);
    }
    return Response.json({ ok: true });
  } catch {
```

先在 Resend 文档确认：2026 版 API 下 contact 是否仍需 `audienceId`（SDK 6.12.4 同时保留 Legacy 签名）。若 Resend 已把 audience 合并为全局 contacts，则去掉 `audienceId`，用 `contacts.create({ email, unsubscribed: false, segments: [{ id: segmentId }] })` 一步完成，并删掉 `segments.add`。以文档为准，选其一。

`NewsletterForm.tsx` 请求体加 `lang`：

```ts
        body: JSON.stringify({
          email: data.get("email"),
          company: data.get("company"), // honeypot
          lang,
        }),
```

- [ ] **Step 3: 诚实文案与隐私页**

`web/src/lib/footer.ts`：

```ts
        newsletterBlurb: "每季 13F 申报截止后一封，讲超级投资者这季动了什么。随时退订。",
```
```ts
        newsletterBlurb: "One email after each quarter's 13F deadline: what the superinvestors did. Unsubscribe anytime.",
```

`web/src/lib/legal.ts` 隐私页：在说明 newsletter 收集邮箱的段落（中英各一处）补一句——en：`"We also record the language of the page you subscribed from, so you receive the newsletter in that language."`；zh：`"我们还会记录你订阅时所在页面的语言，以便用该语言给你发信。"`；把隐私页的 `lastUpdated` 改为 `2026-10-19`（中英两处）。

- [ ] **Step 4: 一次性归组脚本**

`web/scripts/newsletter-backfill-segment.ts`：

```ts
/**
 * 一次性:把还没有语言分组的订阅者归入 EN segment(老订阅者语言不明,首期发英文 + 中文版链接)。
 * 用法: npx tsx scripts/newsletter-backfill-segment.ts [--apply]   不带 --apply 只打印将要处理的数量。
 */
import { Resend } from "resend";
import { env } from "./report";

async function main() {
  const apply = process.argv.includes("--apply");
  const resend = new Resend(env.RESEND_AUDIENCE_API_KEY);
  const en = env.RESEND_SEGMENT_EN_ID;
  const zh = env.RESEND_SEGMENT_ZH_ID;
  if (!en || !zh) throw new Error("缺 RESEND_SEGMENT_EN_ID / RESEND_SEGMENT_ZH_ID");
  const inSegment = async (segmentId: string) => {
    const set = new Set<string>();
    let after: string | undefined;
    for (;;) {
      const r = await resend.contacts.list({ segmentId, limit: 100, ...(after ? { after } : {}) });
      if (r.error) throw new Error(r.error.message);
      for (const c of r.data!.data) set.add(c.email.toLowerCase());
      if (!r.data!.has_more) break;
      after = r.data!.data.at(-1)!.id;
    }
    return set;
  };
  const tagged = new Set([...(await inSegment(en)), ...(await inSegment(zh))]);
  const all: string[] = [];
  let after: string | undefined;
  for (;;) {
    const r = await resend.contacts.list({ audienceId: env.RESEND_AUDIENCE_ID, limit: 100, ...(after ? { after } : {}) });
    if (r.error) throw new Error(r.error.message);
    for (const c of r.data!.data) if (!c.unsubscribed) all.push(c.email.toLowerCase());
    if (!r.data!.has_more) break;
    after = r.data!.data.at(-1)!.id;
  }
  const todo = all.filter((e) => !tagged.has(e));
  console.log(`订阅者 ${all.length},已分组 ${tagged.size},待归入 EN ${todo.length}`);
  if (!apply) return;
  for (const email of todo) {
    const r = await resend.contacts.segments.add({ email, segmentId: en });
    if (r.error) console.error(`${email}: ${r.error.message}`);
  }
  console.log("完成");
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
```

分页参数名（`after` / `has_more`）以 SDK 的 `PaginationOptions` 类型为准（`node_modules/resend/dist/index.d.mts:187`），实现时对照修正。

- [ ] **Step 5: 验证**

Run: `cd web && npx tsx src/app/api/subscribe/lang.check.ts && npx tsc --noEmit && npm run build`
Expected: OK；exit 0；build 通过。

- [ ] **Step 6: Commit**

```bash
git add web/src/app/api/subscribe/route.ts web/src/app/api/subscribe/lang.ts web/src/app/api/subscribe/lang.check.ts web/src/components/shell/NewsletterForm.tsx web/src/lib/footer.ts web/src/lib/legal.ts web/scripts/newsletter-backfill-segment.ts
git commit -m "feat(newsletter): 订阅记录语言(zh/en segment)、诚实订阅文案、隐私页补语言说明、老订阅者归组脚本"
```

---

### Task 11: 调度与看门狗

**Files:**
- Modify: `.github/workflows/ingest.yml`
- Modify: `web/src/lib/health/checks.ts`（新增 `evaluateReport`，`HealthProblem.pipeline` 加 `"report"`）
- Modify: `web/src/lib/health/gather.ts`（新增 `gatherReport`，并入 `gatherHealth`）
- Test: `web/src/lib/health/checks.check.ts`（追加断言）

**Interfaces:**
- Produces: `evaluateReport(row: { period: string; status: "live" | "final" } | null, today: Date): { problems: HealthProblem[]; info: string[] }`

- [ ] **Step 1: 写失败的测试**

在 `web/src/lib/health/checks.check.ts` 末尾（`console.log` 之前）追加：

```ts
import { evaluateReport } from "./checks";
{
  const live = { period: "2026-09-30", status: "live" as const };
  assert(evaluateReport(live, new Date("2026-11-20T00:00:00Z")).problems.length === 0, "截止后 4 天未定稿:不告警");
  const late = evaluateReport(live, new Date("2026-11-25T12:00:00Z"));
  assert(late.problems.length === 1 && late.problems[0].pipeline === "report", "截止 + 10 天仍未定稿:告警");
  assert(evaluateReport({ ...live, status: "final" }, new Date("2026-12-30T00:00:00Z")).problems.length === 0, "已定稿不告警");
  assert(evaluateReport(null, new Date("2026-11-25T00:00:00Z")).problems.length === 0, "无行不告警(只 info)");
}
```

（`assert` 用该文件已有的本地函数；若文件把 import 放顶部，把这条 import 移到顶部。）

Run: `cd web && npx tsx src/lib/health/checks.check.ts` → Expected: FAIL（`evaluateReport` 不存在）。

- [ ] **Step 2: 实现**

`web/src/lib/health/checks.ts`：`HealthProblem.pipeline` 类型改为 `"13f" | "prices" | "cost" | "report"`；import 加 `filingDeadline`；追加：

```ts
export const REPORT_FINALIZE_GRACE_DAYS = 10;

/** 季度报告:截止日 + 10 天仍未定稿 → 提醒站长去审预览并发出。 */
export function evaluateReport(
  row: { period: string; status: "live" | "final" } | null,
  today: Date,
): { problems: HealthProblem[]; info: string[] } {
  if (!row) return { problems: [], info: ["季度报告: 当前季度尚无报告行"] };
  if (row.status === "final") return { problems: [], info: [`季度报告: ${row.period} 已定稿`] };
  const deadline = filingDeadline(row.period);
  if (!deadline) return { problems: [], info: [] };
  const due = new Date(deadline.getTime() + REPORT_FINALIZE_GRACE_DAYS * 86_400_000);
  if (today <= due) return { problems: [], info: [`季度报告: ${row.period} 申报中`] };
  return {
    problems: [{ pipeline: "report", source: "季度报告", message: "截止日已过 10 天,报告仍未定稿", asOf: row.period, expected: "审预览后运行 Report finalize & send" }],
    info: [],
  };
}
```

`web/src/lib/health/gather.ts`：追加并并入 `gatherHealth` 的 `Promise.all`：

```ts
async function gatherReport(today: Date): Promise<{ problems: HealthProblem[]; info: string[] }> {
  try {
    const { data, error } = await getDb().from("quarterly_reports").select("period,status").order("period", { ascending: false }).limit(1);
    if (error) throw error;
    return evaluateReport((data?.[0] as { period: string; status: "live" | "final" }) ?? null, today);
  } catch (e) {
    return { problems: [], info: [`季度报告: 核查不可用(${e instanceof Error ? e.message : String(e)})`] };
  }
}
```

- [ ] **Step 3: ingest.yml**

在 `on.schedule` 加第二条 cron，在 revalidate 步骤后加报告步骤：

```yaml
  schedule:
    - cron: "0 9 * * 1,4"    # 每周一/周四 09:00 UTC; 幂等(无新 filing 不写)。13F 为命脉,filing 季加密捕捉
    - cron: "0 9 10-20 2,5,8,11 *"  # 申报季(2/5/8/11 月 10–20 日)每天一次,接住截止日前后的大户申报
```

```yaml
      # 季度报告:payload 不变则不写不刷;变化时只刷 learn(source=report),不触发整站重建。
      - id: report
        run: npm run report
        working-directory: web
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          RESEND_ALERTS_TO: ${{ secrets.RESEND_ALERTS_TO }}
          RESEND_ALERTS_FROM: ${{ secrets.RESEND_ALERTS_FROM }}
          NEWSLETTER_POSTAL_ADDRESS: ${{ secrets.NEWSLETTER_POSTAL_ADDRESS }}
      - name: Revalidate report pages
        if: steps.report.outputs.report_changed == 'true'
        run: |
          curl -fsS -X POST "https://thecompounder.fyi/api/revalidate?source=report" \
            -H "Authorization: Bearer ${{ secrets.INGEST_SECRET }}"
          echo
```

注意：同一天两条 cron 都命中（如 11/12 周四）时会跑两次，ingest 与 report 都幂等，可接受。顶部 `name:` 改为 `13F Ingest (Mon & Thu, daily in filing season)`。

- [ ] **Step 4: 验证**

Run: `cd web && npx tsx src/lib/health/checks.check.ts && npx tsc --noEmit`
Expected: OK；exit 0。

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ingest.yml web/src/lib/health/checks.ts web/src/lib/health/gather.ts web/src/lib/health/checks.check.ts
git commit -m "feat(reports): ingest 后刷新报告、申报季每日抓取、看门狗提醒未定稿"
```

---

### Task 12: 一致性核对 + Q2 彩排 + 上线清单

**Files:**
- Create: `web/scripts/report-consistency.ts`
- Modify: `web/package.json`（加 `"report:consistency": "tsx scripts/report-consistency.ts"`）

**Interfaces:**
- Consumes: `readReport`、`makeDb`
- Produces: CLI `npm run report:consistency -- --period=YYYY-MM-DD`，不一致时非零退出

- [ ] **Step 1: 实现核对脚本**

`web/scripts/report-consistency.ts`：

```ts
/**
 * 报告 vs 实时共识表逐数核对。只在 effectiveMovesPeriod 已等于该季度时有意义
 * (consensus_moves 只存当前有效季)。持有人数允许差异,但必须能被“该户最新申报已不是 P”解释。
 */
import { readReport } from "./lib/reportDb";
import { makeDb } from "./report";

async function main() {
  const period = process.argv.find((a) => a.startsWith("--period="))?.split("=")[1];
  if (!period) throw new Error("需要 --period=YYYY-MM-DD");
  const db = makeDb();
  const row = await readReport(db, period);
  if (!row) throw new Error("无报告行");
  const p = row.payload;
  const { data: moves, error } = await db.from("consensus_moves").select("ticker,direction,manager_count");
  if (error) throw new Error(error.message);
  const live = new Map((moves ?? []).map((m: any) => [`${m.ticker}|${m.direction}`, Number(m.manager_count)]));
  const bad: string[] = [];
  for (const [dir, items] of [["bought", p.bought.items], ["sold", p.sold.items]] as const) {
    for (const i of items) {
      const v = live.get(`${i.key}|${dir}`);
      if (v !== i.managerCount) bad.push(`${dir} ${i.key}: 报告 ${i.managerCount} vs 实时 ${v ?? "无"}`);
    }
  }
  const { data: held } = await db.from("consensus_holdings").select("ticker,holder_count").in("ticker", p.mostHeld.items.map((i) => i.key));
  const heldMap = new Map((held ?? []).map((h: any) => [h.ticker, Number(h.holder_count)]));
  const heldDiffs = p.mostHeld.items.filter((i) => heldMap.get(i.key) !== i.holderCount).map((i) => `${i.key}: 报告 ${i.holderCount} vs 实时 ${heldMap.get(i.key) ?? "无"}`);
  console.log(`[consistency] 买卖不一致 ${bad.length} 项`);
  bad.forEach((b) => console.log("  ✗", b));
  console.log(`[consistency] 持有人数差异 ${heldDiffs.length} 项(实时表按每户最新申报计,已申报下一季的户会造成差异)`);
  heldDiffs.forEach((b) => console.log("  ·", b));
  if (bad.length) process.exit(1);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
```

- [ ] **Step 2: Q2 彩排（站长 + 执行者一起）**

1. 站长：在 Resend 后台建 `Compounder EN`、`Compounder ZH` 两个 Segment；把 ID 填进 Vercel 环境变量与 GitHub Secrets（`RESEND_SEGMENT_EN_ID`、`RESEND_SEGMENT_ZH_ID`），并确认 GitHub Secrets 已有 `RESEND_API_KEY`、`RESEND_AUDIENCE_API_KEY`、`RESEND_ALERTS_TO`。
2. 执行：`cd web && npx tsx scripts/newsletter-backfill-segment.ts`（只打印），站长确认数量后加 `--apply`。
3. 执行：`npm run report -- --period=2026-06-30`；`npm run report:consistency -- --period=2026-06-30`。Expected：脚本先打印两边 cohort（报告已申报人数 vs 实时页按该季计算的活跃投资人数、实时页有效变动季）。cohort 不同或有效季不是该季（Q2 彩排时 Q3 早申报者已让实时页 cohort 变小，属此情况）→ 打印 `cohort differs: report N filers vs site M — diffs below are expected`，列出差异，退出 0；只有 cohort 相同时买卖不一致才非零退出（Expected 0 项）。持有人数差异逐项能用“该户已申报 Q3”解释（对照 `filings` 表）。
4. 执行：`npm run report:finalize -- --period=2026-06-30 --action=preview`，再 `--action=finalize --dry-run`。站长在 Gmail 与 Apple Mail 检查四封邮件：中英结论句、表格、链接、中文版链接、首期句、免责、退订链接。
5. 站长确认后，**Q2 正式定稿但不群发**：直接调 `select finalize_report('2026-06-30');`（只冻结，不经发送流程），然后 `curl -X POST .../api/revalidate?source=report`。Q2 页面状态变为定稿。
6. 截图 `/learn/q2-2026-superinvestor-consensus` 与 `/zh/...` 在桌面与 375px 宽度下的效果，确认无横向溢出、正文 15px。

- [ ] **Step 3: 全量验证**

```bash
cd web
for f in src/lib/reports/*.check.ts scripts/lib/loadReportInput.check.ts scripts/lib/computeConsensus.check.ts src/app/api/subscribe/lang.check.ts src/lib/health/checks.check.ts scripts/revalidate-paths.check.ts; do npx tsx "$f" || exit 1; done
npx tsc --noEmit && npm run lint && npm run build
```
Expected：全部 OK；lint 与 build 通过。

- [ ] **Step 4: Commit 并开 PR**

```bash
git add web/scripts/report-consistency.ts web/package.json
git commit -m "feat(reports): 报告与实时共识表一致性核对脚本"
git push -u origin plan/filing-season-report-engine
gh pr create --base db-foundation --title "申报季内容引擎:季度共识报告 + 首期 newsletter" --body "实现 docs/superpowers/specs/2026-10-19-filing-season-report-engine-design.md。

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

（push 与开 PR 前先征得站长同意。）

- [ ] **Step 5: Q3 上线节奏（合并后）**

| 时间 | 动作 |
|---|---|
| 合并部署后 | 下一次 ingest 自动为 Q3 建 live 行（已有早申报者时）；检查 `/learn/q3-2026-superinvestor-consensus` |
| 11/10–11/20 | 每日 ingest + report 自动刷新 |
| 覆盖率 ≥90% 且过截止日 | 站长收到预览 |
| 站长审完 | GitHub → Actions → Report finalize & send → `period=2026-09-30`、`action=finalize` |
| 发送后 | `npm run report:consistency -- --period=2026-09-30`（待 effectiveMovesPeriod 切到 Q3 后） |
