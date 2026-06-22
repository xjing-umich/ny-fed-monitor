/**
 * reproductionValue.check.ts — spec §1.4 AV = tangible net assets + capitalized R&D.
 * Run: cd web && npx tsx src/lib/valuation/reproductionValue.check.ts
 */
import assert from "node:assert";
import { buildReproductionValue, RD_CAPITALIZATION_YEARS } from "./reproductionValue";
import type { ValuationFloorYear } from "./types";

const approx = (a: number, b: number, tol = 1e-6, msg = "") =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} (got ${a}, want ${b})`);

assert.strictEqual(RD_CAPITALIZATION_YEARS, 5, "Greenwald default N=5");

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
approx(rv.total_value!, 8_500 + 3_000, 1e-6, "AV = tangible + capitalized R&D");
approx(rv.per_share!, (8_500 + 3_000) / 1_000, 1e-6, "per share");

// rd fully absent → degrade to tangible book, capitalized_rd undefined.
const noRd: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500 },
];
const nr = buildReproductionValue(noRd, 1_000);
assert.ok(nr.assessable, "no-rd still assessable on tangible book");
assert.strictEqual(nr.capitalized_rd, undefined, "no rd → no capitalized R&D");
approx(nr.total_value!, 8_500, 1e-6, "no rd → AV = tangible net assets");

// intangible fields absent → total-book fallback (v1 behavior).
const noIntang: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 10_000 },
];
const ni = buildReproductionValue(noIntang, 1_000);
assert.ok(ni.assessable, "no-intangible-data falls back to total book");
assert.strictEqual(ni.intangibles_separated, false, "not separated");
approx(ni.total_value!, 10_000, 1e-6, "total book fallback");

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
