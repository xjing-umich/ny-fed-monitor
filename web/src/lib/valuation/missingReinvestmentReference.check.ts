import assert from "node:assert/strict";
import { deriveValuationVerdict } from "./deriveValuationVerdict";
import { runValuation } from "./runValuation";
import type { OeDcfAssessment, StrikeZoneAssessment, ValuationFloor, ValuationFloorInput } from "./types";

const floor = { kind: "floor", net_net: { assessable: false }, moat_reading: {} } as ValuationFloor;
const strikeZone = {
  price: { close: 100, date: "2026-07-01", currency: "USD" }, stale: false, currencyMismatch: false,
  epv: { floorConservative: 120, ceiling: 200, valueFloor: 900, base: 1000,
    ceilings: { pessimistic: 1100, neutral: 1200, optimistic: 1300 }, position: "in_strike_zone" },
} as StrikeZoneAssessment;
const oeDcf = { assessable: true, growth_coverage_gap: "missing_reinvestment", per_share_low: 800, per_share_high: 1600,
  tiers: { neutral: { per_share: 1000 } } } as OeDcfAssessment;
const methods = { zeroGrowthEpv: true, oeDcf: true, greenwaldGrowthCeilings: true };
const derive = (overrides: Partial<Parameters<typeof deriveValuationVerdict>[0]> = {}) =>
  deriveValuationVerdict({ floor, strikeZone, oeDcf, methods, ...overrides });

const reference = derive();
assert(reference, "fresh financials with missing reinvestment retain a reference");
assert.equal(reference.referenceOnly, "missing_reinvestment");
assert.deepEqual([reference.rangeLo, reference.rangeHi], [120, 200], "exclude asset value, growth value and DCF growth from the reference");
assert.equal(reference.bucket, "below");
assert.equal(reference.reliable, false);
assert.equal(reference.inStrikeZone, false);
assert.equal(reference.marginPct, null);
assert.equal(reference.coverage, "single_lamp");
assert.deepEqual(reference.methods, { zeroGrowthEpv: true, oeDcf: false, greenwaldGrowthCeilings: false });
for (const [close, bucket] of [[60, "below"], [120, "within"], [150, "within"], [250, "above"]] as const) {
  const v = derive({ strikeZone: { ...strikeZone, price: { ...strikeZone.price, close } } });
  assert.equal(v?.bucket, bucket);
  assert.equal(v?.inStrikeZone, false, "even a deep EPV discount remains a pending reference");
}
for (const gap of ["missing_interim", "missing_comparables", "uncovered_filing", "missing_period"] as const)
  assert.equal(derive({ oeDcf: { ...oeDcf, growth_coverage_gap: gap } }), null, `${gap} stays suppressed`);
for (const guard of ["splitCoverageStale", "capitalStructureDistorted", "fundamentalsCorrupt"] as const)
  assert.equal(derive({ [guard]: true }), null, `${guard} blocks the reference`);
assert.equal(derive({ floor: undefined }), null);
assert.equal(derive({ floor: { kind: "per_share_unavailable", reason: "no shares" } }), null);
assert.equal(derive({ strikeZone: undefined }), null);
assert.equal(derive({ strikeZone: { ...strikeZone, stale: true } }), null);
assert.equal(derive({ strikeZone: { ...strikeZone, currencyMismatch: true } }), null);
assert.equal(derive({ strikeZone: { ...strikeZone, epv: undefined } }), null);
for (const close of [0, -1, 10, 20_000, NaN, Infinity])
  assert.equal(derive({ strikeZone: { ...strikeZone, price: { ...strikeZone.price, close } } }), null, `invalid/implausible price ${close}`);
for (const [low, high] of [[NaN, 200], [120, Infinity], [0, 200], [200, 120]])
  assert.equal(derive({ strikeZone: { ...strikeZone, epv: { ...strikeZone.epv!, floorConservative: low, ceiling: high } } }), null);
assert.equal(derive({ floor: { ...floor, holdco_not_assessable: true } }), null);

const floorInput: ValuationFloorInput = { ticker: "REFERENCE", years: [2025, 2024, 2023, 2022, 2021].map(fiscal_year => ({
  fiscal_year, period_end: `${fiscal_year}-12-31`, revenue: 10_000, operating_income: 100, net_income: 100,
  shareholders_equity: 20_000, cash: 0, total_debt: 0, shares_diluted: 100, d_and_a: 10, capex: 10,
})), growth_evidence: { basis: "interim", annual_period_end: "2025-12-31", latest_period_end: "2026-06-30",
  period_end: "2026-06-30", missing_comparables: false, pairs: 2, revenue_growth: .02, earnings_growth: .02 } };
const input = { floorInput, price: { close: 10, date: "2026-07-01", currency: "USD", source: "test" }, dgs10: null,
  asOf: "2026-07-01", guards: { adsSuppressed: false, fundamentalsStale: false, priceStale: false, splitCoverageStale: false } };
const result = runValuation(input);
assert.equal(result.oeDcf?.growth_coverage_gap, "missing_reinvestment", "real engine identifies the missing annual capital endpoint");
assert.equal(result.verdict?.referenceOnly, "missing_reinvestment");
assert.deepEqual(result.methods, result.verdict!.methods, "run-level methods match reference verdict methods");
assert.equal(result.expectations.assessable, false);
assert.equal(result.suppressedReason, undefined);
for (const guard of ["adsSuppressed", "fundamentalsStale", "priceStale", "splitCoverageStale", "fundamentalsCorrupt"] as const)
  assert.equal(runValuation({ ...input, guards: { ...input.guards, [guard]: true } }).verdict, null, `run ${guard} blocks reference`);
assert.equal(runValuation({ ...input, price: null }).verdict, null);
assert.equal(runValuation({ ...input, price: { ...input.price, currency: "EUR" } }).verdict, null);
assert.equal(runValuation({ ...input, floorInput: { ...floorInput, years: floorInput.years.slice(0, 2) } }).verdict, null);
assert.equal(runValuation({ ...input, floorInput: { ...floorInput, years: floorInput.years.map(y => ({ ...y, shares_diluted: undefined })) } }).verdict, null);
assert.equal(runValuation({ ...input, floorInput: { ...floorInput, growth_evidence: { ...floorInput.growth_evidence!, latest_period_end: "2025-12-31" } } }).verdict, null);
console.log("missing reinvestment zero-growth reference checks passed");
