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
const commodity = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "commodity", epvPerShare: 50, avPerShare: 40 });
assert.strictEqual(commodity.gated_to_zero, true, "commodity → GV gated to zero");
assert.strictEqual(commodity.scenarios.neutral, 0, "commodity → neutral GV = 0");
assert.strictEqual(commodity.per_share.optimistic, 0, "commodity → optimistic GV = 0");

const vd = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "value_destruction", epvPerShare: 10, avPerShare: 40 });
assert.strictEqual(vd.gated_to_zero, true, "value_destruction → GV gated to zero");

// Franchise: GV > 0, ordered pessimistic ≤ neutral ≤ optimistic.
const fr = computeGrowthValue({ years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40 });
assert.ok(fr.assessable, "franchise grower is assessable");
assert.strictEqual(fr.gated_to_zero, false, "franchise not gated");
assert.ok(fr.roiic != null && fr.roiic > 0, "positive ROIIC");
assert.ok(fr.scenarios.neutral > 0, "franchise → positive neutral GV");
assert.ok(fr.per_share.pessimistic <= fr.per_share.neutral + 1e-9, "pessimistic ≤ neutral");
assert.ok(fr.per_share.neutral <= fr.per_share.optimistic + 1e-9, "neutral ≤ optimistic");

// AI-hog scheme C: franchise + aiCapexDistortion → still gated_to_zero (growth premium closed).
const aiGate = computeGrowthValue({
  years: grower, shares: 1_000, taxRate: 0.21, moatSignal: "franchise",
  epvPerShare: 80, avPerShare: 40, aiCapexDistortion: true,
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

// Strong franchise (EPV/AV ≥ 2.0, dual test passed, not declined, ROIC stable) uses the
// longer duration (grade-based CAP) than a moderate one.
const strong = computeGrowthValue({ years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 100, avPerShare: 40, dualTestPassed: true });
const moderate = computeGrowthValue({ years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 50, avPerShare: 40, dualTestPassed: true });
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
const lr = computeGrowthValue({ years: lowReturn, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40 });
assert.strictEqual(lr.scenarios.neutral, 0, "ROIIC ≤ WACC → neutral GV = 0");

// Degradation: no operating income (bank-like) → not assessable, GV 0, no crash.
const noOpInc: ValuationFloorYear[] = [
  { fiscal_year: 2025, net_income: 3_000, capex: 1_000, d_and_a: 800 },
  { fiscal_year: 2024, net_income: 2_800, capex: 900, d_and_a: 750 },
];
const noi = computeGrowthValue({ years: noOpInc, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40 });
assert.strictEqual(noi.assessable, false, "no operating income → GV not assessable");
assert.strictEqual(noi.scenarios.neutral, 0, "not assessable → GV 0");

// Empty / too-short window → not assessable, no crash.
const empty = computeGrowthValue({ years: [], shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40 });
assert.strictEqual(empty.assessable, false, "empty years → not assessable, no crash");
assert.strictEqual(empty.scenarios.neutral, 0, "empty years → GV 0");

// Single-year window → not assessable, no crash.
const oneYear: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 20_000, operating_income: 5_000, capex: 3_000, d_and_a: 1_000, working_capital: 3_000 },
];
const single = computeGrowthValue({ years: oneYear, shares: 1_000, taxRate: 0.21, moatSignal: "franchise", epvPerShare: 80, avPerShare: 40 });
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
    epvPerShare: 80, avPerShare: 40,
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

// ── Phase 2 Task 3: duration → moat-CAP (task-3-controller-notes.md §G) ─────────────────

// §G.1 Pessimistic scenario is FROZEN: it must reproduce the pre-Phase-2 ratio-only
// selection (durShort = DURATION_STRONG_BASELINE(10) − DURATION_PESSIMISTIC_DELTA(2) = 8),
// independent of grade — this is the value that feeds gwLow → bucket/strike-zone (地基禁改).
{
  const strongGraded = computeGrowthValue({
    years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "franchise",
    epvPerShare: 100, avPerShare: 40, dualTestPassed: true,
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

  // Same fixture/ratio, but WITHOUT dual_test_passed → grade degrades to moderate (extendedDuration 10
  // instead of 20). Pessimistic must be bit-for-bit identical regardless — it never reads grade at all.
  const moderateGraded = computeGrowthValue({
    years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "franchise",
    epvPerShare: 100, avPerShare: 40, // dualTestPassed omitted → grade=moderate
  });
  assert.strictEqual(strongGraded.scenarios.pessimistic, moderateGraded.scenarios.pessimistic, "pessimistic scenario is identical across grades (frozen, decoupled from CAP)");
  assert.strictEqual(strongGraded.per_share.pessimistic, moderateGraded.per_share.pessimistic, "pessimistic per-share is identical across grades (frozen)");

  // §G.2 Only the ceiling moves: the strong-grade optimistic (extendedDuration=20) must exceed the
  // moderate-grade optimistic (extendedDuration=10, same as the pre-Phase-2 baseDuration for a ≥2.0 ratio).
  assert.strictEqual(moderateGraded.duration_years, DURATION_MODERATE, "ungraded dual test → moderate duration (10)");
  assert.strictEqual(strongGraded.duration_years, DURATION_STRONG, "graded strong → duration (20)");
  assert.ok(strongGraded.scenarios.optimistic > moderateGraded.scenarios.optimistic, "strong-grade optimistic > moderate-grade optimistic (only the ceiling was raised)");
  assert.ok(strongGraded.scenarios.neutral > moderateGraded.scenarios.neutral, "strong-grade neutral > moderate-grade neutral (extended duration raises neutral too)");
}

// §G.3 declined (latest net_income < oldest) blocks the strong grade even with a ≥2.0 ratio +
// dual test passed — the OE-DCF durability gate can't be bypassed through the GV leg.
{
  const growerDeclinedNI: ValuationFloorYear[] = growerFull.map((y) => ({ ...y }));
  // Reverse the net_income series so the latest year is the lowest (declining earnings).
  const niReversed = growerFull.map((y) => y.net_income).reverse();
  growerDeclinedNI.forEach((y, i) => { y.net_income = niReversed[i]; });

  const declinedGrade = computeGrowthValue({
    years: growerDeclinedNI, shares: 1_000, taxRate: 0.21, moatSignal: "franchise",
    epvPerShare: 100, avPerShare: 40, dualTestPassed: true,
  });
  assert.strictEqual(declinedGrade.duration_years, DURATION_MODERATE, "declined net income → grade downgraded to moderate (10), not strong (20)");
  // Pessimistic is still frozen (ratio-only, unaffected by declined).
  const declinedBaseline = computeGrowthValue({
    years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "franchise",
    epvPerShare: 100, avPerShare: 40, dualTestPassed: true,
  });
  assert.strictEqual(declinedGrade.scenarios.pessimistic, declinedBaseline.scenarios.pessimistic, "declined → pessimistic still frozen (identical to non-declined fixture)");
}

// §G.4 Unstable ROIC (fewer than 2/3 of window years clear the discount rate) also blocks the
// strong grade even with a ≥2.0 ratio + dual test passed + no earnings decline.
{
  const growerUnstableRoic: ValuationFloorYear[] = growerFull.map((y) => ({ ...y }));
  // Blow up equity in 2 of 5 years so ROIC (nopat/equity) drops well below the 10% discount rate,
  // leaving only 3/5 years above threshold (< 2/3).
  const idx2024 = growerUnstableRoic.findIndex((y) => y.fiscal_year === 2024);
  const idx2022 = growerUnstableRoic.findIndex((y) => y.fiscal_year === 2022);
  growerUnstableRoic[idx2024].shareholders_equity = 100_000; // nopat 3160 / 100000 = 3.16% < 10%
  growerUnstableRoic[idx2022].shareholders_equity = 100_000; // nopat 2054 / 100000 = 2.05% < 10%

  const unstableGrade = computeGrowthValue({
    years: growerUnstableRoic, shares: 1_000, taxRate: 0.21, moatSignal: "franchise",
    epvPerShare: 100, avPerShare: 40, dualTestPassed: true,
  });
  assert.strictEqual(unstableGrade.duration_years, DURATION_MODERATE, "unstable ROIC (< 2/3 years above discount rate) → grade downgraded to moderate (10)");
}

// §G.5 Non-franchise still gates to zero regardless of the new grade-related args (dualTestPassed
// alone can't manufacture a growth value without a moat).
{
  const nonFranchiseGraded = computeGrowthValue({
    years: growerFull, shares: 1_000, taxRate: 0.21, moatSignal: "commodity",
    epvPerShare: 100, avPerShare: 40, dualTestPassed: true, highLeverage: false,
  });
  assert.strictEqual(nonFranchiseGraded.gated_to_zero, true, "non-franchise still gated_to_zero even with dualTestPassed=true");
  assert.strictEqual(nonFranchiseGraded.scenarios.neutral, 0, "non-franchise → neutral GV = 0 regardless of grade args");
}

console.log("growthValue.check.ts: OK");
