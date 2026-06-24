# Buffett Owner-Earnings DCF + Two-Method Cross-Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, independent intrinsic-value method (deterministic conservative three-stage Buffett Owner-Earnings DCF) and reconcile it against the already-shipped Greenwald fair value (`max(AV,EPV)+GV`) as a §9 cross-check — never emitting a single target price.

**Architecture:** Two new pure functions (`deriveOeDcf`, `reconcileMethods`) in a new file `web/src/lib/valuation/ownerEarningsDcf.ts`, fed by engine-v2 output already on `ValuationFloor` plus a new server-only live DGS10 read. The page wires the new data into the existing `EarningsPowerFloorCard`, which gains one "two-method cross-check" RSC section. Engine pure functions, ingest, `/research`, and the price layer are **not touched**.

**Tech Stack:** TypeScript, Next.js 16 App Router (RSC, no `"use client"`), React `cache()`, FRED CSV fetch (`fetchFredSeries`), `node:assert` + `npx tsx` test harness.

## Global Constraints

- **No single intrinsic value / target price, ever.** OE-DCF is always a three-tier range; the product face is the cross-check reading vs Greenwald. (spec §6)
- **No BUY/SELL/HOLD/rating words** in any emitted string. Consistency readings are observations, not verdicts. A compliance test greps emitted output for forbidden tokens.
- **Every dangerous knob takes the most conservative deterministic value:** zero-growth terminal, strict discount end, earnings-capped growth, growth faded to zero. All assumptions externalized.
- **OE base = `buffett_epv.normalized_earnings`** (engine-v2 real owner earnings). Not assessable → this layer emits nothing.
- **Growth `g1 = clamp(net-income/OE CAGR, 0, 0.10)`**; declining history → `g1 = 0`. No invented optimistic forecasts.
- **No enterprise→equity bridge** (OE is already a levered equity stream; adding net cash / subtracting debt would double-count interest) — consistent with the engine-v2 owner-earnings lamp. Label it.
- **Terminal value is zero-growth:** `TV = OE_10 / r`. No Gordon, no exit multiple.
- **Discount band from live DGS10** (FRED 10Y), as-of stamped; `r_aggressive = DGS10 + 0.025`, `r_strict = 0.10`; conservative end = higher discount; if DGS10 ≥ 7.5% inverts the band → take `[min,max]` and flag; DGS10 unreadable → fall back to the engine 8–10% band and flag "not anchored to live treasury".
- **Provenance stamped:** OE fiscal years, DGS10 as-of, CAGR window, degradations (no bridge, fallback band, terminal share >70%).
- **No tests run for the wider app** ([[no-tests-solo-dev]]); verification gates are `npx tsx <file>.check.ts`, `tsc --noEmit`, and `npm run build` in the worktree (which has real `node_modules`). If `npm run build` fails solely on Google-Fonts network blocking ([[local-build-google-fonts-blocked]]), record the font error verbatim and treat `tsc --noEmit` as the passing gate — do not let an unrelated font fetch failure mask a real type error.

---

## File Structure

- **Create** `web/src/lib/valuation/ownerEarningsDcf.ts` — `deriveOeDcf` + `reconcileMethods` (pure).
- **Create** `web/src/lib/valuation/ownerEarningsDcf.check.ts` — `npx tsx` test harness.
- **Modify** `web/src/lib/valuation/types.ts` — add `OeDcfAssessment`, `OeDcfTier`, `DiscountBandProvenance`, `MethodReconciliation`, `ConsistencyReading`.
- **Modify** `web/src/lib/valuation/index.ts` — re-export the two new functions + types.
- **Create** `web/src/lib/managers/treasuryRead.ts` — server-only cached `getLatestDgs10()` + pure `pickLatestFredPoint` helper.
- **Modify** `web/src/app/[lang]/stocks/[ticker]/page.tsx` — capture floor input, read DGS10, compute `oeDcf` + `reconciliation`, pass to card.
- **Modify** `web/src/components/valuation/EarningsPowerFloorCard.tsx` — accept `oeDcf` + `reconciliation` props, render cross-check section.

---

## Engine interfaces this plan consumes (verbatim, do not change)

From `web/src/lib/valuation/types.ts` / `epvFloor.ts` / `strikeZone.ts`:

```ts
// ValuationFloor.buffett_epv : EpvLamp
type EpvLamp = {
  label: string;
  assessable: boolean;
  not_assessable_reason?: string;
  normalized_earnings?: number;   // OE base
  equity_value_low?: number;      // = OE / 0.10
  equity_value_high?: number;     // = OE / 0.08
  per_share_low?: number;         // equity_value_low / shares_diluted
  per_share_high?: number;        // equity_value_high / shares_diluted
  sbc_to_oe_pct?: number;
  method: { years_used: number[]; /* ... */ };
};

// ValuationFloorInput.years : ValuationFloorYear[]  (most-recent-first)
type ValuationFloorYear = { fiscal_year: number; net_income?: number; /* ... */ };

// deriveStrikeZone(...).epv?.ceilings  — the Greenwald three-tier (per share), or undefined when GV collapsed
type Ceilings = { pessimistic: number; neutral: number; optimistic: number };

// getLatestPrice(ticker) : LatestPrice | null
type LatestPrice = { close: number; date: string; currency: string; source?: string };
```

Recover diluted share count from the lamp (no raw-shares plumbing needed):
`shares = buffett_epv.equity_value_low! / buffett_epv.per_share_low!` (both present iff `assessable`).

FRED `DGS10` values are in **percent** (e.g. `4.25` → 4.25%); divide by 100 before use.

---

### Task 1: OE-DCF types + `deriveOeDcf` pure function

**Files:**
- Modify: `web/src/lib/valuation/types.ts` (append new types)
- Create: `web/src/lib/valuation/ownerEarningsDcf.ts`
- Create: `web/src/lib/valuation/ownerEarningsDcf.check.ts`

**Interfaces:**
- Consumes: `ValuationFloor`, `ValuationFloorYear`, `LatestPrice` from `./types`.
- Produces:
  - `OeDcfAssessment` (shape below), `OeDcfTier`, `DiscountBandProvenance`.
  - `export const GROWTH_CAP = 0.10;`, `export const R_STRICT = 0.10;`, `export const DGS10_PREMIUM = 0.025;`, `export const FALLBACK_BAND: [number, number] = [0.08, 0.10];`, `export const TERMINAL_SHARE_FLAG = 0.70;`, `export const OE_YIELD_FLAG_BPS = 300;`, `export const QUICK_CHECK_DEV_FLAG = 0.50;`, `export const PROJECTION_YEARS = 10;`.
  - `export function deriveOeDcf(floor: ValuationFloor, years: ValuationFloorYear[], dgs10: { value: number; date: string } | null, price: LatestPrice | null): OeDcfAssessment`
  - `export function pickLatestFredPoint(points: { date: string; value: number | null }[]): { value: number; date: string } | null` (used here for the CAGR-independent helper test and re-used by Task 3 via import).

- [ ] **Step 1: Append types to `types.ts`**

Append at end of `web/src/lib/valuation/types.ts`:

```ts
// ── Buffett Owner-Earnings DCF (second intrinsic-value method) ──────────────

export type DiscountBandProvenance = {
  r_low: number;        // aggressive end (lower discount) — normally DGS10 + 0.025
  r_high: number;       // strict end (higher discount)   — normally 0.10
  midpoint: number;     // (r_low + r_high) / 2
  dgs10_value?: number; // decimal (e.g. 0.0425), undefined when fallback
  dgs10_date?: string;  // FRED as-of
  anchored: boolean;    // false → fallback band, not anchored to live treasury
  inverted: boolean;    // DGS10 ≥ 7.5% forced r_aggressive ≥ r_strict → [min,max]
  note: string;
};

export type OeDcfTier = {
  growth_stage1: number; // g applied in years 1–5
  discount_rate: number;
  equity_value: number;  // PV(explicit OE 1–10) + PV(zero-growth terminal)
  per_share: number;
};

export type OeDcfAssessment = {
  assessable: boolean;
  not_assessable_reason?: string;
  owner_earnings?: number;   // OE_0 base = buffett_epv.normalized_earnings
  oe_fiscal_years?: number[];
  cagr_raw?: number;         // pre-clamp net-income CAGR (may be negative/undefined)
  cagr_window?: number[];    // fiscal years at the two CAGR endpoints
  growth_g1?: number;        // clamp(cagr_raw, 0, 0.10)
  declined?: boolean;        // history declining → g1 forced 0
  discount?: DiscountBandProvenance;
  tiers?: { pessimistic: OeDcfTier; neutral: OeDcfTier; optimistic: OeDcfTier };
  per_share_low?: number;    // = tiers.pessimistic.per_share
  per_share_high?: number;   // = tiers.optimistic.per_share
  terminal_share_pct?: number;        // PV(TV)/equity at the neutral tier
  terminal_dependency_flag?: boolean; // > 0.70
  diagnostics?: {
    oe_yield?: number;             // (OE_0 / shares) / price
    oe_yield_vs_dgs10_bps?: number;
    oe_yield_flag?: boolean;       // |diff| > 300 bps
    quick_check_per_share?: number; // OE_0 / midpoint r / shares (no growth)
    quick_check_deviation_pct?: number; // |neutral_ps − quick| / quick
    quick_check_flag?: boolean;    // > 50%
  };
  no_bridge_note: string;
};
```

- [ ] **Step 2: Write the failing test file**

Create `web/src/lib/valuation/ownerEarningsDcf.check.ts`:

```ts
import assert from "node:assert";
import type { ValuationFloor, ValuationFloorYear, LatestPrice } from "./types";
import {
  deriveOeDcf,
  pickLatestFredPoint,
  GROWTH_CAP,
  R_STRICT,
} from "./ownerEarningsDcf";

// ── fixtures ────────────────────────────────────────────────────────────────
function lamp(oe: number, shares: number, yearsUsed: number[]) {
  return {
    label: "Buffett owner-earnings value",
    assessable: true,
    normalized_earnings: oe,
    equity_value_low: oe / 0.1,
    equity_value_high: oe / 0.08,
    per_share_low: oe / 0.1 / shares,
    per_share_high: oe / 0.08 / shares,
    method: { years_used: yearsUsed } as ValuationFloor["buffett_epv"]["method"],
  } as ValuationFloor["buffett_epv"];
}
function floorWith(buffett: ValuationFloor["buffett_epv"]): ValuationFloor {
  // Only buffett_epv is read by deriveOeDcf; other fields are stubs.
  return { kind: "floor", buffett_epv: buffett } as unknown as ValuationFloor;
}
function yr(fy: number, net_income: number): ValuationFloorYear {
  return { fiscal_year: fy, net_income };
}
const price = (close: number): LatestPrice => ({ close, date: "2026-06-20", currency: "USD" });

// ── 1. pickLatestFredPoint skips nulls, takes most recent ────────────────────
assert.deepStrictEqual(
  pickLatestFredPoint([
    { date: "2026-06-17", value: 4.2 },
    { date: "2026-06-18", value: null },
  ]),
  { value: 4.2, date: "2026-06-17" },
);
assert.strictEqual(pickLatestFredPoint([{ date: "x", value: null }]), null);

// ── 2. growth: rising history → g1 = clamped CAGR, faded, three-stage ────────
{
  // net income 100→133.1 over FY2021→2024 (3 periods) = 10% CAGR exactly.
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4.25, date: "2026-06-19" }, price(120));
  assert.ok(r.assessable, "rising history assessable");
  assert.ok(Math.abs(r.growth_g1! - 0.1) < 1e-9, `g1≈0.10 got ${r.growth_g1}`);
  assert.ok(r.growth_g1! <= GROWTH_CAP, "g1 capped");
  // three ordered tiers
  assert.ok(r.per_share_low! < r.tiers!.neutral.per_share, "pess < neutral");
  assert.ok(r.tiers!.neutral.per_share < r.per_share_high!, "neutral < opt");
  // pessimistic uses ½g1 and strict discount
  assert.ok(Math.abs(r.tiers!.pessimistic.growth_stage1 - 0.05) < 1e-9, "pess g = ½g1");
  assert.strictEqual(r.tiers!.pessimistic.discount_rate, R_STRICT, "pess r = strict");
}

// ── 3. g1 capped at 10% when CAGR exceeds cap ────────────────────────────────
{
  const years = [yr(2024, 400), yr(2023, 200), yr(2022, 100)]; // ~100% CAGR
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4, date: "d" }, null);
  assert.strictEqual(r.growth_g1, GROWTH_CAP, "g1 hard-capped at 0.10");
}

// ── 4. declining history → g1 = 0 ────────────────────────────────────────────
{
  const years = [yr(2024, 80), yr(2023, 90), yr(2022, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4, date: "d" }, null);
  assert.strictEqual(r.growth_g1, 0, "declining → g1 0");
  assert.strictEqual(r.declined, true, "declined flag");
}

// ── 5. discount band from DGS10 (normal, ordered) ────────────────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4.25, date: "2026-06-19" }, null);
  assert.ok(Math.abs(r.discount!.r_low - (0.0425 + 0.025)) < 1e-9, "r_low = DGS10/100 + 0.025");
  assert.strictEqual(r.discount!.r_high, 0.1, "r_high = strict 0.10");
  assert.strictEqual(r.discount!.anchored, true, "anchored");
  assert.strictEqual(r.discount!.inverted, false, "not inverted");
  assert.strictEqual(r.discount!.dgs10_date, "2026-06-19", "as-of stamped");
}

// ── 6. inversion: DGS10 ≥ 7.5% → [min,max] + flag ────────────────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 8, date: "d" }, null);
  assert.strictEqual(r.discount!.inverted, true, "inverted flag");
  assert.ok(r.discount!.r_low <= r.discount!.r_high, "r_low ≤ r_high after min/max");
}

// ── 7. DGS10 missing → fallback band, not anchored ───────────────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], null, null);
  assert.strictEqual(r.discount!.anchored, false, "fallback not anchored");
  assert.deepStrictEqual([r.discount!.r_low, r.discount!.r_high], [0.08, 0.1], "fallback 8–10%");
}

// ── 8. zero-growth terminal share + >70% flag ────────────────────────────────
{
  // flat earnings, no growth → all value is terminal-ish; terminal_share computed.
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, null);
  assert.ok(r.terminal_share_pct! > 0 && r.terminal_share_pct! < 1, "terminal share in (0,1)");
  assert.strictEqual(r.terminal_dependency_flag, r.terminal_share_pct! > 0.7, "flag matches threshold");
}

// ── 9. no bridge: equity value uses OE directly, per share = equity/shares ────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, null);
  // neutral per-share = neutral equity / 100 shares
  assert.ok(Math.abs(r.tiers!.neutral.per_share - r.tiers!.neutral.equity_value / 100) < 1e-6, "per share = equity/shares");
  assert.ok(/no .*bridge/i.test(r.no_bridge_note), "no-bridge note present");
}

// ── 10. diagnostics: OE yield vs DGS10, quick-check deviation ─────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, price(50));
  // OE per share = 1000/100 = 10; yield = 10/50 = 0.20
  assert.ok(Math.abs(r.diagnostics!.oe_yield! - 0.2) < 1e-9, "oe yield 20%");
  assert.ok(typeof r.diagnostics!.oe_yield_flag === "boolean", "oe yield flag set");
  assert.ok(typeof r.diagnostics!.quick_check_flag === "boolean", "quick check flag set");
}

// ── 11. degradation: OE not assessable → no output ───────────────────────────
{
  const dead = { label: "x", assessable: false, method: { years_used: [] } } as unknown as ValuationFloor["buffett_epv"];
  const r = deriveOeDcf(floorWith(dead), [yr(2024, 100)], { value: 4, date: "d" }, null);
  assert.strictEqual(r.assessable, false, "not assessable");
  assert.ok(r.not_assessable_reason, "reason present");
  assert.strictEqual(r.tiers, undefined, "no tiers");
}

// ── 12. compliance: emitted strings carry no advice/target tokens ────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 110), yr(2023, 100)], { value: 4, date: "d" }, price(50));
  const blob = JSON.stringify(r).toLowerCase();
  for (const bad of ["buy", "sell", " hold", "target price", "rating", "recommend"]) {
    assert.ok(!blob.includes(bad), `no "${bad}" token in OE-DCF output`);
  }
}

console.log("ownerEarningsDcf.check.ts: deriveOeDcf OK");
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: FAIL — `Cannot find module './ownerEarningsDcf'` (file not yet created).

- [ ] **Step 4: Implement `ownerEarningsDcf.ts` (deriveOeDcf half)**

Create `web/src/lib/valuation/ownerEarningsDcf.ts`:

```ts
import type {
  ValuationFloor,
  ValuationFloorYear,
  LatestPrice,
  OeDcfAssessment,
  OeDcfTier,
  DiscountBandProvenance,
} from "./types";

export const GROWTH_CAP = 0.1;
export const R_STRICT = 0.1;
export const DGS10_PREMIUM = 0.025;
export const FALLBACK_BAND: [number, number] = [0.08, 0.1];
export const TERMINAL_SHARE_FLAG = 0.7;
export const OE_YIELD_FLAG_BPS = 300;
export const QUICK_CHECK_DEV_FLAG = 0.5;
export const PROJECTION_YEARS = 10;
const INVERSION_DGS10 = 0.075; // DGS10 ≥ 7.5% inverts the band

const NO_BRIDGE_NOTE =
  "No enterprise→equity bridge: owner earnings already flow to equity holders (post-interest), so no net cash is added and no debt subtracted — matching the engine owner-earnings lamp.";

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Last FRED point with a numeric value, or null. Shared with the DGS10 reader. */
export function pickLatestFredPoint(
  points: { date: string; value: number | null }[],
): { value: number; date: string } | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p && p.date && p.value !== null && Number.isFinite(p.value)) {
      return { value: p.value as number, date: p.date };
    }
  }
  return null;
}

/** Net-income CAGR across the input years (most-recent-first). Returns endpoints used. */
function netIncomeCagr(years: ValuationFloorYear[]): {
  cagr?: number;
  window?: number[];
} {
  const pts = years
    .filter((y) => y.net_income != null && Number.isFinite(y.net_income))
    .map((y) => ({ fy: y.fiscal_year, ni: y.net_income as number }));
  if (pts.length < 2) return {};
  // most-recent-first → [0] = latest, [last] = oldest
  const latest = pts[0];
  const oldest = pts[pts.length - 1];
  const periods = latest.fy - oldest.fy;
  if (periods <= 0 || oldest.ni <= 0 || latest.ni <= 0) {
    return { cagr: latest.ni < oldest.ni ? -1 : undefined, window: [oldest.fy, latest.fy] };
  }
  const cagr = Math.pow(latest.ni / oldest.ni, 1 / periods) - 1;
  return { cagr, window: [oldest.fy, latest.fy] };
}

/** Project OE for years 1..10: stage1 constant g1 (Y1–5), stage2 linear fade g1→0 (Y6–10). */
function projectOe(oe0: number, g1: number): number[] {
  const path: number[] = [];
  let prev = oe0;
  for (let t = 1; t <= 5; t++) {
    prev = prev * (1 + g1);
    path.push(prev);
  }
  for (let t = 6; t <= PROJECTION_YEARS; t++) {
    const g = (g1 * (PROJECTION_YEARS - t)) / 5; // t=6 → g1·4/5 … t=10 → 0
    prev = prev * (1 + g);
    path.push(prev);
  }
  return path; // length 10, path[9] = OE_10
}

/** One tier: PV(explicit OE 1–10) + PV(zero-growth terminal OE_10/r). */
function dcfTier(oe0: number, g1: number, r: number, shares: number): {
  equity: number;
  perShare: number;
  pvTv: number;
} {
  const oe = projectOe(oe0, g1);
  let pvExplicit = 0;
  for (let t = 1; t <= PROJECTION_YEARS; t++) {
    pvExplicit += oe[t - 1] / Math.pow(1 + r, t);
  }
  const oe10 = oe[PROJECTION_YEARS - 1];
  const tv = oe10 / r; // zero-growth perpetuity at end of year 10
  const pvTv = tv / Math.pow(1 + r, PROJECTION_YEARS);
  const equity = pvExplicit + pvTv;
  return { equity, perShare: equity / shares, pvTv };
}

function discountBand(dgs10: { value: number; date: string } | null): DiscountBandProvenance {
  if (!dgs10 || !Number.isFinite(dgs10.value)) {
    return {
      r_low: FALLBACK_BAND[0],
      r_high: FALLBACK_BAND[1],
      midpoint: (FALLBACK_BAND[0] + FALLBACK_BAND[1]) / 2,
      anchored: false,
      inverted: false,
      note: "DGS10 unavailable — discount band falls back to the 8–10% engine range (not anchored to live treasury).",
    };
  }
  const dgs10Dec = dgs10.value / 100; // FRED percent → decimal
  const rAggressive = dgs10Dec + DGS10_PREMIUM;
  const inverted = dgs10Dec >= INVERSION_DGS10; // rAggressive ≥ 0.10
  const rLow = Math.min(rAggressive, R_STRICT);
  const rHigh = Math.max(rAggressive, R_STRICT);
  return {
    r_low: rLow,
    r_high: rHigh,
    midpoint: (rLow + rHigh) / 2,
    dgs10_value: dgs10Dec,
    dgs10_date: dgs10.date,
    anchored: true,
    inverted,
    note: inverted
      ? `DGS10 ${dgs10.value.toFixed(2)}% pushes the +2.5% end above the 10% strict threshold; band shown as [min,max].`
      : `Discount band: ${(rLow * 100).toFixed(2)}%–${(rHigh * 100).toFixed(2)}% (DGS10 +2.5% to a 10% strict end, as of ${dgs10.date}).`,
  };
}

export function deriveOeDcf(
  floor: ValuationFloor,
  years: ValuationFloorYear[],
  dgs10: { value: number; date: string } | null,
  price: LatestPrice | null,
): OeDcfAssessment {
  const lamp = floor.buffett_epv;
  if (
    !lamp.assessable ||
    lamp.normalized_earnings == null ||
    !(lamp.normalized_earnings > 0) ||
    lamp.equity_value_low == null ||
    lamp.per_share_low == null ||
    !(lamp.per_share_low > 0)
  ) {
    return {
      assessable: false,
      not_assessable_reason:
        lamp.not_assessable_reason ??
        "Owner earnings are not assessable (non-positive or missing), so the owner-earnings DCF is not shown.",
      no_bridge_note: NO_BRIDGE_NOTE,
    };
  }

  const oe0 = lamp.normalized_earnings;
  const shares = lamp.equity_value_low / lamp.per_share_low;

  const { cagr, window } = netIncomeCagr(years);
  const declined = cagr != null && cagr < 0;
  const g1 = cagr == null ? 0 : clamp(cagr, 0, GROWTH_CAP);

  const discount = discountBand(dgs10);

  const pessimistic: OeDcfTier = {
    growth_stage1: g1 / 2,
    discount_rate: discount.r_high,
    ...tierValues(oe0, g1 / 2, discount.r_high, shares),
  };
  const neutral: OeDcfTier = {
    growth_stage1: g1,
    discount_rate: discount.midpoint,
    ...tierValues(oe0, g1, discount.midpoint, shares),
  };
  const optimistic: OeDcfTier = {
    growth_stage1: g1,
    discount_rate: discount.r_low,
    ...tierValues(oe0, g1, discount.r_low, shares),
  };

  // terminal share computed at the neutral tier
  const neutralRun = dcfTier(oe0, g1, discount.midpoint, shares);
  const terminalShare = neutralRun.pvTv / neutralRun.equity;

  // diagnostics
  const oePerShare = oe0 / shares;
  const quickPerShare = oe0 / discount.midpoint / shares; // no-growth capitalization
  const quickDev = Math.abs(neutral.per_share - quickPerShare) / quickPerShare;
  let oeYield: number | undefined;
  let oeYieldBps: number | undefined;
  let oeYieldFlag: boolean | undefined;
  if (price && price.close > 0) {
    oeYield = oePerShare / price.close;
    if (discount.dgs10_value != null) {
      oeYieldBps = (oeYield - discount.dgs10_value) * 10_000;
      oeYieldFlag = Math.abs(oeYieldBps) > OE_YIELD_FLAG_BPS;
    }
  }

  return {
    assessable: true,
    owner_earnings: oe0,
    oe_fiscal_years: lamp.method.years_used,
    cagr_raw: cagr,
    cagr_window: window,
    growth_g1: g1,
    declined,
    discount,
    tiers: { pessimistic, neutral, optimistic },
    per_share_low: pessimistic.per_share,
    per_share_high: optimistic.per_share,
    terminal_share_pct: terminalShare,
    terminal_dependency_flag: terminalShare > TERMINAL_SHARE_FLAG,
    diagnostics: {
      oe_yield: oeYield,
      oe_yield_vs_dgs10_bps: oeYieldBps,
      oe_yield_flag: oeYieldFlag,
      quick_check_per_share: quickPerShare,
      quick_check_deviation_pct: quickDev,
      quick_check_flag: quickDev > QUICK_CHECK_DEV_FLAG,
    },
    no_bridge_note: NO_BRIDGE_NOTE,
  };
}

function tierValues(oe0: number, g1: number, r: number, shares: number): {
  equity_value: number;
  per_share: number;
} {
  const run = dcfTier(oe0, g1, r, shares);
  return { equity_value: run.equity, per_share: run.perShare };
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: PASS — `ownerEarningsDcf.check.ts: deriveOeDcf OK`

- [ ] **Step 6: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/valuation/types.ts web/src/lib/valuation/ownerEarningsDcf.ts web/src/lib/valuation/ownerEarningsDcf.check.ts
git commit -m "feat(valuation): deterministic three-stage owner-earnings DCF (deriveOeDcf)"
```

---

### Task 2: `reconcileMethods` two-method cross-check

**Files:**
- Modify: `web/src/lib/valuation/types.ts` (append reconcile types)
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts` (add `reconcileMethods`)
- Modify: `web/src/lib/valuation/ownerEarningsDcf.check.ts` (append tests)

**Interfaces:**
- Consumes: `OeDcfAssessment` (Task 1), the Greenwald `ceilings` object `{ pessimistic; neutral; optimistic } | undefined` (from `strikeZone.epv?.ceilings`), `LatestPrice | null`.
- Produces: `MethodReconciliation`, `ConsistencyReading`, and
  `export function reconcileMethods(greenwaldCeilings: { pessimistic: number; neutral: number; optimistic: number } | undefined, oeDcf: OeDcfAssessment | undefined, price: LatestPrice | null): MethodReconciliation`

- [ ] **Step 1: Append types to `types.ts`**

```ts
export type ConsistencyReading =
  | "both_margin_of_safety"
  | "within_value_range"
  | "above_both_values"
  | "not_comparable";

export type MethodReconciliation = {
  comparable: boolean;
  reason_if_not?: string;
  greenwald_range?: [number, number]; // [pessimistic, optimistic] per share
  buffett_range?: [number, number];
  price?: number;
  consistency?: ConsistencyReading;
  divergence_pct?: number;  // |gwMid − bfMid| / mean
  divergence_flag?: boolean; // > 0.20 — assumptions need review
};
```

- [ ] **Step 2: Append failing tests to `ownerEarningsDcf.check.ts`**

Add before the final `console.log`, and update the import line to also import `reconcileMethods`:

```ts
import { reconcileMethods } from "./ownerEarningsDcf";
import type { OeDcfAssessment } from "./types";

function oeStub(low: number, high: number): OeDcfAssessment {
  return {
    assessable: true,
    per_share_low: low,
    per_share_high: high,
    tiers: {
      pessimistic: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: low },
      neutral: { growth_stage1: 0, discount_rate: 0.09, equity_value: 0, per_share: (low + high) / 2 },
      optimistic: { growth_stage1: 0, discount_rate: 0.08, equity_value: 0, per_share: high },
    },
    no_bridge_note: "x",
  } as OeDcfAssessment;
}

// price below both ranges → both show margin of safety
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(50));
  assert.strictEqual(m.consistency, "both_margin_of_safety");
  assert.deepStrictEqual(m.greenwald_range, [100, 140]);
  assert.deepStrictEqual(m.buffett_range, [90, 150]);
}
// price within → within value range
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(110));
  assert.strictEqual(m.consistency, "within_value_range");
}
// price above both → above both values
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(200));
  assert.strictEqual(m.consistency, "above_both_values");
}
// divergence > 20% flagged (gw neutral 120 vs bf neutral 50 → mean 85, |70|/85 ≈ 0.82)
{
  const m = reconcileMethods({ pessimistic: 40, neutral: 120, optimistic: 200 }, oeStub(10, 90), price(60));
  assert.ok(m.divergence_pct! > 0.2, "divergence computed");
  assert.strictEqual(m.divergence_flag, true, "divergence flagged");
}
// degradation: missing Greenwald → not comparable
{
  const m = reconcileMethods(undefined, oeStub(90, 150), price(110));
  assert.strictEqual(m.comparable, false);
  assert.ok(m.reason_if_not, "reason present");
  assert.strictEqual(m.consistency, undefined);
}
// degradation: missing OE-DCF → not comparable
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, undefined, price(110));
  assert.strictEqual(m.comparable, false);
}
// no price → comparable for divergence, but no consistency reading
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), null);
  assert.strictEqual(m.comparable, true);
  assert.strictEqual(m.consistency, undefined);
  assert.ok(m.divergence_pct != null, "divergence still computed without price");
}
// compliance on reconcile output
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(110));
  const blob = JSON.stringify(m).toLowerCase();
  for (const bad of ["buy", "sell", " hold", "target price", "rating", "recommend"]) {
    assert.ok(!blob.includes(bad), `no "${bad}" token in reconcile output`);
  }
}
```

Then change the final log to `console.log("ownerEarningsDcf.check.ts: deriveOeDcf + reconcileMethods OK");`.

- [ ] **Step 3: Run the test, verify it fails**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: FAIL — `reconcileMethods is not a function` / export missing.

- [ ] **Step 4: Implement `reconcileMethods`**

Append to `web/src/lib/valuation/ownerEarningsDcf.ts` (add the two new type imports to the existing `import type { … } from "./types";` line: `MethodReconciliation`, `ConsistencyReading`):

```ts
export const DIVERGENCE_FLAG = 0.2; // formulas.md §9 reconciliation line

export function reconcileMethods(
  greenwaldCeilings: { pessimistic: number; neutral: number; optimistic: number } | undefined,
  oeDcf: OeDcfAssessment | undefined,
  price: LatestPrice | null,
): MethodReconciliation {
  const gwOk =
    greenwaldCeilings != null &&
    [greenwaldCeilings.pessimistic, greenwaldCeilings.neutral, greenwaldCeilings.optimistic].every(
      (n) => Number.isFinite(n),
    );
  const bfOk =
    oeDcf != null && oeDcf.assessable && oeDcf.per_share_low != null && oeDcf.per_share_high != null;

  if (!gwOk || !bfOk) {
    return {
      comparable: false,
      reason_if_not: !gwOk
        ? "Greenwald growth-value ceilings are unavailable, so the two methods cannot be cross-checked."
        : "The owner-earnings DCF is unavailable, so the two methods cannot be cross-checked.",
      ...(gwOk ? { greenwald_range: [greenwaldCeilings!.pessimistic, greenwaldCeilings!.optimistic] as [number, number] } : {}),
      ...(bfOk ? { buffett_range: [oeDcf!.per_share_low!, oeDcf!.per_share_high!] as [number, number] } : {}),
    };
  }

  const gwLow = Math.min(greenwaldCeilings!.pessimistic, greenwaldCeilings!.optimistic);
  const gwHigh = Math.max(greenwaldCeilings!.pessimistic, greenwaldCeilings!.optimistic);
  const bfLow = Math.min(oeDcf!.per_share_low!, oeDcf!.per_share_high!);
  const bfHigh = Math.max(oeDcf!.per_share_low!, oeDcf!.per_share_high!);

  const gwMid = greenwaldCeilings!.neutral;
  const bfMid = oeDcf!.tiers!.neutral.per_share;
  const mean = (gwMid + bfMid) / 2;
  const divergence = mean > 0 ? Math.abs(gwMid - bfMid) / mean : 0;

  let consistency: ConsistencyReading | undefined;
  if (price && price.close > 0) {
    const below = Math.min(gwLow, bfLow);
    const above = Math.max(gwHigh, bfHigh);
    if (price.close < below) consistency = "both_margin_of_safety";
    else if (price.close > above) consistency = "above_both_values";
    else consistency = "within_value_range";
  }

  return {
    comparable: true,
    greenwald_range: [gwLow, gwHigh],
    buffett_range: [bfLow, bfHigh],
    price: price?.close,
    consistency,
    divergence_pct: divergence,
    divergence_flag: divergence > DIVERGENCE_FLAG,
  };
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: PASS — `ownerEarningsDcf.check.ts: deriveOeDcf + reconcileMethods OK`

- [ ] **Step 6: Re-export from index + type-check**

Add to `web/src/lib/valuation/index.ts`:

```ts
export { deriveOeDcf, reconcileMethods, pickLatestFredPoint } from "./ownerEarningsDcf";
export type {
  OeDcfAssessment,
  OeDcfTier,
  DiscountBandProvenance,
  MethodReconciliation,
  ConsistencyReading,
} from "./types";
```

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/valuation/types.ts web/src/lib/valuation/ownerEarningsDcf.ts web/src/lib/valuation/ownerEarningsDcf.check.ts web/src/lib/valuation/index.ts
git commit -m "feat(valuation): reconcileMethods two-method cross-check + index exports"
```

---

### Task 3: Server-only live DGS10 reader

**Files:**
- Create: `web/src/lib/managers/treasuryRead.ts`

**Interfaces:**
- Consumes: `fetchFredSeries` from `@/lib/sources/fred`, `pickLatestFredPoint` from `@/lib/valuation/ownerEarningsDcf`.
- Produces: `export const getLatestDgs10: () => Promise<{ value: number; date: string } | null>` (React-cached, server-only, returns the raw FRED percent value + as-of date; null on any error or empty series — graceful degradation feeds the fallback band).

- [ ] **Step 1: Implement the reader**

Create `web/src/lib/managers/treasuryRead.ts`:

```ts
import "server-only";
import { cache } from "react";
import { fetchFredSeries } from "@/lib/sources/fred";
import { pickLatestFredPoint } from "@/lib/valuation/ownerEarningsDcf";

/**
 * Latest FRED DGS10 (10-year treasury, percent) with its as-of date.
 * Live fetch (Next fetch-cache, 1h revalidate via fetchFredSeries). Any failure
 * → null, which the owner-earnings DCF treats as "not anchored to live treasury".
 */
export const getLatestDgs10 = cache(async (): Promise<{ value: number; date: string } | null> => {
  try {
    const series = await fetchFredSeries("DGS10");
    return pickLatestFredPoint(series.points);
  } catch (err) {
    console.error(`getLatestDgs10 failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
});
```

(The pure extraction `pickLatestFredPoint` is already covered by Task 1's test; the cached live-fetch wrapper is exercised by the Task 6 real-data QA. No separate `.check.ts` — a live network fetch is not unit-testable and [[no-tests-solo-dev]] applies.)

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/managers/treasuryRead.ts
git commit -m "feat(valuation): server-only cached live DGS10 reader"
```

---

### Task 4: Wire DGS10 + OE-DCF + reconciliation into the stock page

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

**Interfaces:**
- Consumes: `deriveOeDcf`, `reconcileMethods` from `@/lib/valuation`; `getLatestDgs10` from `@/lib/managers/treasuryRead`; existing `valuationFloor`, `strikeZone`, `latestPrice`.
- Produces: `oeDcf` + `reconciliation` passed to `<EarningsPowerFloorCard>` (props added in Task 5).

- [ ] **Step 1: Add imports**

In `web/src/app/[lang]/stocks/[ticker]/page.tsx`, extend the valuation import (line 21) and add the DGS10 import:

```ts
import {
  fundamentalsToFloorInput,
  computeValuationFloor,
  deriveStrikeZone,
  deriveOeDcf,
  reconcileMethods,
} from "@/lib/valuation";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
```

- [ ] **Step 2: Capture the floor input and compute OE-DCF + reconciliation**

Replace the block at lines ~311–320 (the `computeValuationFloor(...)` call through the `strikeZone` assignment) with:

```ts
  const floorInput = fundamentalsToFloorInput(ticker, issuer, sec.annual);
  const valuationFloor = computeValuationFloor(floorInput);

  // Strike zone (price vs floor): only when a real per-share floor exists.
  const latestPrice = valuationFloor?.kind === "floor" ? await getLatestPrice(ticker) : null;
  const strikeZone =
    valuationFloor?.kind === "floor" ? deriveStrikeZone(valuationFloor, latestPrice) : undefined;

  // Second intrinsic-value method (Buffett owner-earnings DCF) + two-method cross-check.
  // DGS10 read is best-effort; null → DCF uses the 8–10% fallback band (flagged in-card).
  const dgs10 = valuationFloor?.kind === "floor" ? await getLatestDgs10() : null;
  const oeDcf =
    valuationFloor?.kind === "floor"
      ? deriveOeDcf(valuationFloor, floorInput.years, dgs10, latestPrice)
      : undefined;
  const reconciliation =
    valuationFloor?.kind === "floor"
      ? reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, latestPrice)
      : undefined;
```

- [ ] **Step 3: Pass the new props to the card**

Change the card render (line ~428) to:

```tsx
              <EarningsPowerFloorCard
                floor={valuationFloor}
                strikeZone={strikeZone}
                oeDcf={oeDcf}
                reconciliation={reconciliation}
              />
```

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: errors only about `EarningsPowerFloorCard` not accepting `oeDcf`/`reconciliation` props — those are resolved in Task 5. (If you prefer a clean gate, run Task 5 before re-checking; the two are intentionally co-dependent and committed separately.)

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(valuation): wire DGS10 + owner-earnings DCF + cross-check into stock page"
```

---

### Task 5: Cross-check section in EarningsPowerFloorCard

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`

**Interfaces:**
- Consumes: `OeDcfAssessment`, `MethodReconciliation` from `@/lib/valuation` (or `./...types`), the existing `usd`/`perShare`/`pct` formatters in the file, `--tt-*` tokens, `font-mono`.
- Produces: a `CrossCheckSection` RSC subsection rendered after `StrikeZoneSection`; new optional props on the card.

- [ ] **Step 1: Extend the card props**

Update the import of types at the top of `EarningsPowerFloorCard.tsx` to include the new types, then change the component signature:

```tsx
import type {
  ValuationFloor,
  PerShareUnavailable,
  StrikeZoneAssessment,
  OeDcfAssessment,
  MethodReconciliation,
} from "@/lib/valuation/types";

export function EarningsPowerFloorCard({
  floor,
  strikeZone,
  oeDcf,
  reconciliation,
}: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
}) {
```

- [ ] **Step 2: Add the `CrossCheckSection` component**

Add this component in the file (near `StrikeZoneSection`). It uses the file's existing `perShare`/`pct` helpers — if their names differ, match the local ones:

```tsx
function CrossCheckSection({
  oeDcf,
  reconciliation,
}: {
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
}) {
  if (!oeDcf || !oeDcf.assessable || !oeDcf.tiers) return null;

  const consistencyText: Record<string, string> = {
    both_margin_of_safety: "Price sits below both value ranges — both methods show a margin of safety.",
    within_value_range: "Price sits inside the two methods' value ranges.",
    above_both_values: "Price sits above both methods' value ranges.",
  };

  return (
    <div className="border-t border-[var(--tt-border)] pt-4 mt-4 space-y-2">
      <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
        Two-method cross-check
      </span>

      {/* Buffett owner-earnings DCF range */}
      <p className="text-sm text-[var(--tt-text)]">
        Owner-earnings DCF (Buffett, zero-growth terminal):{" "}
        <span className="font-mono">
          {perShare(oeDcf.per_share_low!)} – {perShare(oeDcf.per_share_high!)}
        </span>{" "}
        / sh
      </p>

      {reconciliation?.comparable && reconciliation.greenwald_range ? (
        <p className="text-sm text-[var(--tt-muted)]">
          Greenwald fair value:{" "}
          <span className="font-mono">
            {perShare(reconciliation.greenwald_range[0])} – {perShare(reconciliation.greenwald_range[1])}
          </span>{" "}
          / sh.{" "}
          {reconciliation.consistency ? consistencyText[reconciliation.consistency] : null}
        </p>
      ) : (
        <p className="text-sm text-[var(--tt-muted)]">
          {reconciliation?.reason_if_not ??
            "Greenwald growth ceilings unavailable — methods cannot be cross-checked; showing the owner-earnings DCF alone."}
        </p>
      )}

      {reconciliation?.divergence_flag ? (
        <p className="text-sm text-[var(--tt-warn)]">
          The two methods&apos; midpoints differ by{" "}
          <span className="font-mono">{pct(reconciliation.divergence_pct!)}</span> (&gt;20%) — the underlying
          assumptions warrant review.
        </p>
      ) : null}

      {/* Danger diagnostics (honest disclosure, not a verdict) */}
      <ul className="text-xs text-[var(--tt-muted)] space-y-1">
        {oeDcf.terminal_dependency_flag ? (
          <li>
            Terminal value is{" "}
            <span className="font-mono">{pct(oeDcf.terminal_share_pct!)}</span> of present value (&gt;70%) — this
            estimate leans heavily on the distant future.
          </li>
        ) : (
          <li>
            Terminal share of value:{" "}
            <span className="font-mono">{pct(oeDcf.terminal_share_pct!)}</span>.
          </li>
        )}
        {oeDcf.diagnostics?.oe_yield != null ? (
          <li>
            Owner-earnings yield:{" "}
            <span className="font-mono">{pct(oeDcf.diagnostics.oe_yield)}</span>
            {oeDcf.diagnostics.oe_yield_flag ? " — far from the 10-year treasury yield." : "."}
          </li>
        ) : null}
      </ul>

      {/* Provenance + mandatory disclaimer */}
      <p className="text-[11px] text-[var(--tt-faint)]">
        Growth g₁ ={" "}
        <span className="font-mono">{pct(oeDcf.growth_g1!)}</span>
        {oeDcf.declined ? " (history declining → capped at 0)" : ""}; OE FY{" "}
        {oeDcf.oe_fiscal_years?.join(", ")}; discount {oeDcf.discount?.note} {oeDcf.no_bridge_note} A range of
        observations from two valuation methods — educational only, not investment advice, and not a price target.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Render the section**

After the `StrikeZoneSection` line (`{strikeZone ? <StrikeZoneSection ... /> : null}`), add:

```tsx
        <CrossCheckSection oeDcf={oeDcf} reconciliation={reconciliation} />
```

- [ ] **Step 4: Type-check (now the full graph compiles)**

Run: `cd web && npx tsc --noEmit`
Expected: no errors (Task 4's page edits now satisfied).

- [ ] **Step 5: Build the worktree**

Run: `cd web && npm run build`
Expected: success. If it fails **only** on Google-Fonts fetch (Fraunces), record the exact font error and accept `tsc --noEmit` as the gate per [[local-build-google-fonts-blocked]]; any other error is real and must be fixed.

- [ ] **Step 6: Commit**

```bash
git add "web/src/components/valuation/EarningsPowerFloorCard.tsx"
git commit -m "feat(valuation): two-method cross-check section in floor card"
```

---

### Task 6: Real-data QA

**Files:** none (verification only). Requires real env.

**Interfaces:** Consumes the live DB + FRED. Copy env from the main checkout: `cp ../../../web/.env.local web/.env.local` (path from worktree `web/`: the main checkout is at `/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web/.env.local`).

- [ ] **Step 1: Copy env**

```bash
cp /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web/.env.local web/.env.local
```

- [ ] **Step 2: Write a throwaway QA harness**

Create `web/src/lib/valuation/_oeDcfQa.ts` (deleted after QA):

```ts
import { fundamentalsToFloorInput, computeValuationFloor, deriveStrikeZone, deriveOeDcf, reconcileMethods } from "./index";
import { getSecCompanyData } from "@/lib/managers/source"; // adjust to the real SEC reader used by the page
import { getLatestPrice } from "@/lib/managers/priceRead";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";

async function run(ticker: string, issuer: string) {
  const sec = await getSecCompanyData(ticker);
  const input = fundamentalsToFloorInput(ticker, issuer, sec.annual);
  const floor = computeValuationFloor(input);
  if (!floor || floor.kind !== "floor") return console.log(ticker, "no floor");
  const price = await getLatestPrice(ticker);
  const sz = deriveStrikeZone(floor, price);
  const dgs10 = await getLatestDgs10();
  const oe = deriveOeDcf(floor, input.years, dgs10, price);
  const rec = reconcileMethods(sz?.epv?.ceilings, oe, price);
  console.log(`\n=== ${ticker} ===`);
  console.log("DGS10", dgs10);
  console.log("g1", oe.growth_g1, "declined", oe.declined, "cagr_window", oe.cagr_window);
  console.log("OE-DCF /sh", oe.per_share_low, "–", oe.per_share_high, "terminalShare", oe.terminal_share_pct);
  console.log("Greenwald ceilings", sz?.epv?.ceilings);
  console.log("reconcile", rec.comparable, rec.consistency, "divergence", rec.divergence_pct, rec.divergence_flag);
}

(async () => {
  await run("GOOGL", "Alphabet Inc.");
  await run("MSFT", "Microsoft Corp.");
  // pick a known declining-earnings ticker present in the DB to confirm g1 = 0
})();
```

(Confirm the real SEC reader import/signature from `page.tsx` — it calls `getSecCompanyData(ticker)`; match its actual module path. Adjust issuer strings to match the DB.)

- [ ] **Step 2b: Run QA**

Run: `cd web && npx tsx --env-file=.env.local src/lib/valuation/_oeDcfQa.ts`

Verify against spec §5:
- GOOGL & MSFT OE-DCF ranges and Greenwald ceilings are the **same order of magnitude** (cross-check sanity).
- The price-position consistency reading is sensible for each.
- A declining-earnings ticker yields `g1 = 0`, `declined = true`.
- `DGS10` returns a value + recent as-of date (not null).

- [ ] **Step 3: Delete the throwaway harness + env**

```bash
rm web/src/lib/valuation/_oeDcfQa.ts web/.env.local
```

- [ ] **Step 4: Final verification gates**

```bash
cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts && npx tsc --noEmit
```
Expected: check prints OK; tsc clean.

- [ ] **Step 5: No commit needed** (QA artifacts removed). Confirm `git status` is clean.

---

## Self-Review

**Spec coverage:**
- §1.1 OE base = `buffett_epv.normalized_earnings`, not-assessable → no output → Task 1 Step 4 guard + Task 1 test 11. ✓
- §1.2 three-stage growth, g1 cap [0,0.10], decline→0, fade, zero-growth Y11+ → `projectOe` + `netIncomeCagr` + tests 2/3/4. ✓
- §1.3 discount band from DGS10, +2.5%/strict 10%, conservative=high discount, inversion min/max+flag, fallback band+flag → `discountBand` + tests 5/6/7. ✓
- §1.4 zero-growth terminal `OE_10/r`, terminal_share, >70% flag → `dcfTier` + test 8. ✓
- §1.5 no bridge, per-share = value/shares, three tiers (pess ½g1 r_strict / neutral g1 mid / opt g1 r_aggressive) → tier construction + tests 2/9. ✓
- §1.6 diagnostics OE yield vs DGS10, quick-check deviation → diagnostics block + test 10. ✓
- §2 reconcileMethods: Greenwald ceilings vs Buffett tiers, four readings, >20% divergence, any-missing → no cross-check → Task 2 tests. ✓
- §3 RSC card section, `--tt-*`, font-mono, no `"use client"`, disclaimer, as-of → Task 5. ✓
- §4 files: ownerEarningsDcf.ts(+check), types.ts, DGS10 reader, page, card; engine/ingest/research/price untouched → Tasks 1–5. ✓
- §5 tests + tsc + build + real-data QA → Tasks 1,2,6. ✓
- §6 compliance: range-only, no advice/target tokens, conservative knobs, provenance → tests 12 + reconcile compliance test + card disclaimer. ✓

**Placeholder scan:** No TBD/TODO; all steps carry real code. ✓

**Type consistency:** `OeDcfAssessment.tiers.{pessimistic,neutral,optimistic}: OeDcfTier`; `per_share_low/high` mirror pess/opt tiers; `MethodReconciliation` consumes `oeDcf.tiers.neutral.per_share` + `per_share_low/high`; Greenwald ceilings shape `{pessimistic,neutral,optimistic}` matches `strikeZone.epv.ceilings`. `pickLatestFredPoint` defined in Task 1, imported by Task 3. ✓
