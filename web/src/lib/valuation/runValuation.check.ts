import assert from "node:assert/strict";
import type { LatestPrice, ValuationFloorInput, ValuationFloorYear } from "./types";
import { runValuation } from "./runValuation";

const years: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 10_000, operating_income: 4_500, net_income: 3_000, effective_tax_rate: 0.15, shareholders_equity: 5_000, cash: 2_000, total_debt: 1_000, shares_diluted: 1_000, d_and_a: 600, capex: 550 },
  { fiscal_year: 2024, revenue: 9_000, operating_income: 3_960, net_income: 2_700, effective_tax_rate: 0.15, shareholders_equity: 4_500, cash: 1_800, total_debt: 1_000, shares_diluted: 1_000, d_and_a: 540, capex: 500 },
  { fiscal_year: 2023, revenue: 8_000, operating_income: 3_360, net_income: 2_400, effective_tax_rate: 0.15, shareholders_equity: 4_000, cash: 1_600, total_debt: 1_000, shares_diluted: 1_000, d_and_a: 480, capex: 450 },
  { fiscal_year: 2022, revenue: 7_000, operating_income: 3_010, net_income: 2_100, effective_tax_rate: 0.15, shareholders_equity: 3_500, cash: 1_400, total_debt: 1_000, shares_diluted: 1_000, d_and_a: 420, capex: 400 },
  { fiscal_year: 2021, revenue: 6_000, operating_income: 2_460, net_income: 1_800, effective_tax_rate: 0.15, shareholders_equity: 3_000, cash: 1_200, total_debt: 1_000, shares_diluted: 1_000, d_and_a: 360, capex: 350 },
];

const floorInput: ValuationFloorInput = { ticker: "RUN", years };
const price: LatestPrice = { close: 20, date: "2026-07-01", currency: "USD", source: "test" };
const guards = (overrides: Partial<Parameters<typeof runValuation>[0]["guards"]> = {}) => ({
  adsSuppressed: false,
  fundamentalsStale: false,
  priceStale: false,
  splitCoverageStale: false,
  ...overrides,
});
const run = (overrides: Partial<Parameters<typeof runValuation>[0]> = {}) =>
  runValuation({
    floorInput,
    price,
    dgs10: { value: 4.2, date: "2026-07-01" },
    guards: guards(),
    ...overrides,
  });

{
  const result = run({ guards: guards({ adsSuppressed: true, fundamentalsStale: true, fundamentalsCorrupt: true }) });
  assert.equal(result.floor, undefined);
  assert.equal(result.suppressedReason, "ads_suppressed");
  assert.deepEqual(result.methods, { zeroGrowthEpv: false, oeDcf: false, greenwaldGrowthCeilings: false });
}
{
  const result = run({ guards: guards({ fundamentalsStale: true, fundamentalsCorrupt: true }) });
  assert.equal(result.floor, undefined);
  assert.equal(result.suppressedReason, "fundamentals_stale");
}
{
  const stale = run({ price: null, guards: guards({ priceStale: true }) });
  const absent = run({ price: null, guards: guards() });
  assert.equal(stale.suppressedReason, "price_stale");
  assert.equal(absent.suppressedReason, "no_price");
}
{
  const result = run({
    floorInput: {
      ...floorInput,
      years: years.map((year) => ({ ...year, net_income: -Math.abs(year.net_income ?? 0) })),
    },
  });
  assert.equal(result.oeDcf?.assessable, false);
  assert.deepEqual(result.expectations, { assessable: false, reason: "no_oe_dcf" });
}
{
  const split = run({ guards: guards({ splitCoverageStale: true, priceStale: true }), price: null });
  const corrupt = run({ guards: guards({ fundamentalsCorrupt: true, priceStale: true }), price: null });
  assert.equal(split.oeDcf?.assessable, true);
  assert.equal(split.verdict, null);
  assert.equal(split.expectations.reason, "no_verdict");
  assert.equal(split.suppressedReason, "split_coverage_stale");
  assert.equal(corrupt.verdict, null);
  assert.equal(corrupt.expectations.reason, "no_verdict");
  assert.equal(corrupt.suppressedReason, "fundamentals_corrupt");
}
{
  const result = run();
  assert(result.verdict, "complete inputs produce a verdict");
  assert.deepEqual(result.methods, result.verdict.methods);
  assert.equal(result.methods.oeDcf, true);
  assert.equal(result.verdict.coverage, "full");
}
{
  // suppressExpectations：默认/false 不因 reliable 闸掉预期；true → assessable=false。
  const open = run({ suppressExpectations: false });
  assert.equal(open.expectations.assessable, true, "suppressExpectations=false → expectations assessable");
  const gated = run({ suppressExpectations: true });
  assert.equal(gated.expectations.assessable, false, "suppressExpectations=true → expectations gated");
  assert.equal(gated.expectations.reason, "reliability_or_robustness_gate");
}

console.log("runValuation.check.ts OK");
