# Valuation Floor on Stock Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⚠️ Scope narrowed (2026-06-15):** This branch (`feat/valuation-floor-stock`) ships ONLY the valuation module + stock-page integration (Tasks 2–8). **Tasks 1 & 9 (archive + delete the research subsystem) are OUT OF SCOPE** — research is a harmless orphan; its removal is deferred to a separate follow-up PR so this change stays small and single-purpose.

**Goal:** Add the deterministic valuation-floor engine onto the individual stock page `/stocks/[ticker]`, reading the rich stored-fundamentals table (real effective tax rate + real tangible book value). (Research-leg removal deferred — see scope note above.)

**Architecture:** A self-contained `src/lib/valuation/` module (types + pure engine + mapper), consumed server-side (RSC) by the stock page from `company_fundamentals_periods` via `getSecCompanyData`. No live SEC fetch, no price dependency. The entire research presentation subsystem (confirmed orphaned) is deleted from the mainline and preserved on an archive branch.

**Tech Stack:** TypeScript, Next.js (custom build — see `web/AGENTS.md`, NOT stock Next.js), React Server Components, Supabase (read-only), Tailwind `--tt-*` tokens.

**Source spec:** `docs/superpowers/specs/2026-06-15-valuation-floor-on-stock-page-design.md` (single source of truth).

---

## Context the implementer needs (verified during design)

- **Data source:** `getSecCompanyData(ticker)` (`web/src/lib/sec/read.ts`) returns `{ company, filings, annual, quarterly, latest }`. `annual` is `FundamentalPeriod[]` (FY rows) from `company_fundamentals_periods`, descending by `period_end`. `FundamentalPeriod` type lives in `web/src/lib/sec/normalize-facts.ts` and carries per-year: `fiscal_year, revenue, operating_income, operating_margin, net_income, pretax_income, income_tax_expense, effective_tax_rate, shareholders_equity, goodwill, intangibles, cash_and_equivalents, total_debt, net_debt, shares_diluted` (all `number | null`). `effective_tax_rate` and `net_debt` are already computed at ingest.
- **Existing engine to reuse:** `web/src/lib/research/valuation/epvFloor.ts` + `epvFloor.check.ts` already implement the two lamps, lens-specific bridge, moat 3-band, high-leverage, degradation, provenance — all verified. We **relocate and adapt** it (new input contract, real tax, real tangible book), not rewrite the core.
- **Research subsystem is fully orphaned (grep-confirmed):** nothing outside `src/lib/research/`, `src/app/api/research/`, `src/app/[lang]/research/`, `src/components/research/` imports it; no nav/sitemap/stock-page link to `/research`; `/api/research` only fetched by `ResearchPanel`; `dataQualityGate` only used inside research. Safe to delete.
- **Stock page** `web/src/app/[lang]/stocks/[ticker]/page.tsx` is an async RSC (`revalidate = 3600`), renders `EntityPage` + `StockProse` + `HoldersTable` + `KeyFacts`, and has a "Stock valuation (intrinsic value / DCF) coming soon." placeholder (zh line ~79, en line ~89, rendered ~148, subtitle ~233).
- **Money units:** stored values are raw USD; share counts raw shares → per-share = USD. Consistent.
- **Worktree build:** must use real `node_modules` (`npm ci`), not symlink, or Turbopack crashes. All commands run from `web/`.

---

## File Structure

- **Create** `web/src/lib/valuation/types.ts` — `ValuationFloor` family + `ValuationFloorInput`/`ValuationFloorYear`.
- **Create** `web/src/lib/valuation/epvFloor.ts` — relocated + adapted pure engine + constants.
- **Create** `web/src/lib/valuation/epvFloor.check.ts` — relocated + extended self-check.
- **Create** `web/src/lib/valuation/fundamentalsToFloorInput.ts` — `FundamentalPeriod[] → ValuationFloorInput` mapper.
- **Create** `web/src/lib/valuation/fundamentalsToFloorInput.check.ts` — mapper self-check.
- **Create** `web/src/lib/valuation/index.ts` — barrel.
- **Create** `web/src/components/valuation/EarningsPowerFloorCard.tsx` — RSC (no `"use client"`) presentational card.
- **Modify** `web/src/app/[lang]/stocks/[ticker]/page.tsx` — fetch fundamentals, compute floor, render card, drop placeholder.
- **Delete** the research presentation subsystem (Task 9 lists exact paths).

---

## Task 1: Archive bookmark + clean baseline

**Files:** none (git only)

- [ ] **Step 1: Create the archive bookmark branch** (preserves the full research leg before deletion)

```bash
git branch archive/research-presentation-leg db-foundation
git branch --list 'archive/*'
```
Expected: `archive/research-presentation-leg` listed. (db-foundation contains the complete original research subsystem; git history keeps everything recoverable — this is just an explicit bookmark.)

- [ ] **Step 2: Confirm baseline green**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit** (nothing to commit yet; bookmark is a ref). Skip.

---

## Task 2: Valuation module types

**Files:**
- Create: `web/src/lib/valuation/types.ts`

- [ ] **Step 1: Write `types.ts`** (ValuationFloor family copied out of researchSchemas to decouple, plus the new input contract)

```typescript
// Self-contained valuation-floor types. Decoupled from the research subsystem
// (which is being archived). The ValuationFloor output shape matches what the
// already-built engine produces; ValuationFloorInput is the new rich contract.

export type EpvLampMethod = {
  earnings_basis: string;
  leverage_treatment: string;
  denominator: string;
  bridge: string;
  discount_rate_low: number;
  discount_rate_high: number;
  years_used: number[];
  simplifications: string[];
};

export type EpvLamp = {
  label: string;
  assessable: boolean;
  not_assessable_reason?: string;
  normalized_earnings?: number;
  equity_value_low?: number;
  equity_value_high?: number;
  per_share_low?: number;
  per_share_high?: number;
  method: EpvLampMethod;
};

export type AssetFloor = {
  assessable: boolean;
  not_assessable_reason?: string;
  basis: string;
  intangibles_separated: boolean;
  total_value?: number;
  per_share?: number;
};

export type MoatSignal = "franchise" | "commodity" | "value_destruction" | "not_assessable";

export type MoatReading = {
  signal: MoatSignal;
  label: string;
  basis_note: string;
  epv_per_share_compared?: number;
  asset_per_share_compared?: number;
};

export type ValuationFloorProvenance = {
  years_used: number[];
  as_of_fiscal_year?: number;
  discount_rate_band: [number, number];
  normalized_tax_rate: number;
  normalized_tax_rate_basis: string;
  maintenance_capex_rule: string;
  share_count_basis: string;
};

export type ValuationFloor = {
  graham_epv: EpvLamp;
  buffett_epv: EpvLamp;
  asset_floor: AssetFloor;
  moat_reading: MoatReading;
  high_leverage_warning: boolean;
  high_leverage_note?: string;
  net_debt_to_equity?: number;
  provenance: ValuationFloorProvenance;
};

// ── Input contract (mapped from stored FundamentalPeriod rows) ───────────────
export type ValuationFloorYear = {
  fiscal_year: number;
  revenue?: number;
  operating_income?: number;
  operating_margin?: number;
  net_income?: number;
  pretax_income?: number;
  income_tax_expense?: number;
  effective_tax_rate?: number;
  shareholders_equity?: number;
  goodwill?: number;
  intangibles?: number;
  cash?: number;
  total_debt?: number;
  net_debt?: number;
  shares_diluted?: number;
};

export type ValuationFloorInput = {
  ticker: string;
  company_name?: string;
  years: ValuationFloorYear[]; // most-recent-first
};
```

- [ ] **Step 2: Verify** — Run: `cd web && npx tsc --noEmit` → exit 0.

- [ ] **Step 3: Commit**
```bash
git add web/src/lib/valuation/types.ts
git commit -m "feat(valuation): self-contained valuation-floor types + input contract"
```

---

## Task 3: Relocate + adapt the engine to `ValuationFloorInput` (TDD)

This ports the verified engine to the new input. **Tax stays a flat 21% and asset floor stays total-book in THIS task** (so the ported logic + old assertions pass first); Tasks 4–5 then upgrade them via TDD.

**Files:**
- Create: `web/src/lib/valuation/epvFloor.ts`
- Create: `web/src/lib/valuation/epvFloor.check.ts`

- [ ] **Step 1: Write the failing check** `web/src/lib/valuation/epvFloor.check.ts`

```typescript
/**
 * epvFloor.check.ts — self-check for the deterministic valuation-floor engine.
 * Run: cd web && npx tsx src/lib/valuation/epvFloor.check.ts
 * (No test framework — pure logic verified with node:assert.)
 */
import assert from "node:assert";
import type { ValuationFloorInput, ValuationFloorYear } from "./types";
import { computeValuationFloor, DISCOUNT_RATE_HIGH, DISCOUNT_RATE_LOW, MAX_TAX_RATE } from "./epvFloor";

function year(fy: number, o: Partial<ValuationFloorYear>): ValuationFloorYear {
  return { fiscal_year: fy, ...o };
}

// Net-cash compounder, ~43% op margin, effective tax ~15% per year.
const compounder: ValuationFloorInput = {
  ticker: "TEST",
  years: [
    year(2025, { revenue: 10_000, operating_margin: 0.45, net_income: 3_000, effective_tax_rate: 0.15, shareholders_equity: 5_000, goodwill: 500, intangibles: 300, cash: 2_000, total_debt: 1_000, net_debt: -1_000, shares_diluted: 1_000 }),
    year(2024, { revenue: 9_000, operating_margin: 0.44, net_income: 2_700, effective_tax_rate: 0.15, shareholders_equity: 4_500, goodwill: 500, intangibles: 300, cash: 1_800, total_debt: 1_000, net_debt: -800, shares_diluted: 1_000 }),
    year(2023, { revenue: 8_000, operating_margin: 0.42, net_income: 2_400, effective_tax_rate: 0.15, shareholders_equity: 4_000, goodwill: 500, intangibles: 300, cash: 1_600, total_debt: 1_000, net_debt: -600, shares_diluted: 1_000 }),
    year(2022, { revenue: 7_000, operating_margin: 0.43, net_income: 2_100, effective_tax_rate: 0.15, shareholders_equity: 3_500, goodwill: 500, intangibles: 300, cash: 1_400, total_debt: 1_000, net_debt: -400, shares_diluted: 1_000 }),
    year(2021, { revenue: 6_000, operating_margin: 0.41, net_income: 1_800, effective_tax_rate: 0.15, shareholders_equity: 3_000, goodwill: 500, intangibles: 300, cash: 1_200, total_debt: 1_000, net_debt: -200, shares_diluted: 1_000 }),
  ],
};

// ── T3a: degradation ──────────────────────────────────────────────────────────
assert.strictEqual(computeValuationFloor({ ticker: "EMPTY", years: [] }), undefined, "no years → undefined");
const thin: ValuationFloorInput = { ticker: "THIN", years: compounder.years.slice(0, 2) };
assert.strictEqual(computeValuationFloor(thin), undefined, "N<3 → undefined");

const floor = computeValuationFloor(compounder);
assert.ok(floor, "compounder produces a floor");
assert.strictEqual(floor!.provenance.years_used.length, 5, "5 years used");
assert.deepStrictEqual(floor!.provenance.discount_rate_band, [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH], "band recorded");
assert.strictEqual(floor!.provenance.share_count_basis, "diluted", "diluted basis");

// ── T3b: Graham NOPAT lamp + bridge (tax still flat 21% in Task 3) ───────────
// avg op margin = 0.43; latest revenue 10_000; nopat = 0.43×10000×(1−0.21) = 3_397
const g = floor!.graham_epv;
assert.ok(g.assessable, "graham assessable");
assert.ok(Math.abs(g.normalized_earnings! - 3_397) < 1, `nopat≈3397 got ${g.normalized_earnings}`);
// equity_high uses LOW rate: 3397/0.08 + cash2000 − debt1000 = 43_462.5
assert.ok(Math.abs(g.equity_value_high! - 43_462.5) < 1, `graham eq_high≈43462.5 got ${g.equity_value_high}`);
assert.ok(g.method.bridge.includes("cash") && g.method.bridge.includes("debt"), "graham bridges +cash −debt");
assert.ok(/unlevered/i.test(g.method.leverage_treatment), "graham unlevered");

// ── T3c: Buffett owner-earnings lamp, NO bridge ──────────────────────────────
// avg net income = 2_400; equity_high = 2400/0.08 = 30_000 (no bridge)
const b = floor!.buffett_epv;
assert.ok(b.assessable, "buffett assessable");
assert.ok(Math.abs(b.equity_value_high! - 30_000) < 1, `buffett eq_high≈30000 (no bridge) got ${b.equity_value_high}`);
assert.ok(/no .*bridge/i.test(b.method.bridge), "buffett states no bridge");

// ── T3d: levered fixture — buffett must NOT subtract debt ─────────────────────
const levered: ValuationFloorInput = {
  ticker: "LEVR",
  years: [
    year(2025, { revenue: 10_000, operating_margin: 0.2, net_income: 1_000, effective_tax_rate: 0.21, shareholders_equity: 2_000, cash: 500, total_debt: 8_000, net_debt: 7_500, shares_diluted: 1_000 }),
    year(2024, { revenue: 9_500, operating_margin: 0.2, net_income: 950, effective_tax_rate: 0.21, shareholders_equity: 1_900, cash: 480, total_debt: 8_000, net_debt: 7_520, shares_diluted: 1_000 }),
    year(2023, { revenue: 9_000, operating_margin: 0.2, net_income: 900, effective_tax_rate: 0.21, shareholders_equity: 1_800, cash: 460, total_debt: 8_000, net_debt: 7_540, shares_diluted: 1_000 }),
  ],
};
const lf = computeValuationFloor(levered)!;
// avg NI = 950 → buffett eq_high = 950/0.08 = 11_875 (debt NOT subtracted)
assert.ok(Math.abs(lf.buffett_epv.equity_value_high! - 11_875) < 1, `levered buffett eq_high≈11875 got ${lf.buffett_epv.equity_value_high}`);
assert.strictEqual(lf.high_leverage_warning, true, "levered trips high-leverage warning");

// ── T3e: moat franchise + negative-earnings degradation ──────────────────────
assert.strictEqual(floor!.moat_reading.signal, "franchise", `compounder franchise got ${floor!.moat_reading.signal}`);
const loss: ValuationFloorInput = {
  ticker: "LOSS",
  years: [
    year(2025, { revenue: 10_000, operating_margin: -0.1, net_income: -800, shareholders_equity: 4_000, cash: 500, total_debt: 0, net_debt: -500, shares_diluted: 1_000 }),
    year(2024, { revenue: 9_000, operating_margin: -0.05, net_income: -400, shareholders_equity: 4_200, cash: 500, total_debt: 0, net_debt: -500, shares_diluted: 1_000 }),
    year(2023, { revenue: 8_000, operating_margin: -0.08, net_income: -600, shareholders_equity: 4_400, cash: 500, total_debt: 0, net_debt: -500, shares_diluted: 1_000 }),
  ],
};
const lm = computeValuationFloor(loss)!;
assert.strictEqual(lm.graham_epv.assessable, false, "neg NOPAT → graham not assessable");
assert.strictEqual(lm.buffett_epv.assessable, false, "neg owner earnings → buffett not assessable");
assert.strictEqual(lm.asset_floor.assessable, true, "asset floor still emitted on losses");
assert.strictEqual(lm.moat_reading.signal, "value_destruction", "losses → value destruction");

console.log("epvFloor.check.ts: Task 3 (ported core) OK");

// Re-export helpers for later tasks (Tasks 4–5 append to this file).
export { compounder, levered, year };
```

- [ ] **Step 2: Run → fails** (`Cannot find module './epvFloor'`)

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts` → FAIL.

- [ ] **Step 3: Write `epvFloor.ts`** (ported engine; tax flat 21%, asset floor total-book — upgraded in Tasks 4–5)

```typescript
import type { AssetFloor, EpvLamp, MoatReading, ValuationFloor, ValuationFloorInput, ValuationFloorYear } from "./types";

export const DISCOUNT_RATE_LOW = 0.08;
export const DISCOUNT_RATE_HIGH = 0.1;
export const MAX_TAX_RATE = 0.21; // statutory cap
export const MIN_YEARS = 3;
export const TARGET_YEARS = 5;
export const LEVERAGE_WARN_RATIO = 1.0;
export const MOAT_FRANCHISE_MULTIPLE = 1.25;
export const MOAT_COMMODITY_FLOOR = 0.75;

const MAINT_CAPEX_RULE =
  "v1: maintenance capex set equal to D&A, so the depreciation add-back nets to zero (Buffett lamp = avg net income). Sales-driven maintenance-capex estimation deferred to v2.";

function avg(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function marginOf(y: ValuationFloorYear): number | undefined {
  if (y.operating_margin != null) return y.operating_margin;
  if (y.operating_income != null && y.revenue) return y.operating_income / y.revenue;
  return undefined;
}

function selectYears(years: ValuationFloorYear[]): ValuationFloorYear[] {
  return years
    .filter((y) => y.revenue != null && marginOf(y) != null && y.net_income != null)
    .sort((a, b) => b.fiscal_year - a.fiscal_year)
    .slice(0, TARGET_YEARS);
}

// Task 4 replaces this with a real averaged effective rate.
function normalizedTaxRate(years: ValuationFloorYear[]): { rate: number; basis: string } {
  void years;
  return { rate: MAX_TAX_RATE, basis: "Flat statutory 21% (v1 placeholder; upgraded in Task 4)." };
}

export function computeValuationFloor(input: ValuationFloorInput): ValuationFloor | undefined {
  const years = selectYears(input.years);
  if (years.length < MIN_YEARS) return undefined;

  const latest = years[0];
  const shares = years.map((y) => y.shares_diluted).find((s) => s != null && s > 0);
  if (shares == null) return undefined;

  const equity = latest.shareholders_equity;
  const cash = latest.cash ?? 0;
  const totalDebt = latest.total_debt ?? 0;
  const netDebt = latest.net_debt ?? totalDebt - cash;
  const yearsUsed = years.map((y) => y.fiscal_year);
  const tax = normalizedTaxRate(years);

  const grahamEpv = buildGrahamLamp(years, cash, totalDebt, shares, yearsUsed, tax.rate);
  const buffettEpv = buildBuffettLamp(years, shares, yearsUsed);
  const assetFloor = buildAssetFloor(latest, shares);
  const moatReading = buildMoatReading(grahamEpv, assetFloor);

  const netDebtToEquity = equity != null && equity > 0 ? netDebt / equity : undefined;
  const highLeverage = netDebtToEquity != null && netDebtToEquity > LEVERAGE_WARN_RATIO;

  return {
    graham_epv: grahamEpv,
    buffett_epv: buffettEpv,
    asset_floor: assetFloor,
    moat_reading: moatReading,
    high_leverage_warning: highLeverage,
    high_leverage_note: highLeverage
      ? "High leverage (net debt / shareholders' equity above 1.0): the single 8–10% rate band is a low-leverage / net-cash approximation and is directionally distorted here. The ranges are shown but should be read as degraded."
      : undefined,
    net_debt_to_equity: netDebtToEquity,
    provenance: {
      years_used: yearsUsed,
      as_of_fiscal_year: latest.fiscal_year,
      discount_rate_band: [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH],
      normalized_tax_rate: tax.rate,
      normalized_tax_rate_basis: tax.basis,
      maintenance_capex_rule: MAINT_CAPEX_RULE,
      share_count_basis: "diluted",
    },
  };
}

function buildGrahamLamp(
  years: ValuationFloorYear[],
  cash: number,
  totalDebt: number,
  shares: number,
  yearsUsed: number[],
  taxRate: number,
): EpvLamp {
  const method = {
    earnings_basis: "Normalized NOPAT = average operating margin over the years shown × latest-year revenue × (1 − normalized tax).",
    leverage_treatment: "Unlevered (pre-interest, attributable to all capital).",
    denominator: "Capitalized at the 8–10% rate band (read as a WACC proxy).",
    bridge: "Enterprise → equity bridge applied: + cash − total debt.",
    discount_rate_low: DISCOUNT_RATE_LOW,
    discount_rate_high: DISCOUNT_RATE_HIGH,
    years_used: yearsUsed,
    simplifications: [
      "No depreciation add-back (maintenance capex = D&A by construction in v1).",
      "Share-based compensation is left as a real expense (not added back).",
    ],
  };
  const latestRevenue = years[0].revenue!;
  const avgMargin = avg(years.map((y) => marginOf(y)!));
  const nopat = avgMargin * latestRevenue * (1 - taxRate);
  if (nopat <= 0) {
    return {
      label: "Graham earnings-power value (normalized NOPAT)",
      assessable: false,
      not_assessable_reason: "Normalized operating earnings are non-positive over the years shown; earnings power cannot be capitalized.",
      normalized_earnings: nopat,
      method,
    };
  }
  const equityLow = nopat / DISCOUNT_RATE_HIGH + cash - totalDebt;
  const equityHigh = nopat / DISCOUNT_RATE_LOW + cash - totalDebt;
  return {
    label: "Graham earnings-power value (normalized NOPAT)",
    assessable: true,
    normalized_earnings: nopat,
    equity_value_low: equityLow,
    equity_value_high: equityHigh,
    per_share_low: equityLow / shares,
    per_share_high: equityHigh / shares,
    method,
  };
}

function buildBuffettLamp(years: ValuationFloorYear[], shares: number, yearsUsed: number[]): EpvLamp {
  const method = {
    earnings_basis: "Owner earnings = average net income over the years shown (= net income + D&A − maintenance capex, with D&A − maintenance capex = 0 in v1).",
    leverage_treatment: "Levered (starts from net income, already after interest — an equity-holder stream).",
    denominator: "Capitalized at the 8–10% rate band (read as a cost-of-equity proxy).",
    bridge: "No enterprise→equity bridge: the capitalized result is already equity value (subtracting debt would double-count interest).",
    discount_rate_low: DISCOUNT_RATE_LOW,
    discount_rate_high: DISCOUNT_RATE_HIGH,
    years_used: yearsUsed,
    simplifications: [
      "Buffett's ± working-capital term is omitted in v1.",
      "One-time items are not separately normalized (multi-year averaging smooths them partially).",
      "Share-based compensation is left as a real expense (not added back).",
    ],
  };
  const ownerEarnings = avg(years.map((y) => y.net_income!));
  if (ownerEarnings <= 0) {
    return {
      label: "Buffett owner-earnings value",
      assessable: false,
      not_assessable_reason: "Normalized owner earnings are non-positive over the years shown; earnings power cannot be capitalized.",
      normalized_earnings: ownerEarnings,
      method,
    };
  }
  const equityLow = ownerEarnings / DISCOUNT_RATE_HIGH;
  const equityHigh = ownerEarnings / DISCOUNT_RATE_LOW;
  return {
    label: "Buffett owner-earnings value",
    assessable: true,
    normalized_earnings: ownerEarnings,
    equity_value_low: equityLow,
    equity_value_high: equityHigh,
    per_share_low: equityLow / shares,
    per_share_high: equityHigh / shares,
    method,
  };
}

// Task 5 replaces this with goodwill/intangibles removal + total-book fallback.
function buildAssetFloor(latest: ValuationFloorYear, shares: number): AssetFloor {
  const basis = "Total book value (shareholders' equity ÷ diluted shares); intangibles not separated (v1 placeholder; upgraded in Task 5).";
  const equity = latest.shareholders_equity;
  if (equity == null || equity <= 0) {
    return { assessable: false, not_assessable_reason: "Book value is negative or unavailable, so no asset floor is shown.", basis, intangibles_separated: false };
  }
  return { assessable: true, basis, intangibles_separated: false, total_value: equity, per_share: equity / shares };
}

function buildMoatReading(graham: EpvLamp, asset: AssetFloor): MoatReading {
  const basisNote =
    "Directional only, based on book value. A true franchise test compares earnings power against reproduction value (deferred to v2); against book value this reads systematically more franchise-like.";
  if (!graham.assessable) {
    return { signal: "value_destruction", label: "Normalized earnings are non-positive, so earnings power sits below the asset base — a value-destruction signal (not a verdict).", basis_note: basisNote };
  }
  if (!asset.assessable || asset.per_share == null) {
    return { signal: "not_assessable", label: "The earnings-power vs asset-base comparison is unavailable because there is no positive book-value floor.", basis_note: basisNote };
  }
  const epvMid = (graham.per_share_low! + graham.per_share_high!) / 2;
  const ratio = epvMid / asset.per_share;
  if (ratio >= MOAT_FRANCHISE_MULTIPLE) {
    return { signal: "franchise", label: "Earnings power sits well above the asset base — a franchise (moat) signal, not a verdict.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: asset.per_share };
  }
  if (ratio >= MOAT_COMMODITY_FLOOR) {
    return { signal: "commodity", label: "Earnings power sits near the asset base — a commodity-like profile with no clear moat signal.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: asset.per_share };
  }
  return { signal: "value_destruction", label: "Earnings power sits below the asset base — a value-destruction signal, not a verdict.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: asset.per_share };
}
```

- [ ] **Step 4: Run → passes**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: `epvFloor.check.ts: Task 3 (ported core) OK`

- [ ] **Step 5: Commit**
```bash
git add web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): relocate engine to ValuationFloorInput (ported core)"
```

---

## Task 4: Real averaged effective tax rate (TDD)

**Files:**
- Modify: `web/src/lib/valuation/epvFloor.ts` (replace `normalizedTaxRate`)
- Modify: `web/src/lib/valuation/epvFloor.check.ts` (append T4 block)

- [ ] **Step 1: Append failing T4 assertions** (before the final `console.log` / export line — move the export to stay last)

```typescript
// ── T4: real averaged effective tax rate, capped [0, 0.21], fallback 0.21 ─────
// compounder eff tax 0.15 every year → avg 0.15; nopat = 0.43×10000×(1−0.15) = 3_655
assert.ok(Math.abs(floor!.graham_epv.normalized_earnings! - 3_655) < 1, `nopat≈3655 at 15% tax got ${floor!.graham_epv.normalized_earnings}`);
assert.ok(Math.abs(floor!.provenance.normalized_tax_rate - 0.15) < 1e-9, `prov tax 0.15 got ${floor!.provenance.normalized_tax_rate}`);
assert.ok(/effective/i.test(floor!.provenance.normalized_tax_rate_basis), "tax basis says effective");

// cap at 21%: a fixture with 30% eff tax must clamp to 0.21
const highTax: ValuationFloorInput = { ticker: "HITAX", years: compounder.years.map((y) => ({ ...y, effective_tax_rate: 0.3 })) };
assert.ok(Math.abs(computeValuationFloor(highTax)!.provenance.normalized_tax_rate - 0.21) < 1e-9, "eff tax capped at 21%");

// floor at 0%: negative eff tax clamps to 0
const negTax: ValuationFloorInput = { ticker: "NEGTAX", years: compounder.years.map((y) => ({ ...y, effective_tax_rate: -0.1 })) };
assert.ok(Math.abs(computeValuationFloor(negTax)!.provenance.normalized_tax_rate - 0) < 1e-9, "eff tax floored at 0");

// all missing → fallback 0.21
const noTax: ValuationFloorInput = { ticker: "NOTAX", years: compounder.years.map(({ effective_tax_rate, ...rest }) => rest) };
const ntFloor = computeValuationFloor(noTax)!;
assert.ok(Math.abs(ntFloor.provenance.normalized_tax_rate - 0.21) < 1e-9, "missing tax → fallback 0.21");
assert.ok(/fallback|statutory/i.test(ntFloor.provenance.normalized_tax_rate_basis), "fallback basis labeled");
```

Also update the Task-3 log line text to `console.log("epvFloor.check.ts: Tasks 3–4 OK");` and keep `export { compounder, levered, year };` as the final line.

- [ ] **Step 2: Run → fails** (`nopat≈3655` — engine still flat 21%).

- [ ] **Step 3: Replace `normalizedTaxRate`**

```typescript
function normalizedTaxRate(years: ValuationFloorYear[]): { rate: number; basis: string } {
  const rates: number[] = [];
  for (const y of years) {
    let r = y.effective_tax_rate;
    if (r == null && y.income_tax_expense != null && y.pretax_income) r = y.income_tax_expense / y.pretax_income;
    if (r != null && Number.isFinite(r)) rates.push(r);
  }
  if (rates.length === 0) {
    return { rate: MAX_TAX_RATE, basis: "No effective-rate data available; fell back to the statutory 21%." };
  }
  const clamped = Math.min(MAX_TAX_RATE, Math.max(0, avg(rates)));
  return { rate: clamped, basis: `Average effective tax rate over ${rates.length} year(s), capped at the statutory 21%.` };
}
```

- [ ] **Step 4: Run → passes** (`epvFloor.check.ts: Tasks 3–4 OK`).

- [ ] **Step 5: Commit**
```bash
git add web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): real averaged effective tax rate (capped 0–21%, fallback)"
```

---

## Task 5: Real tangible book value (goodwill/intangibles removal) (TDD)

**Files:**
- Modify: `web/src/lib/valuation/epvFloor.ts` (replace `buildAssetFloor`)
- Modify: `web/src/lib/valuation/epvFloor.check.ts` (append T5 block)

- [ ] **Step 1: Append failing T5 assertions**

```typescript
// ── T5: real tangible book (equity − goodwill − intangibles) + fallbacks ─────
// compounder latest: equity 5000 − goodwill 500 − intangibles 300 = 4_200 → /1000 = 4.2
const af = floor!.asset_floor;
assert.ok(af.assessable, "asset floor assessable");
assert.strictEqual(af.intangibles_separated, true, "intangibles separated when present");
assert.ok(Math.abs(af.per_share! - 4.2) < 1e-9, `tangible per share 4.2 got ${af.per_share}`);
assert.ok(/tangible/i.test(af.basis), "basis says tangible");

// both goodwill & intangibles missing → total-book fallback + label
const noIntang: ValuationFloorInput = { ticker: "NOINT", years: compounder.years.map(({ goodwill, intangibles, ...rest }) => rest) };
const ni = computeValuationFloor(noIntang)!.asset_floor;
assert.strictEqual(ni.intangibles_separated, false, "no separation when both missing");
assert.ok(Math.abs(ni.per_share! - 5.0) < 1e-9, `total-book fallback 5.0 got ${ni.per_share}`);
assert.ok(/intangibles not separated|total book/i.test(ni.basis), "fallback basis labeled");

// negative tangible book → no floor
const negTangible: ValuationFloorInput = { ticker: "NEGT", years: compounder.years.map((y) => ({ ...y, goodwill: 4_900, intangibles: 300 })) };
const nt = computeValuationFloor(negTangible)!.asset_floor;
assert.strictEqual(nt.assessable, false, "negative tangible book → not assessable");
assert.strictEqual(nt.per_share, undefined, "no negative per-share floor");
```

Update the log line to `console.log("epvFloor.check.ts: all assertions passed (Tasks 3–5).");` (keep the `export` line last).

- [ ] **Step 2: Run → fails** (`intangibles separated when present` — still total-book).

- [ ] **Step 3: Replace `buildAssetFloor`** (note new signature already passes `latest`)

```typescript
function buildAssetFloor(latest: ValuationFloorYear, shares: number): AssetFloor {
  const equity = latest.shareholders_equity;
  if (equity == null) {
    return { assessable: false, not_assessable_reason: "Shareholders' equity is unavailable, so no asset floor is shown.", basis: "Unavailable.", intangibles_separated: false };
  }
  const hasIntangibleData = latest.goodwill != null || latest.intangibles != null;
  if (!hasIntangibleData) {
    const basis = "Total book value (shareholders' equity ÷ diluted shares); intangibles not separated — goodwill/intangibles unavailable this period.";
    if (equity <= 0) return { assessable: false, not_assessable_reason: "Book value is negative or unavailable, so no asset floor is shown.", basis, intangibles_separated: false };
    return { assessable: true, basis, intangibles_separated: false, total_value: equity, per_share: equity / shares };
  }
  const tangible = equity - (latest.goodwill ?? 0) - (latest.intangibles ?? 0);
  const basis = "Tangible book value = shareholders' equity − goodwill − intangibles, ÷ diluted shares.";
  if (tangible <= 0) {
    return { assessable: false, not_assessable_reason: "Tangible book value is negative, so no asset floor is shown.", basis, intangibles_separated: true };
  }
  return { assessable: true, basis, intangibles_separated: true, total_value: tangible, per_share: tangible / shares };
}
```

> Note: the compounder moat reading still resolves to `franchise` (tangible 4.2 vs EPV mid ≈ high), and the Task-3 `franchise` assertion stays valid.

- [ ] **Step 4: Run → passes** (`all assertions passed (Tasks 3–5).`).

- [ ] **Step 5: Commit**
```bash
git add web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): real tangible book value with intangibles removal + fallbacks"
```

---

## Task 6: `fundamentalsToFloorInput` mapper + barrel (TDD)

**Files:**
- Create: `web/src/lib/valuation/fundamentalsToFloorInput.ts`
- Create: `web/src/lib/valuation/fundamentalsToFloorInput.check.ts`
- Create: `web/src/lib/valuation/index.ts`

- [ ] **Step 1: Write the failing mapper check** `fundamentalsToFloorInput.check.ts`

```typescript
/**
 * fundamentalsToFloorInput.check.ts
 * Run: cd web && npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts
 */
import assert from "node:assert";
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
import { fundamentalsToFloorInput } from "./fundamentalsToFloorInput";
import { computeValuationFloor } from "./epvFloor";

function fy(year: number, periodEnd: string, fiscalPeriod: string, o: Partial<FundamentalPeriod>): FundamentalPeriod {
  return {
    ticker: "ZZ", cik: "1", form: "10-K", fiscal_year: year, fiscal_period: fiscalPeriod, period_end: periodEnd,
    filing_date: null, accession_number: null, revenue: null, gross_profit: null, operating_income: null,
    net_income: null, eps_diluted: null, shares_diluted: null, operating_cash_flow: null, capex: null,
    free_cash_flow: null, d_and_a: null, stock_based_comp: null, rd_expense: null, sga_expense: null,
    interest_expense: null, pretax_income: null, income_tax_expense: null, dividends_paid: null,
    share_repurchases: null, cash_and_equivalents: null, short_term_investments: null, current_assets: null,
    current_liabilities: null, total_assets: null, total_liabilities: null, total_debt: null, ppe_net: null,
    goodwill: null, intangibles: null, shareholders_equity: null, minority_interest: null, preferred_equity: null,
    shares_outstanding: null, ebitda: null, working_capital: null, effective_tax_rate: null, revenue_yoy: null,
    net_income_yoy: null, fcf_yoy: null, gross_margin: null, operating_margin: null, net_margin: null, fcf_margin: null,
    ...o,
  };
}

// Mixed FY/quarterly rows, unsorted; only FY rows, most-recent-first, mapped.
const rows: FundamentalPeriod[] = [
  fy(2024, "2024-12-31", "FY", { revenue: 9_000, operating_margin: 0.44, net_income: 2_700, effective_tax_rate: 0.15, shareholders_equity: 4_500, goodwill: 500, intangibles: 300, cash_and_equivalents: 1_800, total_debt: 1_000, net_debt: -800, shares_diluted: 1_000 }),
  fy(2025, "2025-03-31", "Q1", { revenue: 2_500 }), // non-FY → dropped
  fy(2025, "2025-12-31", "FY", { revenue: 10_000, operating_margin: 0.45, net_income: 3_000, effective_tax_rate: 0.15, shareholders_equity: 5_000, goodwill: 500, intangibles: 300, cash_and_equivalents: 2_000, total_debt: 1_000, net_debt: -1_000, shares_diluted: 1_000 }),
  fy(2023, "2023-12-31", "FY", { revenue: 8_000, operating_margin: 0.42, net_income: 2_400, effective_tax_rate: 0.15, shareholders_equity: 4_000, goodwill: 500, intangibles: 300, cash_and_equivalents: 1_600, total_debt: 1_000, net_debt: -600, shares_diluted: 1_000 }),
];

const input = fundamentalsToFloorInput("ZZ", "Zed Co", rows);
assert.strictEqual(input.years.length, 3, "only 3 FY rows mapped (Q1 dropped)");
assert.strictEqual(input.years[0].fiscal_year, 2025, "most-recent-first");
assert.strictEqual(input.years[0].cash, 2_000, "cash_and_equivalents → cash");
assert.strictEqual(input.ticker, "ZZ");
assert.strictEqual(input.company_name, "Zed Co");

// End-to-end: mapped input drives the engine
const floor = computeValuationFloor(input);
assert.ok(floor, "mapped input produces a floor");
assert.strictEqual(floor!.provenance.years_used[0], 2025, "engine sees 2025 latest");

// Empty / undefined-safe
assert.strictEqual(fundamentalsToFloorInput("X", undefined, []).years.length, 0, "empty rows → empty years");

console.log("fundamentalsToFloorInput.check.ts: OK");
```

- [ ] **Step 2: Run → fails** (`Cannot find module './fundamentalsToFloorInput'`).

- [ ] **Step 3: Write the mapper** `fundamentalsToFloorInput.ts`

```typescript
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
import type { ValuationFloorInput, ValuationFloorYear } from "./types";

const u = (v: number | null | undefined): number | undefined => (v == null ? undefined : v);

/** Map stored FundamentalPeriod rows (FY only) to the engine's input contract. */
export function fundamentalsToFloorInput(
  ticker: string,
  companyName: string | null | undefined,
  rows: FundamentalPeriod[] | undefined,
): ValuationFloorInput {
  const years: ValuationFloorYear[] = (rows ?? [])
    .filter((r) => r.fiscal_period === "FY" && r.fiscal_year != null)
    .sort((a, b) => (b.period_end ?? "").localeCompare(a.period_end ?? ""))
    .map((r) => ({
      fiscal_year: r.fiscal_year as number,
      revenue: u(r.revenue),
      operating_income: u(r.operating_income),
      operating_margin: u(r.operating_margin),
      net_income: u(r.net_income),
      pretax_income: u(r.pretax_income),
      income_tax_expense: u(r.income_tax_expense),
      effective_tax_rate: u(r.effective_tax_rate),
      shareholders_equity: u(r.shareholders_equity),
      goodwill: u(r.goodwill),
      intangibles: u(r.intangibles),
      cash: u(r.cash_and_equivalents),
      total_debt: u(r.total_debt),
      net_debt: u(r.net_debt),
      shares_diluted: u(r.shares_diluted),
    }));
  return { ticker, company_name: companyName ?? undefined, years };
}
```

- [ ] **Step 4: Run → passes** (`fundamentalsToFloorInput.check.ts: OK`).

- [ ] **Step 5: Write the barrel** `index.ts`

```typescript
export * from "./types";
export * from "./epvFloor";
export * from "./fundamentalsToFloorInput";
```

- [ ] **Step 6: Verify + commit**
```bash
cd web && npx tsc --noEmit && npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts
git add web/src/lib/valuation/fundamentalsToFloorInput.ts web/src/lib/valuation/fundamentalsToFloorInput.check.ts web/src/lib/valuation/index.ts
git commit -m "feat(valuation): FundamentalPeriod → ValuationFloorInput mapper + barrel"
```

---

## Task 7: RSC presentational card

**Files:**
- Create: `web/src/components/valuation/EarningsPowerFloorCard.tsx`

- [ ] **Step 1: Write the card** (no `"use client"` — pure RSC; self-contained formatters; uses site `Card` + `--tt-*`)

```tsx
import { AlertCircle, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EpvLamp, ValuationFloor } from "@/lib/valuation";

function perShare(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function range(low: number | undefined, high: number | undefined): string {
  if (low == null || high == null) return "—";
  return `${perShare(low)} – ${perShare(high)}`;
}
function pct(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function LampBlock({ lamp }: { lamp: EpvLamp }) {
  return (
    <div className="rounded-lg border border-[var(--tt-border)] p-4">
      <h4 className="text-sm font-medium text-[var(--tt-text)]">{lamp.label}</h4>
      {lamp.assessable ? (
        <p className="mt-2 font-mono text-lg text-[var(--tt-text)]">{range(lamp.per_share_low, lamp.per_share_high)}</p>
      ) : (
        <p className="mt-2 text-sm text-[var(--tt-muted)]">{lamp.not_assessable_reason ?? "Earnings power not assessable."}</p>
      )}
      <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Intrinsic value range (per share)</p>
      <dl className="mt-3 space-y-1.5 text-xs text-[var(--tt-muted)]">
        <div><dt className="inline font-medium text-[var(--tt-faint)]">Earnings basis: </dt><dd className="inline">{lamp.method.earnings_basis}</dd></div>
        <div><dt className="inline font-medium text-[var(--tt-faint)]">Leverage: </dt><dd className="inline">{lamp.method.leverage_treatment}</dd></div>
        <div><dt className="inline font-medium text-[var(--tt-faint)]">Denominator: </dt><dd className="inline">{lamp.method.denominator}</dd></div>
        <div><dt className="inline font-medium text-[var(--tt-faint)]">Bridge: </dt><dd className="inline">{lamp.method.bridge}</dd></div>
        <div><dt className="inline font-medium text-[var(--tt-faint)]">Years: </dt><dd className="inline">{lamp.method.years_used.join(", ")}</dd></div>
      </dl>
      {lamp.method.simplifications.length > 0 ? (
        <div className="mt-3">
          <h5 className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-[var(--tt-faint)]">v1 simplifications</h5>
          <ul className="space-y-1 text-xs text-[var(--tt-muted)]">
            {lamp.method.simplifications.map((s) => (
              <li key={s} className="border-l border-[var(--tt-border-strong)] pl-2">{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function EarningsPowerFloorCard({ floor }: { floor: ValuationFloor | undefined }) {
  if (!floor) return null;
  const { graham_epv, buffett_epv, asset_floor, moat_reading, provenance } = floor;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-4 text-[var(--tt-accent)]" />
          Earnings Power &amp; Asset Floor
        </CardTitle>
        <CardDescription>
          Zero-growth earnings-power value (EPV) and a tangible asset floor. Deterministic and price-free — these are
          intrinsic value ranges, not price forecasts or recommendations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {floor.high_leverage_warning ? (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--tt-warn)] bg-muted/50 p-3 text-sm text-[var(--tt-warn)]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{floor.high_leverage_note}</span>
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <LampBlock lamp={graham_epv} />
          <LampBlock lamp={buffett_epv} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--tt-border)] p-3">
            <div className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Asset floor (per share)</div>
            {asset_floor.assessable ? (
              <div className="mt-1 font-mono text-sm text-[var(--tt-text)]">{perShare(asset_floor.per_share)}</div>
            ) : (
              <div className="mt-1 text-sm text-[var(--tt-muted)]">{asset_floor.not_assessable_reason}</div>
            )}
            <p className="mt-1 text-xs text-[var(--tt-muted)]">{asset_floor.basis}</p>
          </div>
          <div className="rounded-lg border border-[var(--tt-border)] p-3">
            <div className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Moat reading (directional)</div>
            <div className="mt-1 text-sm text-[var(--tt-text)]">{moat_reading.label}</div>
            <p className="mt-1 text-xs text-[var(--tt-muted)]">{moat_reading.basis_note}</p>
          </div>
        </div>
        <p className="text-xs text-[var(--tt-faint)]">
          Window: FY {provenance.years_used.join(", ")} · discount band {pct(provenance.discount_rate_band[0])}–
          {pct(provenance.discount_rate_band[1])} · normalized tax {pct(provenance.normalized_tax_rate)} ({provenance.normalized_tax_rate_basis}) ·
          shares: {provenance.share_count_basis}.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify + commit**
```bash
cd web && npx tsc --noEmit
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): RSC Earnings Power & Asset Floor card"
```

---

## Task 8: Integrate into the stock page

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

- [ ] **Step 1: Add imports** (after the existing `buildStockProse`/`StockProse` imports, ~line 15-16)

```typescript
import { getSecCompanyData } from "@/lib/sec/read";
import { fundamentalsToFloorInput, computeValuationFloor } from "@/lib/valuation";
import { EarningsPowerFloorCard } from "@/components/valuation/EarningsPowerFloorCard";
```

- [ ] **Step 2: Compute the floor server-side.** In the page's async body, near where `stockProse` is built (~line 225-228), add:

```typescript
  const sec = await getSecCompanyData(resolvedTicker);
  const valuationFloor = computeValuationFloor(
    fundamentalsToFloorInput(resolvedTicker, sec.company?.company_name ?? null, sec.annual),
  );
```

> Use whatever the page's resolved uppercase ticker variable is named (the page already uppercases the ticker for CUSIP lookup — reuse that variable; do NOT re-derive). If the page has no single resolved-ticker variable, add `const resolvedTicker = ticker.toUpperCase();` near the top of the body and use it here.

- [ ] **Step 3: Render the card + drop the placeholder.** Replace the "coming soon" placeholder render (~line 148, `<p ...>{t.coming}</p>`) with the card:

```tsx
        <EarningsPowerFloorCard floor={valuationFloor} />
```

Then remove the now-unused `coming` copy keys (zh ~line 79, en ~line 89) and the `"Valuation data coming soon."` subtitle fragment (~line 233). If `t.coming` is referenced nowhere else after this, delete the key; `npx tsc --noEmit` will flag any leftover reference.

- [ ] **Step 4: Verify** — Run: `cd web && npx tsc --noEmit` → exit 0. (Card returns `null` when `valuationFloor` is undefined → thin tickers render nothing, no empty box.)

- [ ] **Step 5: Commit**
```bash
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(stocks): render Earnings Power & Asset Floor card from stored fundamentals"
```

---

## Task 9: Archive + delete the research presentation subsystem

**Files:** deletions (see list). The archive bookmark from Task 1 preserves everything.

- [ ] **Step 1: Delete the research presentation leg**

```bash
cd web
git rm -r \
  "src/app/[lang]/research" \
  "src/app/api/research" \
  src/components/research \
  src/lib/research
```

> This removes the orphaned engine's OLD location (`src/lib/research/valuation/epvFloor*`) too — the relocated copy under `src/lib/valuation/` is the live one. The research `sec` (live-fetch), `skills`, `workflow`, `gates/dataQualityGate`, `mock`, `risk`, `schemas`, and `index` all go with it.

- [ ] **Step 2: Find and fix any dangling references**

Run: `cd web && grep -rln "lib/research\|components/research\|api/research\|@/lib/research" src` — expected: **no matches**. If any appear, they are leftover imports; remove them.

- [ ] **Step 3: Verify type-check + full build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: both succeed; route list no longer contains `/api/research/[ticker]` or `/[lang]/research/[ticker]`.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "chore(research): archive + remove orphaned research presentation leg (preserved on archive/research-presentation-leg)"
```

---

## Task 10: Full verification

**Files:** none

- [ ] **Step 1: Engine + mapper checks green**
```bash
cd web
npx tsx src/lib/valuation/epvFloor.check.ts
npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts
```
Expected: `all assertions passed (Tasks 3–5).` and `fundamentalsToFloorInput.check.ts: OK`.

- [ ] **Step 2: Type-check + build**
```bash
cd web && npx tsc --noEmit && npm run build
```
Expected: both succeed; `/research` routes gone.

- [ ] **Step 3: Manual — stock page renders the card.** Start a server on a free port (main checkout may hold 3001):
```bash
cd web && npm run start -- --port 3007   # build already done
```
Load `/en/stocks/AAPL` and `/en/stocks/MSFT`: confirm the "Earnings Power & Asset Floor" card shows two EPV per-share ranges, method notes, asset floor (basis says "Tangible book value …"), a moat reading, the high-leverage row only when net debt/equity > 1.0, and a provenance footer whose normalized-tax line shows the real averaged rate (not a flat 21%) for a normal payer. Confirm no "coming soon" placeholder remains.

- [ ] **Step 4: Manual — degradation.** A ticker with < 3 FY rows (or no stored fundamentals) renders no card (zero empty box), page still 200.

- [ ] **Step 5: Manual — no live SEC / no Finnhub.** Confirm the stock page reads from the DB (`getSecCompanyData`) — no SEC EDGAR companyfacts fetch and no Finnhub call happen on stock-page render (grep the running server logs / network if needed). `/en/research/AAPL` now 404s.

- [ ] **Step 6: Stop. Do NOT push or open a PR.** Report the branch name and verification results.

---

## Self-Review

**Spec coverage:** §2 mount on stock page → Tasks 7-8; §3 input contract → Task 2; §4 engine reuse + real tax + real tangible book → Tasks 3-5; data mapper §3 → Task 6; §5 RSC card → Task 7; §6 archive+delete (exact list, archive branch) → Tasks 1, 9; §7 degradation/compliance → Tasks 3,5,8 (card returns null) + no forbidden words in card strings; §8 provenance (years/as-of/tax basis/rate band/share basis) → Task 2 type + Task 4 basis; §9 checks/tsc/build/manual → Task 10. ✅

**Placeholder scan:** every code step is complete; the two intentional in-engine placeholders (flat 21% tax in Task 3, total-book asset floor in Task 3) are explicitly replaced by Tasks 4 and 5 respectively, and labeled as such in code comments. No TODO/TBD left at plan end. ✅

**Type consistency:** `ValuationFloorInput`/`ValuationFloorYear` defined in Task 2, consumed verbatim in Tasks 3-6; `computeValuationFloor(input)` signature stable from Task 3; `buildAssetFloor(latest, shares)` signature set in Task 3 and only its body changes in Task 5; mapper field rename `cash_and_equivalents → cash` matches `ValuationFloorYear.cash`; card imports `EpvLamp`/`ValuationFloor` from the Task-2 barrel. ✅

**Compliance:** card copy uses only method-name labels ("earnings-power value", "asset floor", "intrinsic value range", "not price forecasts or recommendations"); no undervalued/cheap/fair value/target price/margin of safety; no price comparison; `dataQualityGate` removed with the research leg (grep-confirmed no external dependency). ✅
