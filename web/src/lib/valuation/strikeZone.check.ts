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
function makeFloor(o: { graham?: Partial<EpvLamp>; buffett?: Partial<EpvLamp>; asset?: Partial<AssetFloor>; growth?: Partial<GrowthValue> }): ValuationFloor {
  return {
    kind: "floor",
    graham_epv: lamp(o.graham ?? {}),
    buffett_epv: lamp(o.buffett ?? {}),
    asset_floor: asset(o.asset ?? {}),
    moat_reading: MOAT,
    growth_value: { ...STUB_GROWTH_VALUE, ...o.growth },
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

// ════════════════════════════════════════════════════════════════════════════
// v2 value band + 5/6-tier position
// ════════════════════════════════════════════════════════════════════════════

// Reference v2 floor: EPV_low=90, EPV_high=130 (from `floor` above), assessable GV
// per_share pess=10 / neut=30 / opt=70, AV not assessable.
// → valueFloor=90, base=130, ceilings = {100, 160, 200}.
const gvFloor = makeFloor({
  graham: { per_share_low: 90, per_share_high: 110 },
  buffett: { per_share_low: 100, per_share_high: 130 },
  growth: { assessable: true, gated_to_zero: false, per_share: { pessimistic: 10, neutral: 30, optimistic: 70 }, roiic: 0.18, duration_years: 10, wacc_band: [0.08, 0.1] },
});

// ── band fields + monotonicity ──
const band = deriveStrikeZone(gvFloor, px(120), NOW)!.epv!;
assert.strictEqual(band.valueFloor, 90, "valueFloor = max(AV none, EPV_low 90) = 90");
assert.strictEqual(band.base, 130, "base = max(AV none, EPV_high 130) = 130");
assert.deepStrictEqual(band.ceilings, { pessimistic: 140, neutral: 160, optimistic: 200 }, "ceilings = base + GV per_share");
assert.strictEqual(band.growthCollapsed, false, "assessable non-gated GV → not collapsed");
assert.ok(
  band.valueFloor <= band.base &&
    band.base <= band.ceilings!.pessimistic &&
    band.ceilings!.pessimistic <= band.ceilings!.neutral &&
    band.ceilings!.neutral <= band.ceilings!.optimistic,
  "value band is monotonic",
);

// ── 6-tier position boundaries (valueFloor=90, base=130, neut=160, opt=200) ──
// strikeMax = 90 × 2/3 = 60.
assert.strictEqual(deriveStrikeZone(gvFloor, px(60), NOW)!.epv!.position, "in_strike_zone", "price 60 = strikeMax → in_strike_zone");
assert.strictEqual(deriveStrikeZone(gvFloor, px(60.01), NOW)!.epv!.position, "approaching", "just above strikeMax → approaching");
assert.strictEqual(deriveStrikeZone(gvFloor, px(90), NOW)!.epv!.position, "approaching", "price = valueFloor → approaching (≤ boundary)");
assert.strictEqual(deriveStrikeZone(gvFloor, px(90.01), NOW)!.epv!.position, "zero_growth_zone", "just above valueFloor → zero_growth_zone");
assert.strictEqual(deriveStrikeZone(gvFloor, px(130), NOW)!.epv!.position, "zero_growth_zone", "price = base → zero_growth_zone (≤ boundary)");
assert.strictEqual(deriveStrikeZone(gvFloor, px(130.01), NOW)!.epv!.position, "moat_band", "just above base → moat_band");
assert.strictEqual(deriveStrikeZone(gvFloor, px(160), NOW)!.epv!.position, "moat_band", "price = ceiling_neutral → moat_band (≤ boundary)");
assert.strictEqual(deriveStrikeZone(gvFloor, px(160.01), NOW)!.epv!.position, "upper_band", "just above ceiling_neutral → upper_band");
assert.strictEqual(deriveStrikeZone(gvFloor, px(200), NOW)!.epv!.position, "upper_band", "price = ceiling_optimistic → upper_band (≤ boundary)");
assert.strictEqual(deriveStrikeZone(gvFloor, px(200.01), NOW)!.epv!.position, "above_optimistic", "above ceiling_optimistic → above_optimistic");

// ── GV gated_to_zero → collapse to 4 tiers, no ceilings ──
const gated = makeFloor({
  graham: { per_share_low: 90, per_share_high: 110 },
  buffett: { per_share_low: 100, per_share_high: 130 },
  growth: { assessable: true, gated_to_zero: true, per_share: { pessimistic: 0, neutral: 0, optimistic: 0 } },
});
const gatedBand = deriveStrikeZone(gated, px(150), NOW)!.epv!;
assert.strictEqual(gatedBand.growthCollapsed, true, "gated_to_zero → collapsed");
assert.strictEqual(gatedBand.ceilings, undefined, "gated → no ceilings");
assert.strictEqual(gatedBand.position, "above_zero_growth", "gated + price>base → above_zero_growth (4th tier)");
assert.strictEqual(deriveStrikeZone(gated, px(120), NOW)!.epv!.position, "zero_growth_zone", "gated + floor<price≤base → zero_growth_zone");
assert.strictEqual(deriveStrikeZone(gated, px(60), NOW)!.epv!.position, "in_strike_zone", "gated tiers 1-3 still work");

// ── GV not assessable → also collapsed (the existing STUB) ──
const noGv = deriveStrikeZone(floor, px(150), NOW)!.epv!;
assert.strictEqual(noGv.growthCollapsed, true, "not-assessable GV → collapsed");
assert.strictEqual(noGv.ceilings, undefined, "not-assessable GV → no ceilings");
assert.strictEqual(noGv.position, "above_zero_growth", "not-assessable GV + price>base → above_zero_growth");

// ── AV folds into valueFloor/base when AV exceeds the EPV ends ──
const avHigh = makeFloor({
  graham: { per_share_low: 90, per_share_high: 110 },
  buffett: { per_share_low: 100, per_share_high: 130 },
  asset: { assessable: true, per_share: 150 },
  growth: { assessable: true, gated_to_zero: false, per_share: { pessimistic: 10, neutral: 30, optimistic: 70 }, wacc_band: [0.08, 0.1] },
});
const avBand = deriveStrikeZone(avHigh, px(120), NOW)!.epv!;
assert.strictEqual(avBand.valueFloor, 150, "valueFloor = max(AV 150, EPV_low 90) = 150");
assert.strictEqual(avBand.base, 150, "base = max(AV 150, EPV_high 130) = 150");
assert.deepStrictEqual(avBand.ceilings, { pessimistic: 160, neutral: 180, optimistic: 220 }, "ceilings stack on AV-raised base");

// ── AV not assessable → valueFloor/base are EPV-only (no AV) ──
assert.strictEqual(band.valueFloor, band.floorConservative, "AV absent → valueFloor == EPV_low");
assert.strictEqual(band.base, band.ceiling, "AV absent → base == EPV_high");

// ── backward compat: v1 fields on a GV=0 tick unchanged (zone/floorConservative/ceiling/MoS) ──
const bc = deriveStrikeZone(floor, px(60), NOW)!.epv!;
assert.strictEqual(bc.zone, "in_strike_zone", "v1 zone unchanged");
assert.strictEqual(bc.floorConservative, 90, "v1 floorConservative unchanged");
assert.strictEqual(bc.ceiling, 130, "v1 ceiling unchanged");
assert.ok(Math.abs(bc.mosLow - 1 / 3) < 1e-9, "v1 mosLow unchanged");

console.log("strikeZone.check.ts: OK");
