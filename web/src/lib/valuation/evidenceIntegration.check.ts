import assert from "node:assert/strict";
import { fundamentalsToFloorInput } from "./fundamentalsToFloorInput";
import { runValuation } from "./runValuation";
import type { FundamentalPeriod } from "../sec/normalize-facts";
const rows = [2025, 2024, 2023, 2022, 2021].map(
  (fy, i) =>
    ({
      ticker: "ANY",
      fiscal_year: fy,
      fiscal_period: "FY",
      form: "10-K",
      period_end: `${fy}-12-31`,
      revenue: 20000 - i * 2000,
      net_income: 3000 - i * 300,
      operating_income: 4000 - i * 400,
      operating_margin: 0.2,
      shares_diluted: 1000,
      shareholders_equity: 5000,
      cash_and_equivalents: 500,
      total_debt: 0,
      capex: -1000,
      d_and_a: 300,
      working_capital: 2000 - i * 200,
      short_term_investments: 0,
      rd_expense: 300,
      effective_tax_rate: 0.2,
    }) as FundamentalPeriod,
);
const input = fundamentalsToFloorInput("ANY", "Any", rows);
const execute = (asOf: string) =>
  runValuation({
    floorInput: input,
    price: { close: 20, currency: "USD", date: asOf.slice(0, 10) },
    dgs10: { value: 4.99, date: asOf.slice(0, 10) },
    asOf,
    guards: {
      adsSuppressed: false,
      fundamentalsStale: false,
      priceStale: false,
      splitCoverageStale: false,
    },
  });
const fresh = execute("2026-04-01T00:00:00Z");
assert.ok(
  fresh.oeDcf?.growth_g1! > 0,
  "complete recent evidence can retain positive growth",
);
const original = JSON.stringify(input);
const gap = execute("2026-10-30T00:00:00Z");
assert.equal(gap.oeDcf?.growth_g1, 0);
assert.equal(gap.verdict, null);
assert.equal(gap.suppressedReason, "growth_evidence_incomplete");
assert.equal(
  gap.expectations.assessable,
  false,
  "missing current financials cannot be called modest expectations",
);
assert.ok(
  gap.floor?.kind === "floor" && gap.floor.buffett_epv.assessable,
  "zero-growth reference remains available",
);
assert.equal(
  gap.floor.growth_value.assessable,
  false,
  "the other growth method cannot bypass the same evidence brake",
);
assert.equal(
  JSON.stringify(input),
  original,
  "orchestration does not mutate captured source inputs",
);
console.log("cross-method growth evidence integration checks passed");
const lossInput = fundamentalsToFloorInput(
  "ANY",
  "Any",
  rows.map((r) => ({ ...r, net_income: -100 })),
);
const noOe = runValuation({
  floorInput: lossInput,
  price: { close: 19, date: "2026-10-30", currency: "USD" },
  dgs10: { value: 4.99, date: "2026-10-27" },
  asOf: "2026-10-30",
  guards: {
    adsSuppressed: false,
    fundamentalsStale: false,
    priceStale: false,
    splitCoverageStale: false,
  },
});
assert.equal(noOe.oeDcf?.assessable, false);
assert.equal(
  noOe.oeDcf?.growth_coverage_gap,
  "missing_interim",
  "non-assessable owner earnings cannot skip current financial coverage",
);
assert.equal(noOe.verdict, null);
assert.ok(noOe.floor?.kind === "floor" && !noOe.floor.growth_value.assessable);
for (const absent of ["net_income", "revenue"] as const) {
  const incomplete = rows.map((r, i) =>
    i === 0 ? { ...r, [absent]: null } : r,
  );
  const input = fundamentalsToFloorInput("ANY", "Any", incomplete);
  const run = runValuation({
    floorInput: input,
    price: { close: 20, date: "2026-04-01", currency: "USD" },
    dgs10: { value: 4.99, date: "2026-04-01" },
    asOf: "2026-04-01",
    guards: {
      adsSuppressed: false,
      fundamentalsStale: false,
      priceStale: false,
      splitCoverageStale: false,
    },
  });
  assert.equal(
    run.oeDcf?.growth_coverage_gap,
    "missing_comparables",
    `fresh FY with missing ${absent} cannot borrow old complete earnings`,
  );
  assert.equal(run.verdict, null);
}

// The shared growth policy still applies when only the Graham method is assessable.
for (const missingCapital of [false, true]) {
  const fiscal = [2025, 2024, 2023, 2022, 2021].map((fy, i) => ({
    ticker: "ANY", fiscal_year: fy, fiscal_period: "FY", form: "10-K",
    period_end: `${fy}-12-31`, revenue: missingCapital ? 2000-i*50 : 2000+i*100,
    net_income: [20,15,10,8,6][i], operating_income: 500-i*60, operating_margin: 0.25,
    shares_diluted: 100, shareholders_equity: 500, cash_and_equivalents: missingCapital && i===0 ? null : 100,
    short_term_investments: 0, total_debt: 0, capex: -300, d_and_a: i===0 ? 200 : 10,
    ppe_net: 2000, working_capital: 500-i*10, rd_expense: 0, effective_tax_rate: 0.21,
  }) as FundamentalPeriod);
  const result = runValuation({
    floorInput: fundamentalsToFloorInput("ANY", "Any", fiscal),
    price: { close: 20, date: "2026-04-01", currency: "USD" },
    dgs10: null, asOf: "2026-04-01",
    guards: { adsSuppressed: false, fundamentalsStale: false, priceStale: false, splitCoverageStale: false },
  });
  assert.equal(result.oeDcf?.assessable, false);
  assert.ok(result.floor?.kind === "floor");
  assert.equal(result.floor.growth_value.assessable, false,
    "Graham growth cannot bypass negative revenue or missing reinvestment when owner earnings are unavailable");
  assert.equal(result.floor.growth_value.per_share.neutral, 0);
  if (missingCapital) {
    assert.equal(result.oeDcf?.growth_coverage_gap, "missing_reinvestment");
    assert.equal(result.verdict, null);
  } else assert.equal(result.oeDcf?.growth_g1, 0);
}
