import assert from "node:assert/strict";
import type { SecLatestSummary } from "../sec/read";
import { deriveBusinessQuality } from "./businessQuality";
import { revenueGrowthStandard } from "../valuation/growthBaseRate";
const annual = Array.from({ length: 6 }, (_, i) => ({
  period_end: `${2021 + i}-06-30`,
  fiscal_year: 2020 + i,
  form: "10-K",
  revenue: 100 * 1.1 ** i,
  net_income: 20,
  net_margin: 0.2,
  roe: 0.3,
  fcf_margin: 0.1,
  revenue_yoy: 0.1,
})).reverse();
const latest = {
  ticker: "MSFT",
  latest_10k_period_end: "2026-06-30",
  latest_10q_period_end: "2026-09-30",
  latest_filing_date: "2026-10-28",
  quality_status: "high",
} as SecLatestSummary;
const growth = revenueGrowthStandard(annual);
assert.equal(
  growth?.fromYear,
  2021,
  "growth label must use the same reporting-period years as the revenue trail, including old stored FY labels",
);
assert.equal(growth?.toYear, 2026);
assert.ok(Math.abs(growth!.rate - 0.1) < 1e-10);
const bq = deriveBusinessQuality({
  annual,
  latest,
  filings: [
    { form: "10-Q", report_date: "2026-09-30", filing_date: "2026-10-28" },
  ],
});
assert.ok(bq);
assert.equal(bq.asOf, "2026-06-30", "FY ratios keep their actual basis");
assert.equal(
  bq.latestDisclosure?.periodEnd,
  "2026-09-30",
  "new quarter must be visible separately",
);
assert.equal(bq.latestDisclosure?.filedAt, "2026-10-28");
assert.equal(bq.annualForm, "10-K");
console.log("financial dates and historical growth span checks OK");
