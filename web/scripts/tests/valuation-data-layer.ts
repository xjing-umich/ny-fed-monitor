import assert from "node:assert/strict";
import { calculateValuation, mockPrice, runResearchWorkflow, type NormalizedResearchData } from "../../src/lib/research";

function nearlyEqual(actual: number | undefined, expected: number, epsilon = 1e-9) {
  assert(actual != null, `Expected a number close to ${expected}, got ${actual}`);
  assert(Math.abs(actual - expected) < epsilon, `Expected ${actual} to be close to ${expected}`);
}

const baseData: NormalizedResearchData = {
  ticker: "MSFT",
  company_name: "Microsoft",
  period: "FY2025",
  normalized_financials: {
    revenue: 1000,
    operating_income: 300,
    net_income: 200,
    cash: 50,
    debt: 150,
    shares_outstanding: 10,
    buybacks: 20,
    dividends: 10,
  },
  financial_metrics: {
    free_cash_flow: 160,
    total_debt: 150,
  },
};

const scenarioA = calculateValuation({ ...baseData, price: mockPrice("MSFT", 25, "2026-06-08") });
assert.equal(scenarioA.valuation_source_status.status, "available");
nearlyEqual(scenarioA.valuation_metrics?.market_cap, 250);
nearlyEqual(scenarioA.valuation_metrics?.enterprise_value, 350);
nearlyEqual(scenarioA.valuation_metrics?.pe, 1.25);
nearlyEqual(scenarioA.valuation_metrics?.price_to_sales, 0.25);
nearlyEqual(scenarioA.valuation_metrics?.pfcf_ratio, 250 / 160);
nearlyEqual(scenarioA.valuation_metrics?.ev_sales, 0.35);
nearlyEqual(scenarioA.valuation_metrics?.ev_ebit, 350 / 300);
nearlyEqual(scenarioA.valuation_metrics?.fcf_yield, 160 / 250);
nearlyEqual(scenarioA.valuation_metrics?.earnings_yield, 200 / 250);
nearlyEqual(scenarioA.valuation_metrics?.dividend_yield, 10 / 250);
nearlyEqual(scenarioA.valuation_metrics?.buyback_yield, 20 / 250);

const scenarioB = calculateValuation({ ...baseData, price: null });
assert.equal(scenarioB.valuation_source_status.status, "unavailable");
assert.equal(scenarioB.valuation_metrics, undefined);
const workflowB = runResearchWorkflow("MSFT", { ...baseData, valuation_metrics: scenarioB.valuation_metrics });
assert.equal(workflowB.data_quality_gate.available_data.valuation_metrics, "Missing");
assert(workflowB.data_quality_gate.forbidden_claims.includes("undervalued"));

const noShares: NormalizedResearchData = {
  ...baseData,
  normalized_financials: {
    ...baseData.normalized_financials,
    shares_outstanding: undefined,
    shares_diluted: undefined,
    shares_basic: undefined,
    share_count: undefined,
  },
};
const scenarioC = calculateValuation({ ...noShares, price: mockPrice("MSFT", 25, "2026-06-08") });
assert.equal(scenarioC.valuation_source_status.status, "partial");
assert.equal(scenarioC.valuation_metrics?.market_cap, undefined);
assert.equal(scenarioC.valuation_metrics?.pe, undefined);
assert(scenarioC.valuation_source_status.data_quality.missing_valuation_fields.includes("market_cap"));

const workflowD = runResearchWorkflow("MSFT", { ...baseData, valuation_metrics: scenarioA.valuation_metrics });
assert.equal(workflowD.data_quality_gate.available_data.valuation_metrics, "Available");
assert(workflowD.data_quality_gate.allowed_claims.includes("historical valuation metric discussion"));
for (const forbidden of ["cheap", "expensive", "undervalued", "overvalued", "better than peers"]) {
  assert(workflowD.data_quality_gate.forbidden_claims.includes(forbidden), `Expected forbidden claim ${forbidden}`);
}

console.log("Valuation data layer tests passed.");
