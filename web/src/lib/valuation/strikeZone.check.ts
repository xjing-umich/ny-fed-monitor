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
import type { AssetFloor, EpvLamp, GrowthValue, MoatReading, PerShareUnavailable, ValuationFloor } from "./types";
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
const STUB_GROWTH_VALUE: GrowthValue = { assessable: false, gated_to_zero: false, wacc_band: [0.08, 0.1], scenarios: { pessimistic: 0, neutral: 0, optimistic: 0 }, per_share: { pessimistic: 0, neutral: 0, optimistic: 0 }, notes: [] };
function makeFloor(o: { graham?: Partial<EpvLamp>; buffett?: Partial<EpvLamp>; asset?: Partial<AssetFloor> }): ValuationFloor {
  return {
    kind: "floor",
    graham_epv: lamp(o.graham ?? {}),
    buffett_epv: lamp(o.buffett ?? {}),
    asset_floor: asset(o.asset ?? {}),
    moat_reading: MOAT,
    growth_value: STUB_GROWTH_VALUE,
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

// ── high-leverage straddle: a lamp with negative low (still assessable) must NOT
//    contribute its positive high to the ceiling, so the engine's reference values
//    match the lamp bands the card actually draws (both-ends-positive only).
const straddle = makeFloor({
  graham: { per_share_low: -5, per_share_high: 200 }, // low straddles zero
  buffett: { per_share_low: 100, per_share_high: 130 },
});
const st = deriveStrikeZone(straddle, px(60), NOW);
assert.strictEqual(st!.epv!.floorConservative, 100, "straddle lamp excluded → floor = buffett low");
assert.strictEqual(st!.epv!.ceiling, 130, "straddle lamp excluded → ceiling = buffett high, not 200");

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
// Malformed price date degrades visibly as stale, never silently "fresh".
assert.strictEqual(deriveStrikeZone(floor, px(60, { date: "not-a-date" }), NOW)!.stale, true, "unparseable date → stale");

// ── currency mismatch degrades the whole block + states the reason ───────────
const eur = deriveStrikeZone(floor, px(60, { currency: "EUR" }), NOW);
assert.strictEqual(eur!.currencyMismatch, true, "non-USD price → currencyMismatch");
assert.strictEqual(eur!.epv, undefined, "currency mismatch suppresses epv");
assert.strictEqual(eur!.assetFloor, undefined, "currency mismatch suppresses asset lamp");
assert.ok(eur!.suppressedReason?.includes("EUR"), "suppressed reason names the currency");

console.log("strikeZone.check.ts: OK");
