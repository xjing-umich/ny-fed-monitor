/**
 * reproductionValue.check.ts — spec §1.4 AV = tangible net assets + capitalized R&D.
 * Run: cd web && npx tsx src/lib/valuation/reproductionValue.check.ts
 */
import assert from "node:assert";
import {
  ACQUIRED_RESET_DISCOUNT,
  buildReproductionValue,
  RD_CAPITALIZATION_YEARS,
} from "./reproductionValue";
import type { ValuationFloorYear } from "./types";

const approx = (a: number, b: number, tol = 1e-6, msg = "") =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} (got ${a}, want ${b})`);

assert.strictEqual(RD_CAPITALIZATION_YEARS, 5, "Greenwald default N=5");
assert.strictEqual(ACQUIRED_RESET_DISCOUNT, 0.5, "acquired-reset proxy discount = 0.5");

// Capitalized R&D: straight-line, weights 5/5,4/5,3/5,2/5,1/5 for ages 0..4.
// rd = 1000 each year × (5+4+3+2+1)/5 = 1000 × 3 = 3000.
const rdYears: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500, rd_expense: 1_000 },
  { fiscal_year: 2024, shareholders_equity: 9_000, rd_expense: 1_000 },
  { fiscal_year: 2023, shareholders_equity: 8_000, rd_expense: 1_000 },
  { fiscal_year: 2022, shareholders_equity: 7_000, rd_expense: 1_000 },
  { fiscal_year: 2021, shareholders_equity: 6_000, rd_expense: 1_000 },
];
const rv = buildReproductionValue(rdYears, 1_000);
assert.ok(rv.assessable, "assessable");
assert.ok(rv.intangibles_separated, "intangibles separated");
approx(rv.tangible_net_assets!, 10_000 - 1_000 - 500, 1e-6, "tangible = equity − goodwill − intangibles");
approx(rv.capitalized_rd!, 3_000, 1e-6, "capitalized R&D = Σ rd × (N−age)/N");
approx(rv.total_value!, 8_500 + 3_000, 1e-6, "AV_conservative = tangible + capitalized R&D");
approx(rv.per_share!, (8_500 + 3_000) / 1_000, 1e-6, "per share (conservative)");

// Dual AV: acquired_reset_proxy = (GW + intangibles) × 0.5; AV_reproduction = AV_cons + proxy.
approx(rv.acquired_reset_proxy!, (1_000 + 500) * ACQUIRED_RESET_DISCOUNT, 1e-6, "acquired_reset_proxy");
approx(rv.reproduction_total_value!, rv.total_value! + rv.acquired_reset_proxy!, 1e-6, "AV_reproduction total");
approx(rv.reproduction_per_share!, rv.reproduction_total_value! / 1_000, 1e-6, "AV_reproduction per share");
assert.strictEqual(rv.dual_av_comparable, true, "intangibles separated → dual AV comparable");

// rd fully absent → degrade to tangible book, capitalized_rd undefined; dual AV still present.
const noRd: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500 },
];
const nr = buildReproductionValue(noRd, 1_000);
assert.ok(nr.assessable, "no-rd still assessable on tangible book");
assert.strictEqual(nr.capitalized_rd, undefined, "no rd → no capitalized R&D");
approx(nr.total_value!, 8_500, 1e-6, "no rd → AV_conservative = tangible net assets");
approx(nr.acquired_reset_proxy!, 750, 1e-6, "no-rd dual: acquired_reset_proxy");
approx(nr.reproduction_total_value!, 8_500 + 750, 1e-6, "no-rd dual: AV_reproduction");
assert.strictEqual(nr.dual_av_comparable, true, "no-rd still dual-comparable when intangibles separated");

// intangible fields absent → total-book fallback (v1 behavior); dual AV unavailable.
const noIntang: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 10_000 },
];
const ni = buildReproductionValue(noIntang, 1_000);
assert.ok(ni.assessable, "no-intangible-data falls back to total book");
assert.strictEqual(ni.intangibles_separated, false, "not separated");
approx(ni.total_value!, 10_000, 1e-6, "total book fallback");
assert.strictEqual(ni.dual_av_comparable, false, "no intangible split → dual AV not comparable");
assert.strictEqual(ni.acquired_reset_proxy, undefined, "no dual fields when not comparable");
assert.strictEqual(ni.reproduction_total_value, undefined, "no reproduction total when not comparable");
assert.strictEqual(ni.reproduction_per_share, undefined, "no reproduction per share when not comparable");

// negative tangible → not assessable.
const negTang: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 1_000, goodwill: 2_000, intangibles: 500 },
];
const ng = buildReproductionValue(negTang, 1_000);
assert.strictEqual(ng.assessable, false, "negative tangible → not assessable");

// missing equity → not assessable.
const noEq = buildReproductionValue([{ fiscal_year: 2025 }], 1_000);
assert.strictEqual(noEq.assessable, false, "no equity → not assessable");

console.log("reproductionValue.check.ts: OK");
