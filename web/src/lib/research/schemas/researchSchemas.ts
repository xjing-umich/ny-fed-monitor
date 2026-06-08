export type DataConfidence = "High" | "Medium" | "Low";
export type CoverageStatus = "Available" | "Partial" | "Missing";
export type AnalysisLevel =
  | "none"
  | "13f_only"
  | "financial_supported"
  | "financial_and_valuation_supported_peer_external_missing"
  | "core_financial_supported"
  | "full_supported";
export type RiskSeverity = "High" | "Medium" | "Low";
export type EvidenceStrength = "High" | "Medium" | "Low";

export type NormalizedFinancials = {
  revenue?: number;
  gross_profit?: number;
  operating_income?: number;
  net_income?: number;
  eps?: number;
  cash?: number;
  total_assets?: number;
  total_liabilities?: number;
  debt?: number;
  net_debt?: number;
  shareholders_equity?: number;
  short_term_debt?: number;
  long_term_debt?: number;
  share_count?: number;
  shares_basic?: number;
  shares_diluted?: number;
  shares_outstanding?: number;
  buybacks?: number;
  dividends?: number;
};

export type FinancialMetrics = {
  gross_margin?: number;
  operating_margin?: number;
  net_margin?: number;
  operating_cash_flow?: number;
  free_cash_flow?: number;
  fcf_margin?: number;
  fcf_conversion?: number;
  roic?: number;
  roe?: number;
  interest_coverage?: number;
  capital_expenditure?: number;
  total_debt?: number;
  debt_to_equity?: number;
};

export type GrowthMetrics = {
  revenue_growth?: number;
  revenue_growth_acceleration?: number;
  growth_drivers?: string[];
  profit_growth?: number;
  eps_growth?: number;
  free_cash_flow_growth?: number;
  revenue_cagr_3y?: number;
  revenue_cagr_5y?: number;
  fcf_growth_yoy?: number;
  fcf_cagr_3y?: number;
  fcf_cagr_5y?: number;
  share_count_change_yoy?: number;
  margin_change?: number;
  reinvestment_rate?: number;
  growth_efficiency?: number;
  guidance?: string;
  analyst_estimates?: string;
  backlog?: number;
  bookings?: number;
  rpo?: number;
  deferred_revenue?: number;
};

export type ThirteenFSummary = {
  disclosed_holders?: number;
  overlapping_investors?: string[];
  position_changes?: {
    investor: string;
    action: "new" | "exited" | "increased" | "decreased" | "unchanged";
    period: string;
  }[];
  coverage_note?: string;
};

export type ValuationMetrics = {
  latest_price?: number;
  price_date?: string;
  price_currency?: string;
  price_source?: string;
  market_cap?: number;
  enterprise_value?: number;
  pe?: number;
  forward_pe?: number;
  ev_to_ebitda?: number;
  price_to_sales?: number;
  price_to_book?: number;
  pfcf_ratio?: number;
  ev_sales?: number;
  ev_ebit?: number;
  fcf_yield?: number;
  earnings_yield?: number;
  dividend_yield?: number;
  buyback_yield?: number;
  historical_range_note?: string;
};

export type RiskSignalCategory =
  | "Growth Risk"
  | "Profitability and Margin Risk"
  | "Free Cash Flow Risk"
  | "Balance Sheet and Leverage Risk"
  | "Capital Allocation Risk"
  | "Valuation Risk"
  | "13F Investor Signal Risk"
  | "Data Quality Risk";

export type RiskSignal = {
  id: string;
  category: RiskSignalCategory;
  severity: RiskSeverity;
  evidence_strength: EvidenceStrength;
  evidence: string;
  why_it_matters: string;
  data_needed_next: string[];
  source_fields: string[];
  source: "SYSTEM_DERIVED_RISK_SIGNAL";
};

export type AnnualResearchSnapshot = {
  fiscal_year: number;
  revenue?: number;
  gross_margin?: number;
  operating_margin?: number;
  net_margin?: number;
  net_income?: number;
  operating_cash_flow?: number;
  capital_expenditure?: number;
  free_cash_flow?: number;
  fcf_margin?: number;
  fcf_conversion?: number;
  cash?: number;
  total_debt?: number;
  net_debt?: number;
  debt_to_equity?: number;
  shareholders_equity?: number;
  share_count?: number;
  buybacks?: number;
  dividends?: number;
};

export type RiskSignals = {
  signals: RiskSignal[];
};

export type PeerComparison = {
  summary?: string;
  metrics?: Record<string, number | string>;
};

export type ExternalEvidence = {
  regulatory?: string[];
  litigation?: string[];
  competition?: string[];
  customer_churn?: string[];
  management?: string[];
  geopolitical?: string[];
};

export type NormalizedResearchData = {
  ticker: string;
  company_name?: string;
  period?: string;
  normalized_financials?: NormalizedFinancials;
  financial_metrics?: FinancialMetrics;
  growth_metrics?: GrowthMetrics;
  thirteen_f_summary?: ThirteenFSummary;
  valuation_metrics?: ValuationMetrics;
  annual_history?: AnnualResearchSnapshot[];
  risk_signals?: RiskSignals;
  peer_comparison?: PeerComparison;
  external_evidence?: ExternalEvidence;
};

export type DataQualityGateResult = {
  available_data: Record<string, CoverageStatus>;
  missing_data: string[];
  analysis_level: AnalysisLevel;
  data_confidence: DataConfidence;
  allowed_claims: string[];
  forbidden_claims: string[];
  evidence_used: string[];
  limitations: string[];
};

export type SkillInput = NormalizedResearchData & {
  data_quality_gate: DataQualityGateResult;
};

export type DataCoverageBlock = {
  status: CoverageStatus;
  data_confidence: DataConfidence;
  missing_fields: string[];
  allowed_claims: string[];
  forbidden_claims: string[];
  evidence_used: string[];
  limitations: string[];
};

export type FundamentalQualityCheckResult = {
  data_coverage: DataCoverageBlock;
  business_quality: string;
  profitability: string;
  free_cash_flow_quality: string;
  balance_sheet_strength: string;
  capital_allocation: string;
  supported_conclusions: string[];
  cannot_conclude: string[];
  next_data_needed: string[];
  disclaimer: string;
};

export type GrowthCapacityCheckResult = {
  data_coverage: DataCoverageBlock;
  revenue_growth: string;
  growth_drivers: string;
  profit_growth: string;
  free_cash_flow_growth: string;
  margin_operating_leverage: string;
  reinvestment_efficiency: string;
  forward_growth_visibility: string;
  growth_quality_assessment: string;
  growth_risk_flags: string[];
  supported_conclusions: string[];
  cannot_conclude: string[];
  next_data_needed: string[];
  disclaimer: string;
};

export type SupportedRiskFlag = {
  id?: string;
  risk_category: string;
  severity: RiskSeverity;
  evidence_strength?: EvidenceStrength;
  evidence: string;
  why_it_matters: string;
  data_needed_next: string[];
  source_fields?: string[];
  source?: "SYSTEM_DERIVED_RISK_SIGNAL";
};

export type EvidenceBasedRiskCheckResult = {
  data_coverage: DataCoverageBlock;
  investor_signal_risk: string;
  growth_risk: string;
  profitability_margin_risk: string;
  free_cash_flow_risk: string;
  balance_sheet_leverage_risk: string;
  capital_allocation_risk: string;
  valuation_risk: string;
  forward_looking_risk: string;
  external_evidence_risk: string;
  data_quality_risk: string;
  supported_risk_flags: SupportedRiskFlag[];
  cannot_assess: string[];
  overall_risk_summary: string;
  next_data_needed: string[];
  disclaimer: string;
};

export type ResearchNoteWriterResult = {
  research_snapshot: string;
  key_evidence: string[];
  fundamental_summary: string;
  growth_summary: string;
  risk_summary: string;
  limitations: string[];
  next_data_needed: string[];
  disclaimer: string;
};

export type ResearchWorkflowResult = {
  ticker: string;
  company_name?: string;
  period?: string;
  data_quality_gate: DataQualityGateResult;
  ui_ready: {
    data_coverage: Record<string, CoverageStatus>;
    data_confidence: DataConfidence;
    missing_fields: string[];
    allowed_claims: string[];
    forbidden_claims: string[];
    evidence_used: string[];
    limitations: string[];
    disclaimer: string;
  };
  skill_results: {
    fundamental_quality_check: FundamentalQualityCheckResult;
    growth_capacity_check: GrowthCapacityCheckResult;
    evidence_based_risk_check: EvidenceBasedRiskCheckResult;
    research_note_writer: ResearchNoteWriterResult;
  };
};

export const NOT_INVESTMENT_RECOMMENDATION =
  "Not an investment recommendation. This research note is evidence-bound and does not provide buy, sell, hold, target price, or trading instructions.";
