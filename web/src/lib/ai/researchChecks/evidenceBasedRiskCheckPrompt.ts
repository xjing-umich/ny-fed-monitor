import type { DataQualityGateInput, ResearchCheckPrompt } from "./types";
import { baseSystemPrompt, buildPromptPayload, NOT_INVESTMENT_RECOMMENDATION, payloadForModel } from "./promptHelpers";

export const evidenceBasedRiskCheckResponseFormat = {
  data_coverage: {
    status: "Available | Partial | Missing",
    data_confidence: "High | Medium | Low",
    missing_fields: ["..."],
    allowed_claims: ["..."],
    forbidden_claims: ["..."],
    evidence_used: ["..."],
    limitations: ["..."],
  },
  investor_signal_risk: "...",
  growth_risk: "...",
  profitability_margin_risk: "...",
  free_cash_flow_risk: "...",
  balance_sheet_leverage_risk: "...",
  capital_allocation_risk: "...",
  valuation_risk: "...",
  forward_looking_risk: "...",
  external_evidence_risk: "...",
  data_quality_risk: "...",
  supported_risk_flags: [
    {
      risk_category: "...",
      severity: "High | Medium | Low",
      evidence: "...",
      why_it_matters: "...",
      data_needed_next: ["..."],
    },
  ],
  cannot_assess: ["..."],
  overall_risk_summary: "...",
  next_data_needed: ["..."],
  disclaimer: NOT_INVESTMENT_RECOMMENDATION,
};

export function evidence_based_risk_check_prompt(input: DataQualityGateInput): ResearchCheckPrompt {
  const payload = buildPromptPayload(input);
  return {
    skill: "evidence_based_risk",
    label: "Evidence-Based Risk Check",
    system: baseSystemPrompt("Role: Evidence-Based Risk Check. Identify only risks supported by normalized data, risk signals, and the data quality gate."),
    user: [
      "Create an Evidence-Bound Research Note for Evidence-Based Risk Check.",
      "Required sections: role, strict rules, required output format, forbidden claims, data coverage, supported conclusions, missing data, next data needed.",
      "Risk categories: 13F / investor signal risk, growth risk, profitability and margin risk, free cash flow risk, balance sheet and leverage risk, capital allocation risk, valuation risk, forward-looking risk, external evidence risk, data quality risk.",
      "For each supported risk flag, return risk_category, severity, evidence, why_it_matters, and data_needed_next.",
      "Do not invent competition, regulation, litigation, customer churn, market share loss, management, or geopolitical risk unless external evidence is provided.",
      "If valuation data is missing, do not discuss valuation risk beyond saying it cannot be assessed.",
      "Required JSON output format:",
      JSON.stringify(evidenceBasedRiskCheckResponseFormat),
      "Model input:",
      payloadForModel(payload),
    ].join("\n\n"),
    response_format: evidenceBasedRiskCheckResponseFormat,
  };
}
