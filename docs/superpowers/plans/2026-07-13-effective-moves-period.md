# Effective Moves Period Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the calendar-max 13F quarter is not yet “effective” (before SEC deadline and/or <50% of tracked managers filed), aggregate moves (Hero, buys/sells, `consensus_moves`) use the prior quarter — with explicit quarter labels and footnotes so readers are not misled.

**Architecture:** Add pure `effectiveMovesPeriod(periods, today)` in `derive.ts`. Wire `currentQuarterOnly` and `computeConsensus` changes-of to that period (same manager-universe `periods` source). Update aggregate moves UI/copy per spec §C in-list; leave personal/stock/nav “本季” alone. After merge, re-run `npm run consensus` so the DB fast path matches.

**Tech Stack:** Next.js App Router (read `web/node_modules/next/dist/docs/` before page edits), existing `derive.ts` / `aggregations.ts` / Supabase consensus scripts, bilingual inline `COPY`.

**项目约定（覆盖 plan 模板默认 TDD）：**
- 纯逻辑用 `*.check.ts` + `npx tsx`（node:assert），不接 CI。
- 验证 = check 脚本 + `cd web && npx tsc --noEmit` + 人工看 Hero / buys。
- Spec: `docs/superpowers/specs/2026-07-13-effective-moves-period-design.md`.
- ⚠️ `npm run consensus` 写生产共享 Supabase；跑前确认仓库根 / `web/.env.local` 指向预期项目。

---

## File map

| File | Responsibility |
|------|----------------|
| `web/src/lib/freshness/derive.ts` | `MOVES_COVERAGE_MIN`, `priorQuarterEnd`, `effectiveMovesPeriod` |
| `web/src/lib/freshness/derive.check.ts` | Ad-hoc assertions for the above |
| `web/src/lib/aggregations.ts` | `currentQuarterOnly` uses effective period (`new Date()` at call site) |
| `web/scripts/lib/computeConsensus.ts` | `changesOf` keyed to effective period; same `periods` list as coverage |
| `web/src/app/[lang]/page.tsx` | Pass `effectivePeriod` into Hero |
| `web/src/components/home/HeroMasthead.tsx` | Moves panel titles use `quarterLabel(effectivePeriod)` |
| `web/src/app/[lang]/investors/_movesPage.tsx` | Footnote + eyebrow/heading/intro |
| `web/src/app/[lang]/investors/buys/page.tsx` + `sells/page.tsx` | Metadata |
| `web/src/app/[lang]/investors/buys/opengraph-image.tsx` + `sells/...` | OG copy |
| `web/src/lib/aggregate/blurb.ts` | `movesBlurb` takes quarter label |
| `web/src/lib/share/shareText.ts` | buys/sells share: no bare “this quarter” |

**Out of plan (spec §C Out / §D):** nav.ts, InvestorNarrative, stock holders copy, SNOW valuation copy, freshness13F thresholds, consensus_holdings.

---

### Task 1: `effectiveMovesPeriod` + checks

**Files:**
- Modify: `web/src/lib/freshness/derive.ts`
- Modify: `web/src/lib/freshness/derive.check.ts`

- [ ] **Step 1: Append failing checks** (extend the **existing** top-of-file import; do not paste a second import near `console.log`)

In the existing `import { … } from "./derive"` at the top of `derive.check.ts`, add `effectiveMovesPeriod`, `priorQuarterEnd`, `MOVES_COVERAGE_MIN`, `FILING_DEADLINE_DAYS` (only if an assertion needs the last).

Then before the final `console.log`, add:

```ts
assert.equal(MOVES_COVERAGE_MIN, 0.5, "coverage min");
assert.equal(priorQuarterEnd("2026-06-30"), "2026-03-31");
assert.equal(priorQuarterEnd("2026-03-31"), "2025-12-31");
assert.equal(priorQuarterEnd("2025-12-31"), "2025-09-30");
assert.equal(priorQuarterEnd("2025-09-30"), "2025-06-30");

// Production-like: 12 filed Q2, 64 on Q1; today 2026-07-12 → before Q2 deadline (06-30+45=08-14)
{
  const periods = [
    ...Array(12).fill("2026-06-30"),
    ...Array(64).fill("2026-03-31"),
  ];
  const r = effectiveMovesPeriod(periods, d("2026-07-12"));
  assert.equal(r.period, "2026-03-31", "before deadline → prior");
  assert.equal(r.reason, "before_deadline");
  assert.equal(r.maxPeriod, "2026-06-30");
  assert.equal(r.coverage.filed, 12);
  assert.equal(r.coverage.total, 76);
}

// After deadline, still low coverage → low_coverage
{
  const periods = [
    ...Array(20).fill("2026-06-30"),
    ...Array(56).fill("2026-03-31"),
  ];
  const r = effectiveMovesPeriod(periods, d("2026-08-15")); // day after 08-14
  assert.equal(r.period, "2026-03-31");
  assert.equal(r.reason, "low_coverage");
}

// After deadline, ≥50% → due_and_covered
{
  const periods = [
    ...Array(40).fill("2026-06-30"),
    ...Array(36).fill("2026-03-31"),
  ];
  const r = effectiveMovesPeriod(periods, d("2026-08-15"));
  assert.equal(r.period, "2026-06-30");
  assert.equal(r.reason, "due_and_covered");
}

// Empty
{
  const r = effectiveMovesPeriod([], d("2026-07-12"));
  assert.equal(r.period, null);
  assert.equal(r.reason, "empty");
}
```

Update the final log string to mention `effectiveMovesPeriod`.

- [ ] **Step 2: Run check — expect fail**

```bash
cd web && npx tsx src/lib/freshness/derive.check.ts
```

Expected: import / undefined export error.

- [ ] **Step 3: Implement in `derive.ts`**

After `globalLatestPeriod` (near the 13F freshness block), add:

```ts
export const MOVES_COVERAGE_MIN = 0.5;

export type EffectiveMovesReason =
  | "due_and_covered"
  | "before_deadline"
  | "low_coverage"
  | "empty";

export type EffectiveMovesPeriod = {
  period: string | null;
  reason: EffectiveMovesReason;
  maxPeriod: string | null;
  coverage: { filed: number; total: number };
};

/** Prior calendar quarter-end for a YYYY-MM-DD quarter-end string. Illegal → null. */
export function priorQuarterEnd(period: string): string | null {
  const p = parseUTC(period);
  if (!p) return null;
  const y = p.getUTCFullYear();
  const m = p.getUTCMonth(); // 0-based: 2=Mar, 5=Jun, 8=Sep, 11=Dec
  if (m === 2) return `${y - 1}-12-31`;
  if (m === 5) return `${y}-03-31`;
  if (m === 8) return `${y}-06-30`;
  if (m === 11) return `${y}-09-30`;
  return null;
}

/**
 * Moves baseline quarter: do not follow early filers until SEC deadline passed
 * AND coverage of maxPeriod among tracked periods ≥ MOVES_COVERAGE_MIN.
 */
export function effectiveMovesPeriod(
  periods: Array<string | null | undefined>,
  today: Date,
): EffectiveMovesPeriod {
  const valid = periods.filter((p): p is string => !!p && !!parseUTC(p));
  const total = valid.length;
  const maxPeriod = globalLatestPeriod(valid);
  if (!maxPeriod || total === 0) {
    return { period: null, reason: "empty", maxPeriod: null, coverage: { filed: 0, total: 0 } };
  }
  const filed = valid.filter((p) => p === maxPeriod).length;
  const coverage = { filed, total };
  const maxDate = parseUTC(maxPeriod)!;
  const deadline = addDays(maxDate, FILING_DEADLINE_DAYS);
  // Same strictness as mostRecentDueQuarter: due only when today is strictly after deadline day.
  const due = utcDay(today) > utcDay(deadline);
  const prior = priorQuarterEnd(maxPeriod);
  if (!due) {
    return { period: prior, reason: "before_deadline", maxPeriod, coverage };
  }
  if (filed / total < MOVES_COVERAGE_MIN) {
    return { period: prior, reason: "low_coverage", maxPeriod, coverage };
  }
  return { period: maxPeriod, reason: "due_and_covered", maxPeriod, coverage };
}
```

Notes for implementer:
- `addDays` / `utcDay` are file-private today — either export them for reuse or duplicate the one-liner deadline math inline using existing `parseUTC` + `FILING_DEADLINE_DAYS`. Prefer making `addDays`/`utcDay` available to `effectiveMovesPeriod` in the same file (no new exports required if used only inside).
- Deadline comparison: if `FILING_DEADLINE_DAYS` is 45 and max is `2026-06-30`, deadline date is `2026-08-14`; on `2026-08-14` still **not** due (`>` not `>=`), matching `mostRecentDueQuarter` / filingFreshness “截止日当天仍 fresh” spirit.

- [ ] **Step 4: Run check — expect pass**

```bash
cd web && npx tsx src/lib/freshness/derive.check.ts
```

Expected: `derive.check.ts: all assertions passed…`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/freshness/derive.ts web/src/lib/freshness/derive.check.ts
git commit -m "feat(freshness): effectiveMovesPeriod calendar + 50% coverage gate"
```

---

### Task 2: Wire aggregations + consensus materialization

**Files:**
- Modify: `web/src/lib/aggregations.ts`
- Modify: `web/scripts/lib/computeConsensus.ts`

- [ ] **Step 1: Update `currentQuarterOnly`**

In `aggregations.ts`, import `effectiveMovesPeriod` (keep `globalLatestPeriod` if still used by `excludeInactive` / elsewhere).

Replace:

```ts
export function currentQuarterOnly(scan: ScanRow[]): ScanRow[] {
  const gl = globalLatestPeriod(scan.map((r) => r.period));
  return scan.filter((r) => r.period === gl);
}
```

with:

```ts
export function currentQuarterOnly(scan: ScanRow[], today: Date = new Date()): ScanRow[] {
  const { period } = effectiveMovesPeriod(scan.map((r) => r.period), today);
  if (!period) return [];
  return scan.filter((r) => r.period === period);
}
```

`notableMoves` / `holderDeltas` already call `currentQuarterOnly` — no further change unless you want an optional `today` inject for tests (YAGNI: skip).

- [ ] **Step 2: Update `computeConsensus` changes gate**

In `web/scripts/lib/computeConsensus.ts`, import `effectiveMovesPeriod` from `../../src/lib/freshness/derive` (same path style as existing `globalLatestPeriod` import).

After building `raws` and computing `gl` for inactive filter, compute effective once from the **same** period list:

```ts
const periods = raws.map((r) => r.period);
const gl = globalLatestPeriod(periods);
const effective = effectiveMovesPeriod(periods, new Date());
const active = raws.filter((r) => freshness13F(r.period, gl) !== "inactive");
const changesOf = (r: Raw) =>
  (effective.period && r.period === effective.period ? diff(r.latestH, r.priorH) : []);
```

Do **not** use `gl` for changes anymore. Holdings / inactive filter still use `gl` as today.

- [ ] **Step 3: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: clean (or only pre-existing unrelated errors — fix any you introduced).

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/aggregations.ts web/scripts/lib/computeConsensus.ts
git commit -m "fix(13f): moves filters use effectiveMovesPeriod not bare max"
```

---

### Task 3: Hero + homepage wiring

**Files:**
- Modify: `web/src/app/[lang]/page.tsx`
- Modify: `web/src/components/home/HeroMasthead.tsx`

- [ ] **Step 1: Hero props + copy**

In `HeroMasthead.tsx`:
- Add prop `movesPeriod: string` (effective YYYY-MM-DD; may be `""` if empty).
- Remove static `quarterTag: "本季" | "This quarter"` and `panelTitle` strings that say 本季/this quarter.
- Derive label: `const q = quarterLabel(movesPeriod) || movesPeriod`.
- zh: `panelTitle: \`${q} 显著动向\``, tag shows `q`.
- en: `panelTitle: \`Notable moves · ${q}\``, tag shows `q`.
- Left-side `asOf` / `filingFreshness(period)` **unchanged** (still the tracking/index period prop).

- [ ] **Step 2: Homepage computes effective once**

In `page.tsx`, import `effectiveMovesPeriod`. After `topManagers` / `period` for left as-of:

```ts
const movesEffective = effectiveMovesPeriod(
  topManagers.map((m) => m.period),
  new Date(),
);
```

Pass `movesPeriod={movesEffective.period ?? ""}` into `HeroMasthead`.

Use the **same** `topManagers` (or `idx.managers`) period list that consensus script will see from DB managers — index summaries are the page-time universe; script uses DB managers. Spec advisory: keep universes aligned; do not invent a second coverage denominator on the homepage.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/[lang]/page.tsx web/src/components/home/HeroMasthead.tsx
git commit -m "fix(ui): Hero moves panel labels use effective quarter"
```

---

### Task 4: buys/sells page + footnote

**Files:**
- Modify: `web/src/app/[lang]/investors/_movesPage.tsx`

- [ ] **Step 1: Replace baseline with `effectiveMovesPeriod`**

```ts
import { effectiveMovesPeriod, quarterLabel } from "@/lib/freshness/derive";

const periods = idx.managers.map((m) => m.period);
const effective = effectiveMovesPeriod(periods, new Date());
const baseline = effective.period;
// Only managers older than the moves baseline — early maxPeriod filers are
// covered by the “另有 N 位已交 max” clause, not this “older filing” list.
const lagged = idx.managers.filter(
  (m) => baseline != null && m.period < baseline,
);
const qLabel = quarterLabel(baseline) || baseline || "—";
```

Footnote builder (structure locked by spec; tighten wording to copy-voice):

```ts
function movesFootnote(
  lang: Lang,
  effective: ReturnType<typeof effectiveMovesPeriod>,
  lagged: { person: string; period: string }[],
): string {
  const baseline = effective.period ?? "—";
  const max = effective.maxPeriod;
  const { filed, total } = effective.coverage;
  if (lang === "zh") {
    let s = `统计基准季：${baseline}。`;
    if (effective.reason === "before_deadline" || effective.reason === "low_coverage") {
      const why =
        effective.reason === "before_deadline" ? "截止日前" : `覆盖率 ${filed}/${total}`;
      s = `统计基准季：${baseline}（${max} 尚未达到披露门槛：${why}）。`;
      if (max && max !== baseline && filed > 0) {
        s += `另有 ${filed} 位已交 ${max}。`;
      }
    }
    if (lagged.length > 0) {
      s += `未计入（最新申报更早）：${lagged.map((m) => `${m.person}（${m.period}）`).join("、")}。`;
    }
    return s;
  }
  let s = `Baseline quarter: ${baseline}.`;
  if (effective.reason === "before_deadline" || effective.reason === "low_coverage") {
    const why =
      effective.reason === "before_deadline"
        ? "before filing deadline"
        : `coverage ${filed}/${total}`;
    s = `Baseline quarter: ${baseline} (${max} not yet at disclosure threshold: ${why}).`;
    if (max && max !== baseline && filed > 0) {
      s += ` ${filed} managers have already filed ${max}.`;
    }
  }
  if (lagged.length > 0) {
    s += ` Not counted (older latest filing): ${lagged.map((m) => `${m.person} (${m.period})`).join(", ")}.`;
  }
  return s;
}
```

Replace the existing footnote `<p className="mt-3 …">` body with:

```tsx
{movesFootnote(lang, effective, lagged)}
```

Do not leave the old `globalLatest` / `lagged` inline template in place.
- [ ] **Step 2: Eyebrow / heading / intro**

- eyebrow: zh `13F 动向 · ${qLabel}` / en `13F moves · ${qLabel}`
- heading: zh `最多人买` / `最多人卖` (drop leading 本季) — or `Top buys` / `Top sells` unchanged in en if already bare
- intro: drop “本季/this quarter”; e.g. en `Stocks most superinvestors opened or added in ${qLabel}.` / zh `在 ${qLabel} 被最多超级投资者新建仓或加仓的股票。`

Pass `qLabel` into `movesBlurb` once Task 5 updates its signature.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/[lang]/investors/_movesPage.tsx
git commit -m "fix(ui): buys/sells baseline footnote + quarter labels"
```

---

### Task 5: Metadata, OG, blurb, share (spec §C in)

**Files:**
- Modify: `web/src/app/[lang]/investors/buys/page.tsx`
- Modify: `web/src/app/[lang]/investors/sells/page.tsx`
- Modify: `web/src/app/[lang]/investors/buys/opengraph-image.tsx`
- Modify: `web/src/app/[lang]/investors/sells/opengraph-image.tsx`
- Modify: `web/src/lib/aggregate/blurb.ts`
- Modify: `web/src/lib/share/shareText.ts` (+ call sites in `_movesPage` if signature changes)

- [ ] **Step 1: Metadata**

Prefer neutral (metadata cannot easily await effective period without duplicating index read — either duplicate `getManagerIndex` + `effectiveMovesPeriod` in `generateMetadata`, or use neutral copy without a specific Q):

Neutral (YAGNI-friendly, allowed by spec “带季或中性”):

- zh title: `最多人买 · 超级投资者 — Compounder · 复利`
- zh description: `按最新可比 13F 申报季，被最多顶级投资者新建仓或加仓的股票。`
- en title: `Top buys · Superinvestors — Compounder`
- en description: `Stocks most superinvestors opened or added in the latest comparable 13F quarter.`

Mirror for sells.

- [ ] **Step 2: OG images**

```ts
export const alt = "Superinvestor 13F top buys — Compounder";
title: "Top buys",
```

(and sells). No `this quarter`.

- [ ] **Step 3: `movesBlurb(rows, side, lang, quarterLabel: string)`**

```ts
// zh
return `${quarterLabel}，${subjectName(a)} 获最多投资者${verb}——${a.primary} 位${tail}。`;
// en
return `In ${quarterLabel}, ${subjectName(a)} drew the most ${verb} (${a.primary} superinvestors)${tail}.`;
```

Update `_movesPage` call site.

- [ ] **Step 4: `shareText` buys/sells only**

Extend:

```ts
| { kind: "buys"; topName: string | null; count: number | null; quarterLabel?: string }
| { kind: "sells"; topName: string | null; count: number | null; quarterLabel?: string }
```

Always prefer a quarter-aware sentence. Call site **must** pass `quarterLabel: qLabel`. If somehow missing, use neutral fallback — **never** the old bare「本季 / this quarter」:

```ts
case "buys": {
  if (!input.topName || input.count == null) return fallback;
  const q = input.quarterLabel;
  if (lang === "zh") {
    return q
      ? `${q} ${input.topName} 获最多顶级投资者买入（${input.count} 位）。${VIA}`
      : `${input.topName} 获最多顶级投资者买入（${input.count} 位）。${VIA}`;
  }
  return q
    ? `In ${q}, ${input.topName} drew the most buying from top investors (${input.count}). ${VIA}`
    : `${input.topName} drew the most buying from top investors (${input.count}). ${VIA}`;
}
```

Mirror for sells. Do **not** change investor / consensus branches.

Pass `quarterLabel: qLabel` from `_movesPage` `buildShareText`.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/[lang]/investors/buys/page.tsx \
  web/src/app/[lang]/investors/sells/page.tsx \
  web/src/app/[lang]/investors/buys/opengraph-image.tsx \
  web/src/app/[lang]/investors/sells/opengraph-image.tsx \
  web/src/lib/aggregate/blurb.ts \
  web/src/lib/share/shareText.ts \
  web/src/app/[lang]/investors/_movesPage.tsx
git commit -m "fix(copy): strip bare this-quarter from aggregate moves surfaces"
```

---

### Task 6: Rebuild consensus + verify

**Files:** none (ops + manual QA)

- [ ] **Step 1: Re-run consensus** (required for DB fast path)

```bash
cd web && npm run consensus
```

Expected log line with `moves N 行` and **N > 0**.

If moves still 0: debug `effective.period` has filers with non-empty changes; check script used `effectiveMovesPeriod` not `gl` for `changesOf`.

- [ ] **Step 2: Local or production smoke**

- `/` or `/en`: Hero right panel shows moves; title/tag like `Q1 2026` (not “This quarter”); left as-of can still say Q1/Q2 tracking line per index period.
- `/investors/buys`: ranking non-empty; footnote mentions baseline `2026-03-31` (under today’s early-filer regime), threshold reason, and N already filed on `2026-06-30`.
- `/investors/sells`: same structure.
- Confirm nav still says 「本季最多人买」(Out — intentional).

- [ ] **Step 3: Final typecheck**

```bash
cd web && npx tsc --noEmit && npx tsx src/lib/freshness/derive.check.ts
```

- [ ] **Step 4: Commit ops note only if you added a script/README line** (optional). Otherwise no code commit — mention re-run in PR body.

---

## Done when

1. `derive.check.ts` covers before_deadline / low_coverage / due_and_covered / empty / priorQuarterEnd.
2. Hero + buys/sells show effective-quarter moves, not empty early-bird state.
3. Aggregate moves copy has no bare「本季/this quarter」on §C In surfaces.
4. `npm run consensus` left `consensus_moves` non-empty and aligned with the page.
