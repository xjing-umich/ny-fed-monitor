/**
 * growthValue.check.ts — spec §1.6 Greenwald growth value.
 * Run: cd web && npx tsx src/lib/valuation/growthValue.check.ts
 */
import assert from "node:assert";
import {
  computeGrowthValue,
  GV_WINDOW,
  ROIIC_ENDPOINT_LAG,
  DURATION_STRONG,
  DURATION_MODERATE,
  DURATION_STRONG_BASELINE,
  DURATION_PESSIMISTIC_DELTA,
  GV_DISCOUNT_PESSIMISTIC,
  ROIIC_SENSITIVITY,
} from "./growthValue";
import { maintenanceCapex } from "./maintenanceCapex";
import type { ValuationFloorYear } from "./types";

/** Local re-implementation of growthValue's annuity factor (not exported) — used only to
 * independently recompute the expected pessimistic-scenario value from disclosed fields. */
function annuityFactor(r: number, n: number): number {
  return (1 - 1 / Math.pow(1 + r, n)) / r;
}

// A franchise grower: rising operating income, capex > D&A (real growth reinvestment), rising NWC.
const grower: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 20_000, operating_income: 5_000, capex: 3_000, d_and_a: 1_000, working_capital: 3_000 },
  { fiscal_year: 2024, revenue: 17_000, operating_income: 4_000, capex: 2_600, d_and_a: 900, working_capital: 2_600 },
  { fiscal_year: 2023, revenue: 15_000, operating_income: 3_200, capex: 2_300, d_and_a: 850, working_capital: 2_300 },
  { fiscal_year: 2022, revenue: 13_000, operating_income: 2_600, capex: 2_000, d_and_a: 800, working_capital: 2_000 },
  { fiscal_year: 2021, revenue: 11_000, operating_income: 2_000, capex: 1_800, d_and_a: 750, working_capital: 1_800 },
];

// Franchise gate: non-franchise → GV forced to 0 (gated_to_zero true, NOT "missing data").
// moatGrade is irrelevant here (gate fires on moatSignal before grade is ever read) — "none" documents that.
const commodity = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "commodity", epvPerShare: 50, avPerShare: 40, moatGrade: "none" });
assert.strictEqual(commodity.gated_to_zero, true, "commodity → GV gated to zero");
assert.strictEqual(commodity.scenarios.neutral, 0, "commodity → neutral GV = 0");
assert.strictEqual(commodity.per_share.optimistic, 0, "commodity → optimistic GV = 0");

const vd = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "value_destruction", epvPerShare: 10, avPerShare: 40, moatGrade: "none" });
assert.strictEqual(vd.gated_to_zero, true, "value_destruction → GV gated to zero");

// moat_via_growth gate: a franchise established via the operating-income-growth bypass does NOT earn
// Greenwald growth value (its growth credit is carried in OE-DCF g1). Signal is "franchise" yet GV=0.
const viaGrowth = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", moatViaGrowth: true, epvPerShare: 50, avPerShare: 40, moatGrade: "strong" });
assert.strictEqual(viaGrowth.gated_to_zero, true, "moat_via_growth franchise → GV gated to zero");
assert.strictEqual(viaGrowth.scenarios.neutral, 0, "moat_via_growth → neutral GV = 0");
assert.strictEqual(viaGrowth.per_share.optimistic, 0, "moat_via_growth → optimistic GV = 0");

// Franchise: GV > 0, ordered pessimistic ≤ neutral ≤ optimistic.
const fr = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40, moatGrade: "moderate" });
assert.ok(fr.assessable, "franchise grower is assessable");
assert.strictEqual(fr.gated_to_zero, false, "franchise not gated");
assert.ok(fr.roiic != null && fr.roiic > 0, "positive ROIIC");
assert.ok(fr.scenarios.neutral > 0, "franchise → positive neutral GV");
assert.ok(fr.per_share.pessimistic <= fr.per_share.neutral + 1e-9, "pessimistic ≤ neutral");
assert.ok(fr.per_share.neutral <= fr.per_share.optimistic + 1e-9, "neutral ≤ optimistic");

// AI-hog scheme C: franchise + aiCapexDistortion → still gated_to_zero (growth premium closed).
const aiGate = computeGrowthValue({
  years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "franchise",
  epvPerShare: 80, avPerShare: 40, aiCapexDistortion: true, moatGrade: "strong",
});
assert.strictEqual(aiGate.gated_to_zero, true, "franchise + AI distortion → GV gated to zero");
assert.strictEqual(aiGate.scenarios.neutral, 0, "AI gate → neutral GV = 0");
assert.strictEqual(aiGate.assessable, true, "AI gate is a real reading (assessable), not missing data");

// growerFull: `grower` plus shareholders_equity/net_income so ROIC-stability and the
// declined check (Phase 2 grade-based duration) can actually resolve to a real reading
// instead of degrading to undefined for missing balance-sheet data.
// nopat = operating_income × (1 − 0.21); ROIC = nopat / shareholders_equity, all years > 10%.
// net_income rises latest→oldest reversed (i.e. grows over time) so `declined` = false.
const growerFull: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 20_000, operating_income: 5_000, capex: 3_000, d_and_a: 1_000, working_capital: 3_000, shareholders_equity: 20_000, net_income: 3_950 },
  { fiscal_year: 2024, revenue: 17_000, operating_income: 4_000, capex: 2_600, d_and_a: 900, working_capital: 2_600, shareholders_equity: 18_000, net_income: 3_160 },
  { fiscal_year: 2023, revenue: 15_000, operating_income: 3_200, capex: 2_300, d_and_a: 850, working_capital: 2_300, shareholders_equity: 16_500, net_income: 2_528 },
  { fiscal_year: 2022, revenue: 13_000, operating_income: 2_600, capex: 2_000, d_and_a: 800, working_capital: 2_000, shareholders_equity: 15_000, net_income: 2_054 },
  { fiscal_year: 2021, revenue: 11_000, operating_income: 2_000, capex: 1_800, d_and_a: 750, working_capital: 1_800, shareholders_equity: 14_000, net_income: 1_580 },
];

// Strong franchise (moatGrade passed in from floor.moat_cap, single source of truth) uses the
// longer duration (grade-based CAP) than a moderate one.
const strong = computeGrowthValue({ years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 100, avPerShare: 40, moatGrade: "strong" });
const moderate = computeGrowthValue({ years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 50, avPerShare: 40, moatGrade: "moderate" });
assert.strictEqual(strong.duration_years, DURATION_STRONG, "strong franchise → duration = CAP_STRONG (20)");
assert.strictEqual(moderate.duration_years, DURATION_MODERATE, "sub-2.0-ratio franchise → duration = CAP_MODERATE (10)");
assert.ok((strong.duration_years ?? 0) > (moderate.duration_years ?? 0), "strong franchise → longer duration");

// ROIIC ≤ WACC → GV = 0 even for a franchise (growth that doesn't out-earn capital creates no value).
const lowReturn: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 20_000, operating_income: 2_050, capex: 5_000, d_and_a: 1_000, working_capital: 3_000 },
  { fiscal_year: 2024, revenue: 18_000, operating_income: 2_040, capex: 4_500, d_and_a: 950, working_capital: 2_800 },
  { fiscal_year: 2023, revenue: 16_000, operating_income: 2_030, capex: 4_000, d_and_a: 900, working_capital: 2_600 },
  { fiscal_year: 2022, revenue: 14_000, operating_income: 2_020, capex: 3_500, d_and_a: 850, working_capital: 2_400 },
  { fiscal_year: 2021, revenue: 12_000, operating_income: 2_010, capex: 3_000, d_and_a: 800, working_capital: 2_200 },
];
const lr = computeGrowthValue({ years: lowReturn, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40, moatGrade: "strong" });
assert.strictEqual(lr.scenarios.neutral, 0, "ROIIC ≤ WACC → neutral GV = 0");

// Degradation: no operating income (bank-like) → not assessable, GV 0, no crash.
const noOpInc: ValuationFloorYear[] = [
  { fiscal_year: 2025, net_income: 3_000, capex: 1_000, d_and_a: 800 },
  { fiscal_year: 2024, net_income: 2_800, capex: 900, d_and_a: 750 },
];
const noi = computeGrowthValue({ years: noOpInc, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40, moatGrade: "moderate" });
assert.strictEqual(noi.assessable, false, "no operating income → GV not assessable");
assert.strictEqual(noi.scenarios.neutral, 0, "not assessable → GV 0");

// Empty / too-short window → not assessable, no crash.
const empty = computeGrowthValue({ years: [], shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40, moatGrade: "moderate" });
assert.strictEqual(empty.assessable, false, "empty years → not assessable, no crash");
assert.strictEqual(empty.scenarios.neutral, 0, "empty years → GV 0");

// Single-year window → not assessable, no crash.
const oneYear: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 20_000, operating_income: 5_000, capex: 3_000, d_and_a: 1_000, working_capital: 3_000 },
];
const single = computeGrowthValue({ years: oneYear, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40, moatGrade: "moderate" });
assert.strictEqual(single.assessable, false, "single year → not assessable, no crash");
assert.strictEqual(single.scenarios.neutral, 0, "single year → GV 0");

// Growth reinvestment uses shared maintenanceCapex() (not pure D&A proxy).
// Fixture: ppe/sales methods pull maint median above D&A → growthCapex smaller than capex−D&A.
const maintDivergent: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 12_000, operating_income: 4_000, capex: 2_500, d_and_a: 800, ppe_net: 12_000, working_capital: 2_000 },
  { fiscal_year: 2024, revenue: 11_000, operating_income: 3_500, capex: 2_200, d_and_a: 750, ppe_net: 11_000, working_capital: 1_800 },
  { fiscal_year: 2023, revenue: 10_000, operating_income: 3_000, capex: 2_000, d_and_a: 700, ppe_net: 10_000, working_capital: 1_600 },
  { fiscal_year: 2022, revenue: 9_000, operating_income: 2_500, capex: 1_800, d_and_a: 650, ppe_net: 9_000, working_capital: 1_400 },
  { fiscal_year: 2021, revenue: 8_000, operating_income: 2_000, capex: 1_600, d_and_a: 600, ppe_net: 8_000, working_capital: 1_200 },
];
{
  const window = [...maintDivergent].sort((a, b) => b.fiscal_year - a.fiscal_year).slice(0, GV_WINDOW);
  let daBased = 0;
  let maintBased = 0;
  let n = 0;
  for (let i = ROIIC_ENDPOINT_LAG; i < window.length; i++) {
    const y = window[i];
    const older = window[i + 1];
    const deltaNwc =
      y.working_capital != null && older?.working_capital != null
        ? y.working_capital - older.working_capital
        : 0;
    daBased += Math.max(0, (y.capex ?? 0) - (y.d_and_a ?? 0)) + deltaNwc;
    const mc = maintenanceCapex(window.slice(i));
    assert.ok(mc.assessable && mc.value != null, `maint assessable at window[${i}]`);
    assert.ok(Math.abs(mc.value! - (y.d_and_a ?? 0)) > 1e-6, `fixture: maint ≠ D&A at window[${i}] (maint=${mc.value}, da=${y.d_and_a})`);
    const maint = mc.value!;
    maintBased += Math.max(0, (y.capex ?? 0) - maint) + deltaNwc;
    n++;
  }
  assert.ok(n > 0 && Math.abs(daBased - maintBased) > 1e-6, "fixture distinguishes D&A proxy from maint-based reinvestment");
  const expectedAnnual = maintBased / n;
  const md = computeGrowthValue({
    years: maintDivergent, shares: 1_000, taxRate: 0.21, moatSignal: "franchise",
    epvPerShare: 80, avPerShare: 40, moatGrade: "moderate",
  });
  assert.ok(md.assessable && !md.gated_to_zero, "maint-divergent franchise is assessable");
  assert.ok(
    md.annual_growth_reinvestment != null &&
      Math.abs(md.annual_growth_reinvestment - expectedAnnual) <= 1e-6 * Math.max(1, Math.abs(expectedAnnual)),
    `annual reinvestment uses maintCapex (got ${md.annual_growth_reinvestment}, want ${expectedAnnual}; D&A proxy would be ${daBased / n})`,
  );
  assert.ok(
    Math.abs((md.annual_growth_reinvestment ?? 0) - daBased / n) > 1e-6,
    "annual reinvestment must differ from pure D&A proxy",
  );
  assert.ok(
    md.notes.some((n) => /maintenanceCapex/i.test(n)),
    "notes disclose shared maintenanceCapex() with EPV",
  );
}

// ── Phase 2 Task 3 / BUG2-fix: duration → moat-CAP (single source of truth) ─────────────────
// growthValue no longer computes grade itself (declined/roicStable/deriveMoatCap moved to
// epvFloor.computeValuationFloor → floor.moat_cap, shared with the owner-earnings DCF leg —
// see epvFloor.check.ts's BUG2 regression test for the cross-leg-agreement assertion). Here we
// only verify growthValue correctly TRANSLATES a given moatGrade into duration/pessimistic-freeze.

// §G.1 Pessimistic scenario is FROZEN: it must reproduce the pre-Phase-2 ratio-only
// selection (durShort = DURATION_STRONG_BASELINE(10) − DURATION_PESSIMISTIC_DELTA(2) = 8),
// independent of grade — this is the value that feeds gwLow → bucket/strike-zone (地基禁改).
{
  const strongGraded = computeGrowthValue({
    years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "franchise",
    epvPerShare: 100, avPerShare: 40, moatGrade: "strong",
  });
  assert.ok(strongGraded.roiic != null && strongGraded.annual_growth_reinvestment != null, "strongGraded assessable with roiic/annualReinvest disclosed");
  const durShort = DURATION_STRONG_BASELINE - DURATION_PESSIMISTIC_DELTA; // 8
  const roiicLow = strongGraded.roiic! * (1 - ROIIC_SENSITIVITY);
  const excess = (roiicLow - GV_DISCOUNT_PESSIMISTIC) / GV_DISCOUNT_PESSIMISTIC;
  const expectedPess = excess > 0 ? strongGraded.annual_growth_reinvestment! * excess * annuityFactor(GV_DISCOUNT_PESSIMISTIC, durShort) : 0;
  assert.ok(
    Math.abs(strongGraded.scenarios.pessimistic - expectedPess) <= 1e-6 * Math.max(1, Math.abs(expectedPess)),
    `pessimistic must equal the durShort=8 baseline gv (got ${strongGraded.scenarios.pessimistic}, want ${expectedPess})`,
  );

  // Same fixture/ratio, but moatGrade="moderate" instead of "strong" (extendedDuration 10
  // instead of 20). Pessimistic must be bit-for-bit identical regardless — it never reads grade at all.
  const moderateGraded = computeGrowthValue({
    years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "franchise",
    epvPerShare: 100, avPerShare: 40, moatGrade: "moderate",
  });
  assert.strictEqual(strongGraded.scenarios.pessimistic, moderateGraded.scenarios.pessimistic, "pessimistic scenario is identical across grades (frozen, decoupled from CAP)");
  assert.strictEqual(strongGraded.per_share.pessimistic, moderateGraded.per_share.pessimistic, "pessimistic per-share is identical across grades (frozen)");

  // §G.2 Only the ceiling moves: the strong-grade optimistic (extendedDuration=20) must exceed the
  // moderate-grade optimistic (extendedDuration=10, same as the pre-Phase-2 baseDuration for a ≥2.0 ratio).
  assert.strictEqual(moderateGraded.duration_years, DURATION_MODERATE, "moatGrade=moderate → duration (10)");
  assert.strictEqual(strongGraded.duration_years, DURATION_STRONG, "moatGrade=strong → duration (20)");
  assert.ok(strongGraded.scenarios.optimistic > moderateGraded.scenarios.optimistic, "strong-grade optimistic > moderate-grade optimistic (only the ceiling was raised)");
  assert.ok(strongGraded.scenarios.neutral > moderateGraded.scenarios.neutral, "strong-grade neutral > moderate-grade neutral (extended duration raises neutral too)");
}

// §G.5 Non-franchise still gates to zero regardless of moatGrade (a "strong" grade alone can't
// manufacture a growth value without a moat signal — the franchise gate runs first).
{
  const nonFranchiseGraded = computeGrowthValue({
    years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "commodity",
    epvPerShare: 100, avPerShare: 40, moatGrade: "strong",
  });
  assert.strictEqual(nonFranchiseGraded.gated_to_zero, true, "non-franchise still gated_to_zero even with moatGrade=strong");
  assert.strictEqual(nonFranchiseGraded.scenarios.neutral, 0, "non-franchise → neutral GV = 0 regardless of moatGrade");
}

console.log("growthValue.check.ts: OK");
