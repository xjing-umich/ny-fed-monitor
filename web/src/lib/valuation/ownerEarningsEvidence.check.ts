import assert from "node:assert/strict";
import { deriveOeDcf } from "./ownerEarningsDcf";
import type { ValuationFloor, ValuationFloorYear } from "./types";
const years: ValuationFloorYear[] = [2025, 2024, 2023, 2022, 2021].map(
  (fiscal_year, i) => ({
    fiscal_year,
    revenue: 100 * 1.03 ** i,
    net_income: 100 * 1.1 ** (4 - i),
  }),
);
const floor = {
  kind: "floor",
  buffett_epv: {
    assessable: true,
    normalized_earnings: 100,
    equity_value_low: 1000,
    per_share_low: 10,
    method: { years_used: years.map((x) => x.fiscal_year) },
  },
  moat_cap: {
    grade: "strong",
    capYears: 20,
    durablePassed: true,
    basis: "fixture",
  },
  sustainable_growth: 0.3,
} as unknown as ValuationFloor;
const result = deriveOeDcf(
  floor,
  years,
  { value: 4.99, date: "2026-10-27" },
  null,
  years,
);
assert.equal(
  result.growth_g1,
  0,
  "valid negative revenue trend must constrain growth, not be discarded",
);
console.log("owner earnings evidence: negative-history regression passed");
const positiveYears = years.map((y, i) => ({
  ...y,
  revenue: 100 * 1.2 ** (4 - i),
}));
const evidence = {
  basis: "fy" as const,
  period_end: "2025-12-31",
  annual_period_end: "2025-12-31",
  latest_period_end: "2025-12-31",
  pairs: 0,
  missing_comparables: false,
  revenue_growth: 0.08,
  earnings_growth: 0.12,
};
const currentOptions = { evidence, asOf: "2026-04-01" };
assert.ok(
  deriveOeDcf(floor, positiveYears, null, null, positiveYears, currentOptions)
    .growth_g1! <= 0.08,
  "current revenue constrains old growth",
);
assert.equal(
  deriveOeDcf(floor, positiveYears, null, null, positiveYears, {
    ...currentOptions,
    evidence: { ...evidence, earnings_growth: -0.1 },
  }).growth_g1,
  0,
  "recent annual earnings decline is not ignored",
);
assert.equal(
  deriveOeDcf(floor, positiveYears, null, null, positiveYears, {
    ...currentOptions,
    asOf: "2026-10-30",
  }).growth_g1,
  0,
  "missing current financials cannot support growth",
);
const bank = { ...floor, is_financial: true, financial_sgr: 0 };
assert.equal(
  deriveOeDcf(bank, positiveYears, null, null, positiveYears, currentOptions)
    .growth_g1,
  0,
  "strong bank SGR zero cannot fall back to positive growth",
);
assert.equal(
  deriveOeDcf(
    { ...bank, financial_sgr: 0.02, sustainable_growth: undefined },
    positiveYears,
    null,
    null,
    positiveYears,
    currentOptions,
  ).growth_g1,
  0.02,
  "banks use SGR independently of industrial reinvestment",
);
console.log("current evidence and bank SGR regression checks passed");
