export type DataConfidence = "High" | "Medium" | "Low";
export type CoverageStatus = "Available" | "Partial" | "Missing";
export type AnalysisLevel = "none" | "13f_only" | "financial_supported" | "full_supported";
export type ResearchCheckKind = "fundamental_quality" | "growth_capacity" | "evidence_based_risk";

export type Claim =
  | "13f_disclosed_holdings"
  | "13f_investor_overlap"
  | "13f_position_changes"
  | "business_quality"
  | "profitability"
  | "free_cash_flow_quality"
  | "balance_sheet_strength"
  | "capital_allocation"
  | "historical_growth"
  | "growth_quality"
  | "forward_growth_visibility"
  | "historical_valuation"
  | "relative_peer_comparison"
  | "external_risk_evidence";

export type NormalizedFinancialData = {
  revenue?: number;
  gross_profit?: number;
  operating_income?: number;
  net_income?: number;
  eps?: number;
  gross_margin?: number;
  operating_margin?: number;
  net_margin?: number;
  operating_cash_flow?: number;
  free_cash_flow?: number;
  fcf_margin?: number;
  fcf_conversion?: number;
  roic?: number;
  roe?: number;
  cash?: number;
  debt?: number;
  net_debt?: number;
  shareholders_equity?: number;
  interest_coverage?: number;
  share_count?: number;
  buybacks?: number;
  dividends?: number;
};

export type GrowthMetrics = {
  revenue_growth?: number;
  revenue_growth_acceleration?: number;
  segment_growth?: Record<string, number>;
  geographic_growth?: Record<string, number>;
  profit_growth?: number;
  eps_growth?: number;
  free_cash_flow_growth?: number;
  margin_change?: number;
  reinvestment_rate?: number;
  growth_efficiency?: number;
  guidance?: string;
  analyst_estimates?: string;
  backlog?: number;
  bookings?: number;
  rpo?: number;
  deferred_revenue?: number;
  peer_context?: string;
};

export type ThirteenFSummaryMetrics = {
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
  pe?: number;
  forward_pe?: number;
  ev_to_ebitda?: number;
  price_to_sales?: number;
  price_to_book?: number;
  fcf_yield?: number;
  historical_range_note?: string;
};

export type RiskSignals = {
  growth_risk?: string[];
  profitability_margin_risk?: string[];
  free_cash_flow_risk?: string[];
  balance_sheet_leverage_risk?: string[];
  capital_allocation_risk?: string[];
  valuation_risk?: string[];
  forward_looking_risk?: string[];
  external_evidence?: string[];
};

export type DataQualityGateInput = {
  normalized_financials?: NormalizedFinancialData;
  calculated_metrics?: NormalizedFinancialData;
  growth_metrics?: GrowthMetrics;
  thirteen_f_summary?: ThirteenFSummaryMetrics;
  valuation_metrics?: ValuationMetrics;
  risk_signals?: RiskSignals;
  missing_fields?: string[];
  allowed_ai_claims?: Claim[];
  forbidden_ai_claims?: string[];
  peer_comparison_available?: boolean;
};

export type DataQualityGateOutput = {
  data_coverage: Record<string, CoverageStatus>;
  data_confidence: DataConfidence;
  analysis_level: AnalysisLevel;
  missing_fields: string[];
  allowed_ai_claims: Claim[];
  forbidden_ai_claims: string[];
  evidence_used: string[];
  limitations: string[];
};

export type ResearchCheckPromptPayload = DataQualityGateInput & {
  data_quality_gate: DataQualityGateOutput;
};

export type ResearchCheckPrompt = {
  skill: ResearchCheckKind;
  label: string;
  system: string;
  user: string;
  response_format: Record<string, unknown>;
};
