# Valuation Strike-Zone (Price vs. Floor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the in-store latest price to the deterministic price-free valuation floor on `/stocks/[ticker]`, producing a margin-of-safety range and a three-tier Graham "strike zone" — observation only, never a recommendation.

**Architecture:** A new pure function `deriveStrikeZone(floor, price)` computes the conservative EPV reference (global-minimum assessable `per_share_low`), a margin-of-safety range, a three-tier classification (`in_strike_zone` / `approaching` / `outside`), an independent asset-floor lamp, and freshness/currency degradation flags. The existing RSC `EarningsPowerFloorCard` gains an optional `strikeZone` prop and renders a number-line band + plain-language sentence + MoS range + mandatory disclaimer + price `as-of`/source footnote. The stock page fetches `getLatestPrice(ticker)` only when a real floor exists and injects the assessment. No `"use client"`, no `/research`, no `dataQualityGate`, no Finnhub.

**Tech Stack:** TypeScript, Next.js 16 (App Router, React Server Components), Tailwind v4 (`--tt-*` tokens), `node:assert` + `tsx` self-checks (no test framework — see [[no-tests-solo-dev]]).

**Spec (single source of truth):** `docs/superpowers/specs/2026-06-15-valuation-strike-zone-design.md`

**Worktree note:** This worktree has **no `node_modules`**. `npm ci` in `web/` (Task 1, Step 1) is mandatory before any `tsx` / `tsc` / `build` runs — Turbopack needs real packages, a symlink breaks it (see [[worktree-build-needs-real-node-modules]]).

---

## File Structure

- **Create** `web/src/lib/valuation/strikeZone.ts` — pure `deriveStrikeZone` + constants `GRAHAM_MOS`, `STALE_PRICE_DAYS`. Imports `LatestPrice` **type-only** (so the `server-only` price reader is never pulled into the `tsx` check) and `ValuationFloor` from `./types`.
- **Create** `web/src/lib/valuation/strikeZone.check.ts` — `tsx` self-check covering every §8 case.
- **Modify** `web/src/lib/valuation/types.ts` — add `StrikeZone` + `StrikeZoneAssessment` types.
- **Modify** `web/src/lib/valuation/index.ts` — re-export `./strikeZone`.
- **Modify** `web/src/components/valuation/EarningsPowerFloorCard.tsx` — add `strikeZone?` prop, price-vs-floor section, number-line band, mandatory disclaimer.
- **Modify** `web/src/app/[lang]/stocks/[ticker]/page.tsx` — fetch price + derive strike zone + pass prop.

---

## Task 1: Install deps + strike-zone pure logic & types (TDD)

**Files:**
- Bootstrap: `web/` (run `npm ci`)
- Create: `web/src/lib/valuation/strikeZone.check.ts`
- Modify: `web/src/lib/valuation/types.ts` (append after `PerShareUnavailable`, ~line 76)
- Create: `web/src/lib/valuation/strikeZone.ts`
- Modify: `web/src/lib/valuation/index.ts`

- [ ] **Step 1: Install real packages into the worktree**

Run:
```bash
cd web && npm ci
```
Expected: completes without error; `web/node_modules/.bin/tsx` and `web/node_modules/next` now exist. (This is slow once; required for `tsx`/`tsc`/`build`.)

- [ ] **Step 2: Write the failing self-check**

Create `web/src/lib/valuation/strikeZone.check.ts`:

```ts
/**
 * strikeZone.check.ts — self-check for the deterministic price-vs-floor engine.
 * Run: cd web && npx tsx src/lib/valuation/strikeZone.check.ts
 * (No test framework — pure logic verified with node:assert.)
 *
 * Covers: three-tier boundaries (MoS=1/3 critical), MoS range (low/high),
 * conservative reference = global-min assessable per_share_low, both lamps
 * not assessable → no EPV zone, asset-floor second lamp, no price → undefined,
 * nothing assessable → undefined, PerShareUnavailable guarded → undefined,
 * stale-price flag, currency mismatch degradation, negative MoS = outside.
 */
import assert from "node:assert";
import type { AssetFloor, EpvLamp, MoatReading, PerShareUnavailable, ValuationFloor } from "./types";
import type { LatestPrice } from "@/lib/managers/priceRead";
import { deriveStrikeZone, GRAHAM_MOS, STALE_PRICE_DAYS } from "./strikeZone";

const METHOD = {
  earnings_basis: "x", leverage_treatment: "x", denominator: "x", bridge: "x",
  discount_rate_low: 0.08, discount_rate_high: 0.1, years_used: [2023, 2024, 2025], simplifications: [],
};
function lamp(o: Partial<EpvLamp>): EpvLamp {
  return { label: "L", assessable: true, method: METHOD, ...o };
}
function asset(o: Partial<AssetFloor>): AssetFloor {
  return { assessable: false, basis: "tangible book", intangibles_separated: true, ...o };
}
const MOAT: MoatReading = { signal: "not_assessable", label: "—", basis_note: "—" };
function makeFloor(o: { graham?: Partial<EpvLamp>; buffett?: Partial<EpvLamp>; asset?: Partial<AssetFloor> }): ValuationFloor {
  return {
    kind: "floor",
    graham_epv: lamp(o.graham ?? {}),
    buffett_epv: lamp(o.buffett ?? {}),
    asset_floor: asset(o.asset ?? {}),
    moat_reading: MOAT,
    high_leverage_warning: false,
    provenance: {
      years_used: [2023, 2024, 2025], discount_rate_band: [0.08, 0.1],
      normalized_tax_rate: 0.15, normalized_tax_rate_basis: "avg",
      maintenance_capex_rule: "—", share_count_basis: "diluted",
    },
  };
}
function px(close: number, o: Partial<LatestPrice> = {}): LatestPrice {
  return { close, date: "2026-06-16", currency: "USD", source: "yahoo", ...o };
}
const NOW = new Date("2026-06-17T00:00:00Z");

// Reference floor: graham low 90 / high 110, buffett low 100 / high 130.
// → floorConservative = min(90,100) = 90 ; ceiling = max(110,130) = 130.
const floor = makeFloor({
  graham: { per_share_low: 90, per_share_high: 110 },
  buffett: { per_share_low: 100, per_share_high: 130 },
});

// ── conservative reference + ceiling ─────────────────────────────────────────
const atBoundary = deriveStrikeZone(floor, px(60), NOW);
assert.ok(atBoundary?.epv, "epv present");
assert.strictEqual(atBoundary!.epv!.floorConservative, 90, "conservative floor = global-min low");
assert.strictEqual(atBoundary!.epv!.ceiling, 130, "ceiling = global-max high");

// ── three-tier boundary: MoS=1/3 is INSIDE (>=) ──────────────────────────────
assert.ok(Math.abs(atBoundary!.epv!.mosLow - 1 / 3) < 1e-9, "price 60 → mosLow = 1/3");
assert.strictEqual(atBoundary!.epv!.zone, "in_strike_zone", "MoS=1/3 → in_strike_zone");
const justAbove = deriveStrikeZone(floor, px(60.01), NOW);
assert.strictEqual(justAbove!.epv!.zone, "approaching", "MoS just under 1/3 → approaching");
const approaching = deriveStrikeZone(floor, px(80), NOW);
assert.strictEqual(approaching!.epv!.zone, "approaching", "0<=MoS<1/3 → approaching");

// ── negative MoS = outside ───────────────────────────────────────────────────
const outside = deriveStrikeZone(floor, px(100), NOW);
assert.strictEqual(outside!.epv!.zone, "outside", "price>floor → outside");
assert.ok(outside!.epv!.mosLow < 0, "price>floor → negative MoS");

// ── MoS range: high end uses ceiling, range ordered ──────────────────────────
assert.ok(Math.abs(atBoundary!.epv!.mosHigh - (130 - 60) / 130) < 1e-9, "mosHigh computed vs ceiling");
assert.ok(atBoundary!.epv!.mosHigh > atBoundary!.epv!.mosLow, "MoS range: high >= low");

// ── GRAHAM_MOS is one third ──────────────────────────────────────────────────
assert.ok(Math.abs(GRAHAM_MOS - 1 / 3) < 1e-12, "GRAHAM_MOS = 1/3");

// ── both lamps not assessable → no EPV zone; asset lamp still independent ─────
const assetOnly = makeFloor({
  graham: { assessable: false, not_assessable_reason: "x" },
  buffett: { assessable: false, not_assessable_reason: "x" },
  asset: { assessable: true, per_share: 50, total_value: 50_000 },
});
const ao = deriveStrikeZone(assetOnly, px(40), NOW);
assert.strictEqual(ao!.epv, undefined, "no assessable EPV lamp → no epv zone");
assert.ok(ao!.assetFloor, "asset-floor second lamp present");
assert.strictEqual(ao!.assetFloor!.priceBelow, true, "price 40 <= asset 50 → below");

// ── asset-floor lamp alongside epv, price above asset → not below ────────────
const withAsset = makeFloor({
  graham: { per_share_low: 90, per_share_high: 110 },
  buffett: { per_share_low: 100, per_share_high: 130 },
  asset: { assessable: true, per_share: 50 },
});
assert.strictEqual(deriveStrikeZone(withAsset, px(60), NOW)!.assetFloor!.priceBelow, false, "price 60 > asset 50 → not below");

// ── no price → undefined ─────────────────────────────────────────────────────
assert.strictEqual(deriveStrikeZone(floor, null, NOW), undefined, "null price → undefined");

// ── nothing assessable (no EPV, no asset) → undefined ────────────────────────
const nothing = makeFloor({ graham: { assessable: false }, buffett: { assessable: false }, asset: { assessable: false } });
assert.strictEqual(deriveStrikeZone(nothing, px(40), NOW), undefined, "no EPV + no asset → undefined");

// ── PerShareUnavailable → undefined (call-site guard the page uses) ──────────
function guard(vf: ValuationFloor | PerShareUnavailable | undefined, price: LatestPrice | null) {
  return vf?.kind === "floor" ? deriveStrikeZone(vf, price, NOW) : undefined;
}
const psu: PerShareUnavailable = { kind: "per_share_unavailable", reason: "multi-class shares" };
assert.strictEqual(guard(psu, px(60)), undefined, "PerShareUnavailable → guarded to undefined");
assert.ok(guard(floor, px(60)), "real floor passes the guard");

// ── stale-price flag (calendar-day threshold) ────────────────────────────────
assert.strictEqual(deriveStrikeZone(floor, px(60, { date: "2026-06-16" }), NOW)!.stale, false, "1 day old → fresh");
assert.strictEqual(deriveStrikeZone(floor, px(60, { date: "2026-06-01" }), NOW)!.stale, true, `>${STALE_PRICE_DAYS}d old → stale`);

// ── currency mismatch degrades the whole block + states the reason ───────────
const eur = deriveStrikeZone(floor, px(60, { currency: "EUR" }), NOW);
assert.strictEqual(eur!.currencyMismatch, true, "non-USD price → currencyMismatch");
assert.strictEqual(eur!.epv, undefined, "currency mismatch suppresses epv");
assert.strictEqual(eur!.assetFloor, undefined, "currency mismatch suppresses asset lamp");
assert.ok(eur!.suppressedReason?.includes("EUR"), "suppressed reason names the currency");

console.log("strikeZone.check.ts: OK");
```

- [ ] **Step 3: Run the check to verify it fails**

Run:
```bash
cd web && npx tsx src/lib/valuation/strikeZone.check.ts
```
Expected: FAIL — `Cannot find module './strikeZone'` (or a type error for the missing `StrikeZone`/`StrikeZoneAssessment` types).

- [ ] **Step 4: Add the types to `types.ts`**

Append to `web/src/lib/valuation/types.ts` (after the `PerShareUnavailable` block, ~line 76):

```ts
// ── Strike zone (price vs. floor) ────────────────────────────────────────────
export type StrikeZone = "in_strike_zone" | "approaching" | "outside";

/**
 * Deterministic price-vs-floor assessment. The ONLY place price enters the
 * valuation card. Observation, never a recommendation: no BUY/SELL/HOLD, no
 * target price. `undefined` from the engine means "no meaningful comparison".
 */
export type StrikeZoneAssessment = {
  /** The price the comparison was made against (in-store latest). */
  price: { close: number; date: string; currency: string; source?: string };
  /** price.date older than STALE_PRICE_DAYS — shown as a degraded "as of" note, NOT hidden. */
  stale: boolean;
  /** price.currency !== "USD" — EPV/asset comparison suppressed (per-share floors are USD). */
  currencyMismatch: boolean;
  /** Human reason shown when the comparison is suppressed (currency mismatch). */
  suppressedReason?: string;
  /** EPV strike zone — present only when ≥1 EPV lamp is assessable with a positive per_share_low AND currency matches. */
  epv?: {
    zone: StrikeZone;
    /** Global-minimum assessable per_share_low across lamps — the conservative reference. */
    floorConservative: number;
    /** Global-maximum assessable per_share_high across lamps. */
    ceiling: number;
    /** Margin of safety vs floorConservative — the conservative end; drives the zone. */
    mosLow: number;
    /** Margin of safety vs ceiling — the optimistic end of the range. */
    mosHigh: number;
  };
  /** Asset-floor second lamp — present only when asset_floor is assessable AND currency matches. */
  assetFloor?: {
    perShare: number;
    /** price.close <= asset_floor.per_share — a rarer, harder signal. */
    priceBelow: boolean;
  };
};
```

- [ ] **Step 5: Write the implementation `strikeZone.ts`**

Create `web/src/lib/valuation/strikeZone.ts`:

```ts
// strikeZone.ts — deterministic price-vs-floor comparison. The price-free EPV
// engine stays untouched; this is the ONLY module where price enters the card.
// No recommendations, no target prices — just margin-of-safety arithmetic and a
// three-tier Graham classification the reader judges for themselves.
import type { LatestPrice } from "@/lib/managers/priceRead";
import type { StrikeZone, StrikeZoneAssessment, ValuationFloor } from "./types";

/** Graham's classic one-third margin of safety. */
export const GRAHAM_MOS = 1 / 3;

/** Price older than this many calendar days is flagged stale (≈5 trading days incl. a weekend). */
export const STALE_PRICE_DAYS = 7;

function finitePositive(n: number | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

function calendarDaysSince(dateISO: string, now: Date): number {
  const then = new Date(`${dateISO.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/**
 * Compare the latest in-store price against the deterministic valuation floor.
 * Returns `undefined` when there is nothing meaningful to compare (no price, or
 * neither an assessable EPV lamp nor an assessable asset floor).
 */
export function deriveStrikeZone(
  floor: ValuationFloor,
  price: LatestPrice | null,
  now: Date = new Date(),
): StrikeZoneAssessment | undefined {
  if (!price || !finitePositive(price.close)) return undefined;

  // Conservative reference = global-min assessable per_share_low; ceiling = global-max per_share_high.
  const lows: number[] = [];
  const highs: number[] = [];
  for (const lamp of [floor.graham_epv, floor.buffett_epv]) {
    if (!lamp.assessable) continue;
    if (finitePositive(lamp.per_share_low)) lows.push(lamp.per_share_low);
    if (finitePositive(lamp.per_share_high)) highs.push(lamp.per_share_high);
  }
  const hasEpv = lows.length > 0 && highs.length > 0;
  const hasAsset = floor.asset_floor.assessable && finitePositive(floor.asset_floor.per_share);

  // Nothing to compare the price against → no assessment.
  if (!hasEpv && !hasAsset) return undefined;

  const base = {
    price: { close: price.close, date: price.date, currency: price.currency, source: price.source },
    stale: calendarDaysSince(price.date, now) > STALE_PRICE_DAYS,
  };

  // Per-share floors are USD (SEC companyfacts). A non-USD price makes the
  // comparison meaningless → suppress the whole block, state the reason.
  if (price.currency !== "USD") {
    return {
      ...base,
      currencyMismatch: true,
      suppressedReason: `Latest price is in ${price.currency}; the per-share floors are USD, so a margin-of-safety comparison would be meaningless.`,
    };
  }

  let epv: StrikeZoneAssessment["epv"];
  if (hasEpv) {
    const floorConservative = Math.min(...lows);
    const ceiling = Math.max(...highs);
    const mosLow = (floorConservative - price.close) / floorConservative;
    const mosHigh = (ceiling - price.close) / ceiling;
    const zone: StrikeZone = mosLow >= GRAHAM_MOS ? "in_strike_zone" : mosLow >= 0 ? "approaching" : "outside";
    epv = { zone, floorConservative, ceiling, mosLow, mosHigh };
  }

  const assetFloor = hasAsset
    ? { perShare: floor.asset_floor.per_share as number, priceBelow: price.close <= (floor.asset_floor.per_share as number) }
    : undefined;

  return { ...base, currencyMismatch: false, epv, assetFloor };
}
```

- [ ] **Step 6: Run the check to verify it passes**

Run:
```bash
cd web && npx tsx src/lib/valuation/strikeZone.check.ts
```
Expected: PASS — prints `strikeZone.check.ts: OK`.

- [ ] **Step 7: Re-export from the valuation barrel**

Modify `web/src/lib/valuation/index.ts` — append:

```ts
export * from "./strikeZone";
```

Resulting file:
```ts
export * from "./types";
export * from "./epvFloor";
export * from "./fundamentalsToFloorInput";
export * from "./strikeZone";
```

- [ ] **Step 8: Typecheck the package, then commit**

Run:
```bash
cd web && npx tsc --noEmit
```
Expected: no output (clean).

Then commit:
```bash
git add web/src/lib/valuation/strikeZone.ts web/src/lib/valuation/strikeZone.check.ts web/src/lib/valuation/types.ts web/src/lib/valuation/index.ts
git commit -m "feat(valuation): deriveStrikeZone — price vs floor, MoS range, Graham three-tier"
```

---

## Task 2: Render price-vs-floor section + number-line band in the card

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`

Keep this an RSC — **do not add `"use client"`**. All geometry is computed server-side and emitted as static inline styles (percent positions); there is no hydration. Only the `--tt-*` tokens already used elsewhere in this file are allowed (`--tt-accent`, `--tt-border`, `--tt-faint`, `--tt-muted`, `--tt-text`, `--tt-warn`); do not use Tailwind `/opacity` modifiers on CSS-var colors (Tailwind v4 can't inject alpha into an arbitrary var) — use `color-mix(...)` inline where a tint is needed.

- [ ] **Step 1: Update the imports**

In `web/src/components/valuation/EarningsPowerFloorCard.tsx`, replace line 3:

```ts
import type { EpvLamp, MoatSignal, PerShareUnavailable, ValuationFloor } from "@/lib/valuation";
```

with:

```ts
import type { EpvLamp, MoatSignal, PerShareUnavailable, StrikeZone, StrikeZoneAssessment, ValuationFloor } from "@/lib/valuation";
import { GRAHAM_MOS } from "@/lib/valuation";
```

- [ ] **Step 2: Add MoS/label helpers + the band + the section (above the `EarningsPowerFloorCard` export)**

Insert this block immediately before `export function EarningsPowerFloorCard(...)` (i.e. before the current line 55):

```tsx
// Signed margin-of-safety percentage, e.g. "33%" or "−12%" (real minus glyph).
function mosPct(value: number): string {
  const p = Math.round(value * 100);
  return p < 0 ? `−${Math.abs(p)}%` : `${p}%`;
}

const ZONE_LABEL: Record<StrikeZone, string> = {
  in_strike_zone: "In strike zone",
  approaching: "Approaching",
  outside: "Above floor",
};

// Zone badge color via tokens (no opacity modifiers): accent / warn / faint.
const ZONE_TONE: Record<StrikeZone, string> = {
  in_strike_zone: "var(--tt-accent)",
  approaching: "var(--tt-warn)",
  outside: "var(--tt-faint)",
};

function ZoneBadge({ zone }: { zone: StrikeZone }) {
  const tone = ZONE_TONE[zone];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]"
      style={{ color: tone, borderColor: tone }}
    >
      {ZONE_LABEL[zone]}
    </span>
  );
}

// Static number-line band: shaded strike-zone segment + two EPV lamp ranges +
// asset-floor tick + current-price marker. RSC, no hydration — geometry is
// emitted as inline percent styles.
function StrikeBand({ floor, sz }: { floor: ValuationFloor; sz: StrikeZoneAssessment }) {
  const { graham_epv, buffett_epv } = floor;
  const epv = sz.epv;
  const candidates = [
    sz.price.close,
    sz.assetFloor?.perShare,
    graham_epv.assessable ? graham_epv.per_share_high : undefined,
    buffett_epv.assessable ? buffett_epv.per_share_high : undefined,
    epv?.ceiling,
  ].filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const domainMax = (candidates.length ? Math.max(...candidates) : sz.price.close) * 1.08 || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / domainMax) * 100));
  const strikeMax = epv ? epv.floorConservative * (1 - GRAHAM_MOS) : 0;
  const lampBand = (lamp: EpvLamp, top: string) =>
    lamp.assessable && lamp.per_share_low != null && lamp.per_share_high != null ? (
      <div
        className="absolute h-1.5 rounded-full bg-[var(--tt-faint)]"
        style={{ left: `${pct(lamp.per_share_low)}%`, width: `${pct(lamp.per_share_high) - pct(lamp.per_share_low)}%`, top }}
        title={`${lamp.label}: ${range(lamp.per_share_low, lamp.per_share_high)}`}
      />
    ) : null;

  return (
    <div className="mt-2">
      <div className="relative h-14 w-full">
        {/* baseline */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--tt-border)]" />
        {/* shaded strike-zone segment: price <= floorConservative × (1 − 1/3) */}
        {epv ? (
          <div
            className="absolute top-1/2 h-9 -translate-y-1/2 rounded-sm border"
            style={{
              left: 0,
              width: `${pct(strikeMax)}%`,
              backgroundColor: "color-mix(in srgb, var(--tt-accent) 12%, transparent)",
              borderColor: "color-mix(in srgb, var(--tt-accent) 35%, transparent)",
            }}
            aria-hidden
          />
        ) : null}
        {/* two EPV lamp ranges */}
        {lampBand(graham_epv, "30%")}
        {lampBand(buffett_epv, "60%")}
        {/* asset-floor tick */}
        {sz.assetFloor ? (
          <div
            className="absolute top-1/4 h-1/2 w-px bg-[var(--tt-muted)]"
            style={{ left: `${pct(sz.assetFloor.perShare)}%` }}
            title={`Asset floor ${perShare(sz.assetFloor.perShare)}`}
          />
        ) : null}
        {/* current-price marker (full height) */}
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--tt-accent)]"
          style={{ left: `${pct(sz.price.close)}%` }}
          title={`Price ${perShare(sz.price.close)}`}
        />
      </div>
      {/* legend */}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-[var(--tt-faint)]">
        <span style={{ color: "var(--tt-accent)" }}>▏Price {perShare(sz.price.close)}</span>
        {epv ? <span>▢ Strike zone ≤ {perShare(strikeMax)}</span> : null}
        <span>EPV ranges (two lenses)</span>
        {sz.assetFloor ? <span>Asset floor {perShare(sz.assetFloor.perShare)}</span> : null}
      </div>
    </div>
  );
}

function StrikeZoneSection({ floor, sz }: { floor: ValuationFloor; sz: StrikeZoneAssessment }) {
  // Currency mismatch: suppress the whole comparison, state the reason only.
  if (sz.currencyMismatch) {
    return (
      <div className="border-t border-[var(--tt-border)] pt-3">
        <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Price vs. floor</h4>
        <p className="mt-1 text-sm text-[var(--tt-muted)]">{sz.suppressedReason}</p>
      </div>
    );
  }

  const epv = sz.epv;
  const sentence = epv
    ? epv.zone === "in_strike_zone"
      ? `At ${perShare(sz.price.close)}, the price sits inside the Graham strike zone — at least a one-third margin of safety below the most conservative zero-growth earnings-power floor.`
      : epv.zone === "approaching"
        ? `At ${perShare(sz.price.close)}, the price is approaching the strike zone, but the margin of safety is still under one-third of the conservative floor.`
        : `At ${perShare(sz.price.close)}, the price is above the conservative zero-growth floor — no margin of safety on this lens.`
    : `At ${perShare(sz.price.close)}, compared against the tangible asset floor below.`;

  return (
    <div className="space-y-2 border-t border-[var(--tt-border)] pt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Price vs. floor</h4>
        {epv ? <ZoneBadge zone={epv.zone} /> : null}
      </div>

      <StrikeBand floor={floor} sz={sz} />

      <p className="text-sm text-[var(--tt-text)]">{sentence}</p>

      {epv ? (
        <p className="text-sm text-[var(--tt-muted)]">
          Margin of safety {mosPct(epv.mosLow)} to {mosPct(epv.mosHigh)} (conservative floor {perShare(epv.floorConservative)} →
          ceiling {perShare(epv.ceiling)}).
        </p>
      ) : null}

      {sz.assetFloor?.priceBelow ? (
        <p className="text-sm text-[var(--tt-text)]">
          Price is at or below the reproducible tangible asset base ({perShare(sz.assetFloor.perShare)} / sh) — a rarer, harder
          floor.
        </p>
      ) : null}

      <p className="text-xs text-[var(--tt-muted)]">
        Mechanical, zero-growth, deliberately conservative estimate — not investment advice, not a buy/sell signal, and not a
        price target. Whether to act is your judgment. See method below.
      </p>

      <p className="text-[10px] text-[var(--tt-faint)]">
        Price as of {sz.price.date}
        {sz.price.source ? ` · ${sz.price.source}` : ""}
        {sz.stale ? " · may be stale" : ""}.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Add the `strikeZone` prop, render the section, adjust the description**

Change the export signature (current line 55):

```tsx
export function EarningsPowerFloorCard({ floor }: { floor: ValuationFloor | PerShareUnavailable | undefined }) {
```

to:

```tsx
export function EarningsPowerFloorCard({
  floor,
  strikeZone,
}: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
}) {
```

Replace the `CardDescription` (current lines 80–83):

```tsx
        <CardDescription>
          Zero-growth intrinsic value ranges (EPV) and a tangible asset floor — deterministic and price-free, not price
          forecasts or recommendations.
        </CardDescription>
```

with (the EPV lamps stay price-free; the price comparison is the only price-aware part — §4 last bullet):

```tsx
        <CardDescription>
          Zero-growth intrinsic value ranges (EPV) and a tangible asset floor — deterministic, not price forecasts or
          recommendations.{strikeZone ? " The price comparison below is the only price-aware part." : ""}
        </CardDescription>
```

Render the section inside `CardContent`, immediately after the asset/moat `<div className="flex flex-wrap ...">` block (current lines 103–112) and before the `<details>` (current line 114):

```tsx
        {strikeZone ? <StrikeZoneSection floor={floor} sz={strikeZone} /> : null}
```

- [ ] **Step 4: Typecheck, then commit**

Run:
```bash
cd web && npx tsc --noEmit
```
Expected: no output (clean).

```bash
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): price-vs-floor section + number-line band on EarningsPowerFloorCard"
```

---

## Task 3: Wire price + strike zone into the stock page

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

> If unsure about any App Router data-fetching detail, skim `web/node_modules/next/dist/docs/` first (per `web/AGENTS.md`). This change only adds `await` calls to an already-async server component — no new Next API.

- [ ] **Step 1: Update imports**

Change line 18:

```ts
import { fundamentalsToFloorInput, computeValuationFloor } from "@/lib/valuation";
```

to:

```ts
import { fundamentalsToFloorInput, computeValuationFloor, deriveStrikeZone } from "@/lib/valuation";
```

And add after line 19 (`import { EarningsPowerFloorCard } ...`):

```ts
import { getLatestPrice } from "@/lib/managers/priceRead";
```

- [ ] **Step 2: Fetch price + derive the strike zone**

After the `valuationFloor` assignment (current lines 234–236, the `computeValuationFloor(...)` call), add:

```ts
  // Strike zone (price vs floor): only when a real per-share floor exists.
  // Multi-class (per_share_unavailable) / thin (undefined) skip the price hit.
  // No env / no price row → getLatestPrice returns null → deriveStrikeZone → undefined → section hidden.
  const latestPrice = valuationFloor?.kind === "floor" ? await getLatestPrice(ticker) : null;
  const strikeZone =
    valuationFloor?.kind === "floor" ? deriveStrikeZone(valuationFloor, latestPrice) : undefined;
```

- [ ] **Step 3: Pass the prop to the card**

Change the card render (current line 343):

```tsx
              <EarningsPowerFloorCard floor={valuationFloor} />
```

to:

```tsx
              <EarningsPowerFloorCard floor={valuationFloor} strikeZone={strikeZone} />
```

- [ ] **Step 4: Typecheck + build, then commit**

Run:
```bash
cd web && npx tsc --noEmit && npm run build
```
Expected: `tsc` clean; `npm run build` completes successfully (Turbopack — real `node_modules` from Task 1, Step 1).

```bash
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(valuation): inject strike zone on /stocks/[ticker] (price vs floor)"
```

---

## Task 4: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Re-run the full automated gate**

Run:
```bash
cd web && npx tsx src/lib/valuation/strikeZone.check.ts && npx tsc --noEmit && npm run build
```
Expected: `strikeZone.check.ts: OK`, `tsc` clean, build success.

- [ ] **Step 2: Manual QA checklist (requires Supabase env for real prices)**

With Supabase credentials in the environment (`web/.env` / shell), run `npm run dev` and verify:

- [ ] `/en/stocks/AAPL` — band renders (price marker, two EPV ranges, shaded strike-zone segment, asset tick), a plain-language sentence, the MoS range, the zone badge, the mandatory disclaimer, and the `Price as of <date> · <source>` footnote.
- [ ] A ticker with **no price row** → the price-vs-floor section is absent, the floor card still renders.
- [ ] A **multi-class** ticker (e.g. BRK, GOOG) where the floor is `per_share_unavailable` → no strike-zone section (the card shows the honest-labeling branch).
- [ ] A **foreign-currency** ticker → the section degrades to the suppressed-reason note only (no band).

Note: **locally without Supabase env**, `getLatestPrice` returns `null` → `strikeZone` is `undefined` → the section is hidden and the floor card renders unchanged. That is the expected no-env behavior — not a failure.

- [ ] **Step 3: Stop and report**

Do **not** push or open a PR (the `gh` identity ≠ the push identity). Report the branch name (`plan/valuation-strike-zone`) and the verification results.

---

## Self-Review (completed during planning)

- **Spec coverage:** §3.1 conservative reference → Task 1 (`floorConservative` = global-min low) + check. §3.2 MoS range → `mosLow`/`mosHigh` + check. §3.3 three tiers + `GRAHAM_MOS` constant → Task 1 + boundary check (MoS=⅓ inside). §3.4 asset-floor second lamp → `assetFloor.priceBelow` + check. §4 band + sentence + MoS + disclaimer + footnote → Task 2. §5 freshness (`STALE_PRICE_DAYS`) + currency mismatch degradation → Task 1 + checks, rendered in Task 2. §6 architecture (types, function, card prop, page injection, no /research·dataQualityGate·Finnhub) → Tasks 1–3. §7 all edge cases (no price, PerShareUnavailable, both lamps not assessable, stale, currency, negative MoS) → checks in Task 1. §8 verification → Tasks 1 & 4. §9 file list → matches File Structure.
- **Placeholder scan:** none — every code step carries complete code; every command states expected output.
- **Type consistency:** `StrikeZone` / `StrikeZoneAssessment` defined in `types.ts`, consumed identically in `strikeZone.ts`, the check, the card, and the page. `deriveStrikeZone(floor, price, now?)` signature is consistent across definition, check, and the page call (2-arg). `GRAHAM_MOS` / `STALE_PRICE_DAYS` exported once, imported by the check and the card. Field names (`floorConservative`, `ceiling`, `mosLow`, `mosHigh`, `priceBelow`, `currencyMismatch`, `suppressedReason`, `stale`) match everywhere.
