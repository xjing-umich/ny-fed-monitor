import type {
  Claim,
  CoverageStatus,
  DataConfidence,
  DataQualityGateInput,
  DataQualityGateOutput,
  NormalizedFinancialData,
} from "./types";

const VALUATION_FORBIDDEN = [
  "undervalued",
  "overvalued",
  "cheap",
  "expensive",
  "fair value",
  "target price",
  "upside",
  "downside",
  "margin of safety",
];

const FUNDAMENTAL_FORBIDDEN = [
  "business quality",
  "profitability",
  "ROIC",
  "FCF quality",
  "balance sheet strength",
];

const THIRTEEN_F_FORBIDDEN = [
  "real-time holdings",
  "investor motivation",
  "full portfolio exposure",
  "investor confidence",
  "institutions are buying",
  "institutions are selling",
];

const PEER_FORBIDDEN = [
  "better than peers",
  "worse than peers",
  "best-in-class",
  "industry leader",
  "outperforming competitors",
  "market leader",
];

const EXTERNAL_RISK_FORBIDDEN = [
  "regulatory risk",
  "litigation risk",
  "competition risk",
  "customer churn",
  "management problems",
  "geopolitical risk",
];

const STRICT_FORBIDDEN = [
  "buy",
  "sell",
  "hold",
  "avoid",
  "short",
  "strong moat",
  "compounder",
  "recession-proof",
  "guaranteed",
  "future winner",
];

function hasAny(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  return Object.values(data).some((value) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
}

function hasAnyKey(data: NormalizedFinancialData | undefined, keys: (keyof NormalizedFinancialData)[]): boolean {
  return keys.some((key) => data?.[key] != null);
}

function coverage(available: boolean, partial: boolean): CoverageStatus {
  if (available) return "Available";
  if (partial) return "Partial";
  return "Missing";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function addClaim(claims: Set<Claim>, claim: Claim, userAllowed?: Claim[]) {
  if (!userAllowed || userAllowed.includes(claim)) claims.add(claim);
}

export function evaluateDataQualityGate(input: DataQualityGateInput): DataQualityGateOutput {
  const financials = { ...(input.normalized_financials ?? {}), ...(input.calculated_metrics ?? {}) };
  const hasIncomeStatement = hasAnyKey(financials, [
    "revenue",
    "gross_profit",
    "operating_income",
    "net_income",
    "eps",
  ]);
  const hasProfitability = hasAnyKey(financials, ["gross_margin", "operating_margin", "net_margin", "roic", "roe"]);
  const hasCashFlow = hasAnyKey(financials, ["operating_cash_flow", "free_cash_flow", "fcf_margin", "fcf_conversion"]);
  const hasBalanceSheet = hasAnyKey(financials, ["cash", "debt", "net_debt", "shareholders_equity", "interest_coverage"]);
  const hasCapitalAllocation = hasAnyKey(financials, ["share_count", "buybacks", "dividends"]);
  const fundamentalsAvailable = hasIncomeStatement || hasProfitability || hasCashFlow || hasBalanceSheet;
  const valuationAvailable = hasAny(input.valuation_metrics);
  const growthAvailable = hasAny(input.growth_metrics);
  const thirteenFAvailable = hasAny(input.thirteen_f_summary);
  const riskAvailable = hasAny(input.risk_signals);
  const externalRiskAvailable = (input.risk_signals?.external_evidence?.length ?? 0) > 0;
  const peerAvailable = input.peer_comparison_available === true || Boolean(input.growth_metrics?.peer_context);

  const allowed = new Set<Claim>();
  addClaim(allowed, "13f_disclosed_holdings", thirteenFAvailable ? input.allowed_ai_claims : []);
  addClaim(allowed, "13f_investor_overlap", thirteenFAvailable ? input.allowed_ai_claims : []);
  addClaim(allowed, "13f_position_changes", thirteenFAvailable ? input.allowed_ai_claims : []);
  if (fundamentalsAvailable) addClaim(allowed, "business_quality", input.allowed_ai_claims);
  if (hasProfitability) addClaim(allowed, "profitability", input.allowed_ai_claims);
  if (hasCashFlow) addClaim(allowed, "free_cash_flow_quality", input.allowed_ai_claims);
  if (hasBalanceSheet) addClaim(allowed, "balance_sheet_strength", input.allowed_ai_claims);
  if (hasCapitalAllocation) addClaim(allowed, "capital_allocation", input.allowed_ai_claims);
  if (growthAvailable) {
    addClaim(allowed, "historical_growth", input.allowed_ai_claims);
    addClaim(allowed, "growth_quality", input.allowed_ai_claims);
  }
  if (
    input.growth_metrics?.guidance ||
    input.growth_metrics?.analyst_estimates ||
    input.growth_metrics?.backlog != null ||
    input.growth_metrics?.bookings != null ||
    input.growth_metrics?.rpo != null ||
    input.growth_metrics?.deferred_revenue != null
  ) {
    addClaim(allowed, "forward_growth_visibility", input.allowed_ai_claims);
  }
  if (valuationAvailable) addClaim(allowed, "historical_valuation", input.allowed_ai_claims);
  if (peerAvailable) addClaim(allowed, "relative_peer_comparison", input.allowed_ai_claims);
  if (externalRiskAvailable) addClaim(allowed, "external_risk_evidence", input.allowed_ai_claims);

  const forbidden = [
    ...STRICT_FORBIDDEN,
    ...THIRTEEN_F_FORBIDDEN,
    ...(!valuationAvailable ? VALUATION_FORBIDDEN : []),
    ...(!fundamentalsAvailable ? FUNDAMENTAL_FORBIDDEN : []),
    ...(!peerAvailable ? PEER_FORBIDDEN : []),
    ...(!externalRiskAvailable ? EXTERNAL_RISK_FORBIDDEN : []),
    ...(input.forbidden_ai_claims ?? []),
  ];

  const missing = new Set(input.missing_fields ?? []);
  if (!fundamentalsAvailable) missing.add("normalized_financial_statement_data");
  if (!growthAvailable) missing.add("growth_metrics");
  if (!thirteenFAvailable) missing.add("13f_summary_metrics");
  if (!valuationAvailable) missing.add("valuation_metrics");
  if (!peerAvailable) missing.add("peer_comparison");
  if (!externalRiskAvailable) missing.add("external_risk_evidence");

  const evidenceUsed = [
    fundamentalsAvailable ? "normalized financial statement data and calculated financial metrics" : "",
    growthAvailable ? "growth metrics" : "",
    thirteenFAvailable ? "13F summary metrics" : "",
    valuationAvailable ? "valuation metrics" : "",
    riskAvailable ? "risk signals" : "",
    "data quality gate output",
  ].filter(Boolean);

  let confidence: DataConfidence = "Low";
  if (fundamentalsAvailable && growthAvailable && valuationAvailable && peerAvailable && externalRiskAvailable) {
    confidence = "High";
  } else if (fundamentalsAvailable && (growthAvailable || valuationAvailable || thirteenFAvailable)) {
    confidence = "Medium";
  }

  const analysisLevel =
    fundamentalsAvailable && valuationAvailable
      ? "full_supported"
      : fundamentalsAvailable
        ? "financial_supported"
        : thirteenFAvailable
          ? "13f_only"
          : "none";

  const limitations = [
    "Use only normalized data supplied in the request; raw SEC filings, raw companyfacts JSON, raw 13F filings, and messy API responses are out of scope.",
    "Do not provide investment recommendations, target prices, or unsupported valuation/business-quality claims.",
    !valuationAvailable ? "Valuation conclusions are disabled because valuation metrics are missing." : "",
    !fundamentalsAvailable ? "Fundamental quality conclusions are disabled because normalized financial data is missing." : "",
    thirteenFAvailable
      ? "13F data is lagged and partial; it can support disclosed holdings and changes only, not current real-time holdings or investor motivation."
      : "",
    !peerAvailable ? "Peer-relative conclusions are disabled because peer comparison data is missing." : "",
    !externalRiskAvailable ? "External risk conclusions are disabled because external evidence is missing." : "",
  ].filter(Boolean);

  return {
    data_coverage: {
      fundamentals: coverage(fundamentalsAvailable, hasIncomeStatement || hasProfitability || hasCashFlow || hasBalanceSheet),
      growth: coverage(growthAvailable, false),
      thirteen_f: coverage(thirteenFAvailable, false),
      valuation: coverage(valuationAvailable, false),
      risk_signals: coverage(riskAvailable, false),
      peer_comparison: coverage(peerAvailable, false),
      external_risk_evidence: coverage(externalRiskAvailable, false),
    },
    data_confidence: confidence,
    analysis_level: analysisLevel,
    missing_fields: [...missing],
    allowed_ai_claims: [...allowed],
    forbidden_ai_claims: unique(forbidden),
    evidence_used: evidenceUsed,
    limitations,
  };
}
