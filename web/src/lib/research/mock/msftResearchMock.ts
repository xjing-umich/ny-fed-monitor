import type { NormalizedResearchData } from "../schemas/researchSchemas";

export const msftResearchMock: NormalizedResearchData = {
  ticker: "MSFT",
  company_name: "Microsoft",
  period: "FY2025 mock period",
  normalized_financials: {
    revenue: 245_000,
    gross_profit: 171_000,
    operating_income: 109_000,
    net_income: 88_000,
    eps: 11.8,
    cash: 80_000,
    debt: 45_000,
    net_debt: -35_000,
    shareholders_equity: 220_000,
    share_count: 7_430,
    buybacks: 12_000,
    dividends: 22_000,
  },
  financial_metrics: {
    gross_margin: 0.698,
    operating_margin: 0.445,
    net_margin: 0.359,
    operating_cash_flow: 119_000,
    free_cash_flow: 74_000,
    fcf_margin: 0.302,
    fcf_conversion: 0.841,
    roic: 0.27,
    roe: 0.4,
    interest_coverage: 35,
  },
  growth_metrics: {
    revenue_growth: 0.15,
    revenue_growth_acceleration: 0.02,
    growth_drivers: ["cloud revenue", "productivity software revenue"],
    profit_growth: 0.17,
    eps_growth: 0.18,
    free_cash_flow_growth: 0.12,
    margin_change: 0.01,
    reinvestment_rate: 0.22,
    growth_efficiency: 1.1,
    rpo: 230_000,
    deferred_revenue: 65_000,
  },
  thirteen_f_summary: {
    disclosed_holders: 42,
    overlapping_investors: ["Berkshire Hathaway", "Dodge & Cox"],
    position_changes: [{ investor: "Dodge & Cox", action: "increased", period: "2026 Q1" }],
    coverage_note: "Mock lagged public 13F summary.",
  },
  valuation_metrics: {
    pe: 33,
    forward_pe: 29,
    price_to_sales: 11,
    fcf_yield: 0.021,
    historical_range_note: "Mock valuation metrics only; no target price is provided.",
  },
  risk_signals: {
    growth_risk: [
      "Growth risk is linked to cloud revenue exposure in the normalized mock metrics. The workflow cannot assess future cloud demand without guidance, segment trend, or external evidence.",
    ],
    valuation_risk: ["Valuation multiples are present, but peer comparison is not included in this mock."],
    forward_looking_risk: ["RPO and deferred revenue are available, but management guidance text is not supplied."],
  },
};

export const researchScenarioMocks = {
  scenarioAOnly13F: {
    ticker: "MSFT",
    company_name: "Microsoft",
    period: "2026 Q1 mock 13F period",
    thirteen_f_summary: msftResearchMock.thirteen_f_summary,
  },
  scenarioBFinancialNoValuation: {
    ticker: "MSFT",
    company_name: "Microsoft",
    period: "FY2025 mock period",
    normalized_financials: msftResearchMock.normalized_financials,
    financial_metrics: msftResearchMock.financial_metrics,
    growth_metrics: msftResearchMock.growth_metrics,
    risk_signals: {
      profitability_margin_risk: ["Operating margin changed in the normalized mock metrics."],
    },
  },
  scenarioCFinancialValuationNoPeer: {
    ticker: "MSFT",
    company_name: "Microsoft",
    period: "FY2025 mock period",
    normalized_financials: msftResearchMock.normalized_financials,
    financial_metrics: msftResearchMock.financial_metrics,
    growth_metrics: msftResearchMock.growth_metrics,
    valuation_metrics: msftResearchMock.valuation_metrics,
  },
  scenarioDExternalRiskMissing: {
    ...msftResearchMock,
    external_evidence: undefined,
  },
} satisfies Record<string, NormalizedResearchData>;
