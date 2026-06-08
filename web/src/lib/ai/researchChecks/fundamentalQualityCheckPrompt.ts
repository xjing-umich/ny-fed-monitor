import type { DataQualityGateInput, ResearchCheckPrompt } from "./types";
import { baseSystemPrompt, buildPromptPayload, NOT_INVESTMENT_RECOMMENDATION, payloadForModel } from "./promptHelpers";

export const fundamentalQualityCheckResponseFormat = {
  data_coverage: {
    status: "Available | Partial | Missing",
    data_confidence: "High | Medium | Low",
    missing_fields: ["..."],
    allowed_claims: ["..."],
    forbidden_claims: ["..."],
    evidence_used: ["..."],
    limitations: ["..."],
  },
  business_quality: "...",
  profitability: "...",
  free_cash_flow_quality: "...",
  balance_sheet_strength: "...",
  capital_allocation: "...",
  risk_flags_related_to_fundamentals: ["..."],
  supported_conclusions: ["..."],
  cannot_conclude: ["..."],
  next_data_needed: ["..."],
  disclaimer: NOT_INVESTMENT_RECOMMENDATION,
};

export function fundamental_quality_check_prompt(input: DataQualityGateInput): ResearchCheckPrompt {
  const payload = buildPromptPayload(input);
  return {
    skill: "fundamental_quality",
    label: "Fundamental Quality Check",
    system: baseSystemPrompt("Role: Fundamental Quality Check. Analyze business quality, profitability, FCF quality, balance sheet strength, and capital allocation only when the gate and normalized data support those claims."),
    user: [
      "Create a Data-Grounded Interpretation for Fundamental Quality Check.",
      "Required sections: role, strict rules, required output format, forbidden claims, data coverage, supported conclusions, missing data, next data needed.",
      "Use only revenue, gross profit, operating income, net income, EPS, margins, operating cash flow, free cash flow, FCF margin/conversion, ROIC, ROE, cash, debt, net debt, shareholders' equity, interest coverage, share count, buybacks, and dividends when provided.",
      "If fundamentals are missing, do not judge business quality, profitability, ROIC, FCF quality, or balance sheet strength.",
      "If valuation data is missing, do not use valuation language.",
      "If peer comparison is missing, do not claim peer leadership or competitor outperformance.",
      "Required JSON output format:",
      JSON.stringify(fundamentalQualityCheckResponseFormat),
      "Model input:",
      payloadForModel(payload),
    ].join("\n\n"),
    response_format: fundamentalQualityCheckResponseFormat,
  };
}
