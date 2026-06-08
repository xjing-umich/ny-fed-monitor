import type { CoverageStatus, DataQualityGateResult, NormalizedResearchData } from "../schemas/researchSchemas";

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
  "FCF quality",
  "balance sheet strength",
  "ROIC",
  "ROE",
];

const THIRTEEN_F_FORBIDDEN = [
  "real-time holdings",
  "investor motivation",
  "institutional buying",
  "institutional selling",
  "institutions are buying",
  "institutions are selling",
];

const PEER_FORBIDDEN = ["best-in-class", "market leader", "better than peers", "industry leader"];

const EXTERNAL_RISK_FORBIDDEN = [
  "regulatory risk",
  "litigation risk",
  "competition risk",
  "customer churn",
  "management risk",
  "geopolitical risk",
];

const ALWAYS_FORBIDDEN = [
  "buy",
  "sell",
  "hold",
  "avoid",
  "short",
  "target price",
  "automated trading",
  "broker execution",
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

function status(available: boolean): CoverageStatus {
  return available ? "Available" : "Missing";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function dataQualityGate(data: NormalizedResearchData): DataQualityGateResult {
  const fundamentalsAvailable = hasAny(data.normalized_financials) || hasAny(data.financial_metrics);
  const growthAvailable = hasAny(data.growth_metrics);
  const thirteenFAvailable = hasAny(data.thirteen_f_summary);
  const valuationAvailable = hasAny(data.valuation_metrics);
  const peerAvailable = hasAny(data.peer_comparison);
  const riskSignalsAvailable = hasAny(data.risk_signals);
  const externalEvidenceAvailable = hasAny(data.external_evidence);

  const available_data = {
    normalized_financials: status(hasAny(data.normalized_financials)),
    financial_metrics: status(hasAny(data.financial_metrics)),
    growth_metrics: status(growthAvailable),
    thirteen_f_summary: status(thirteenFAvailable),
    valuation_metrics: status(valuationAvailable),
    risk_signals: status(riskSignalsAvailable),
    peer_comparison: status(peerAvailable),
    external_evidence: status(externalEvidenceAvailable),
  };

  const missing_data = Object.entries(available_data)
    .filter(([, value]) => value === "Missing")
    .map(([key]) => key);

  const allowed_claims = [
    thirteenFAvailable ? "disclosed 13F holding interpretation" : "",
    thirteenFAvailable ? "lagged 13F position change discussion" : "",
    fundamentalsAvailable ? "fundamental quality discussion supported by normalized financials" : "",
    fundamentalsAvailable ? "profitability and cash-flow discussion when metrics exist" : "",
    growthAvailable ? "historical growth discussion supported by growth metrics" : "",
    valuationAvailable ? "historical valuation metric discussion" : "",
    peerAvailable ? "peer comparison discussion" : "",
    riskSignalsAvailable ? "risk signal discussion from provided normalized risk signals" : "",
    externalEvidenceAvailable ? "external evidence risk discussion from provided evidence" : "",
  ].filter(Boolean);

  const forbidden_claims = unique([
    ...ALWAYS_FORBIDDEN,
    ...THIRTEEN_F_FORBIDDEN,
    ...(!valuationAvailable ? VALUATION_FORBIDDEN : []),
    ...(!fundamentalsAvailable ? FUNDAMENTAL_FORBIDDEN : []),
    ...(!peerAvailable ? PEER_FORBIDDEN : []),
    ...(!externalEvidenceAvailable ? EXTERNAL_RISK_FORBIDDEN : []),
  ]);

  const evidence_used = [
    hasAny(data.normalized_financials) ? "normalized financial statement data" : "",
    hasAny(data.financial_metrics) ? "calculated financial metrics" : "",
    growthAvailable ? "growth metrics" : "",
    thirteenFAvailable ? "13F summary metrics" : "",
    valuationAvailable ? "valuation metrics" : "",
    riskSignalsAvailable ? "risk signals" : "",
    peerAvailable ? "peer comparison" : "",
    externalEvidenceAvailable ? "external evidence" : "",
  ].filter(Boolean);

  const analysis_level =
    fundamentalsAvailable && valuationAvailable && peerAvailable && externalEvidenceAvailable
      ? "full_supported"
      : fundamentalsAvailable && valuationAvailable
        ? "financial_and_valuation_supported_peer_external_missing"
        : fundamentalsAvailable
          ? "core_financial_supported"
          : thirteenFAvailable
            ? "13f_only"
            : "none";

  const data_confidence =
    fundamentalsAvailable && growthAvailable && valuationAvailable && (peerAvailable || externalEvidenceAvailable)
      ? "High"
      : fundamentalsAvailable && (growthAvailable || valuationAvailable || thirteenFAvailable)
        ? "Medium"
        : "Low";

  const limitations = [
    "Only normalized research data may be used; raw SEC companyfacts JSON, raw 13F filings, and unprocessed API responses are excluded.",
    "The workflow is a data-quality-aware equity research assistant, not an automated trading system.",
    "No buy, sell, hold, target price, broker execution, or automated trading output is allowed.",
    !fundamentalsAvailable ? "Fundamental quality, profitability, FCF quality, balance sheet strength, ROIC, and ROE claims are disabled." : "",
    !valuationAvailable ? "Valuation conclusions such as cheap, expensive, undervalued, overvalued, fair value, target price, upside, downside, and margin of safety are disabled." : "",
    thirteenFAvailable ? "13F data is lagged and supports disclosed holdings only, not real-time holdings or investor motivation." : "",
    !peerAvailable ? "Peer-relative claims such as best-in-class, market leader, better than peers, and industry leader are disabled." : "",
    !externalEvidenceAvailable ? "External risk claims such as regulatory, litigation, competition, churn, management, or geopolitical risks are disabled unless provided as evidence." : "",
  ].filter(Boolean);

  return {
    available_data,
    missing_data,
    analysis_level,
    data_confidence,
    allowed_claims,
    forbidden_claims,
    evidence_used,
    limitations,
  };
}
