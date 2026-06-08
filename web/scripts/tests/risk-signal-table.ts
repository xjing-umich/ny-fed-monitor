import assert from "node:assert/strict";
import { generateRiskSignals, runResearchWorkflow, type NormalizedResearchData } from "../../src/lib/research";

function ids(data: NormalizedResearchData): string[] {
  return generateRiskSignals(data).signals.map((signal) => signal.id);
}

function assertHas(data: NormalizedResearchData, id: string) {
  assert(ids(data).includes(id), `Expected ${id}, got ${ids(data).join(", ")}`);
}

function assertNotHas(data: NormalizedResearchData, id: string) {
  assert(!ids(data).includes(id), `Did not expect ${id}, got ${ids(data).join(", ")}`);
}

const baseHistory = [
  { fiscal_year: 2022, revenue: 100, gross_margin: 0.5, operating_margin: 0.3, net_margin: 0.2, net_income: 20, free_cash_flow: 15, fcf_margin: 0.15, cash: 50, total_debt: 20, net_debt: -30, debt_to_equity: 0.2, shareholders_equity: 100, share_count: 10, buybacks: 2, dividends: 1 },
  { fiscal_year: 2023, revenue: 130, gross_margin: 0.49, operating_margin: 0.29, net_margin: 0.19, net_income: 25, free_cash_flow: 20, fcf_margin: 0.154, cash: 45, total_debt: 25, net_debt: -20, debt_to_equity: 0.25, shareholders_equity: 100, share_count: 9.8, buybacks: 3, dividends: 1 },
  { fiscal_year: 2024, revenue: 143, gross_margin: 0.47, operating_margin: 0.27, net_margin: 0.17, net_income: 24, free_cash_flow: 10, fcf_margin: 0.07, cash: 35, total_debt: 40, net_debt: 5, debt_to_equity: 0.4, shareholders_equity: 100, share_count: 10.2, buybacks: 12, dividends: 4 },
];

const financialData: NormalizedResearchData = {
  ticker: "TST",
  annual_history: baseHistory,
  normalized_financials: {
    revenue: 143,
    operating_income: 38.61,
    net_income: 24,
    cash: 35,
    debt: 40,
    net_debt: 5,
    shareholders_equity: 100,
    share_count: 10.2,
    buybacks: 12,
    dividends: 4,
  },
  financial_metrics: {
    gross_margin: 0.47,
    operating_margin: 0.27,
    net_margin: 0.17,
    free_cash_flow: 10,
    fcf_margin: 0.07,
    fcf_conversion: 10 / 24,
    total_debt: 40,
    debt_to_equity: 0.4,
  },
  growth_metrics: {
    revenue_growth: 0.1,
    profit_growth: -0.04,
    free_cash_flow_growth: -0.5,
  },
};

assertHas(financialData, "revenue_growth_deceleration");
assertHas({ ...financialData, growth_metrics: { ...financialData.growth_metrics, revenue_growth: -0.05 } }, "negative_revenue_growth");
assertNotHas({ ...financialData, annual_history: baseHistory.slice(1), growth_metrics: { revenue_growth: 0.1 } }, "revenue_growth_deceleration");
assertHas(financialData, "gross_margin_compression");
assertNotHas({ ...financialData, annual_history: [{ fiscal_year: 2023, gross_margin: 0.49 }, { fiscal_year: 2024, gross_margin: 0.485 }] }, "gross_margin_compression");
assertHas({ ...financialData, financial_metrics: { ...financialData.financial_metrics, free_cash_flow: -1 } }, "negative_free_cash_flow");
assertHas(financialData, "fcf_decline");
assertHas(financialData, "rising_total_debt");
assertHas(financialData, "cash_decline");
assertHas(financialData, "share_dilution");
assertHas(financialData, "shareholder_returns_exceed_fcf");

const valuationData: NormalizedResearchData = {
  ...financialData,
  valuation_metrics: {
    pe: 45,
    pfcf_ratio: 50,
    fcf_yield: 0.02,
    earnings_yield: 0.02,
  },
};
assertHas(valuationData, "valuation_available_but_peer_context_missing");
assertHas(valuationData, "pe_above_configured_threshold");
const workflow = runResearchWorkflow("TST", { ...valuationData, risk_signals: generateRiskSignals(valuationData) });
const { data_coverage: riskCoverage, disclaimer: riskDisclaimer, ...riskNarrative } = workflow.skill_results.evidence_based_risk_check;
void riskCoverage;
void riskDisclaimer;
for (const forbidden of ["cheap", "expensive", "undervalued", "overvalued", "fair value", "target price", "upside", "downside", "margin of safety"]) {
  assert(workflow.data_quality_gate.forbidden_claims.includes(forbidden));
  assert(!JSON.stringify(riskNarrative).toLowerCase().includes(forbidden));
  assert(!JSON.stringify(generateRiskSignals(valuationData).signals).toLowerCase().includes(forbidden));
}

assertHas(financialData, "missing_external_evidence");
assertHas(financialData, "missing_peer_comparison");
assertHas(financialData, "missing_forward_looking_data");

const thirteenFOnly: NormalizedResearchData = {
  ticker: "TST",
  thirteen_f_summary: {
    disclosed_holders: 2,
    position_changes: [
      { investor: "A", action: "decreased", period: "2025 Q1" },
      { investor: "B", action: "increased", period: "2025 Q1" },
    ],
    coverage_note: "Lagged 13F summary only.",
  },
};
const thirteenFSignals = generateRiskSignals(thirteenFOnly).signals;
assert(thirteenFSignals.some((signal) => signal.category === "13F Investor Signal Risk"));
assert(thirteenFSignals.every((signal) => signal.category === "13F Investor Signal Risk" || signal.category === "Data Quality Risk"));

console.log("Risk signal table tests passed.");
