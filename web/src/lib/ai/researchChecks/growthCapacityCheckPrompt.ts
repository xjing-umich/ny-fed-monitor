import type { DataQualityGateInput, ResearchCheckPrompt } from "./types";
import { baseSystemPrompt, buildPromptPayload, NOT_INVESTMENT_RECOMMENDATION, payloadForModel } from "./promptHelpers";

export const growthCapacityCheckResponseFormat = {
  data_coverage: {
    status: "Available | Partial | Missing",
    data_confidence: "High | Medium | Low",
    missing_fields: ["..."],
    allowed_claims: ["..."],
    forbidden_claims: ["..."],
    evidence_used: ["..."],
    limitations: ["..."],
  },
  revenue_growth: "...",
  growth_drivers: "...",
  segment_geographic_growth: "...",
  profit_growth: "...",
  free_cash_flow_growth: "...",
  margin_operating_leverage: "...",
  reinvestment_efficiency: "...",
  forward_growth_visibility: "...",
  peer_industry_context: "...",
  growth_quality_assessment: "...",
  growth_risk_flags: ["..."],
  supported_conclusions: ["..."],
  cannot_conclude: ["..."],
  next_data_needed: ["..."],
  disclaimer: NOT_INVESTMENT_RECOMMENDATION,
};

export function growth_capacity_check_prompt(input: DataQualityGateInput): ResearchCheckPrompt {
  const payload = buildPromptPayload(input);
  return {
    skill: "growth_capacity",
    label: "Growth Capacity Check",
    system: baseSystemPrompt("Role: Growth Capacity Check. Analyze historical and forward growth capacity only when normalized growth data and gate permissions support the conclusion."),
    user: [
      "Create an Evidence-Bound Research Note for Growth Capacity Check.",
      "Required sections: role, strict rules, required output format, forbidden claims, data coverage, supported conclusions, missing data, next data needed.",
      "Analyze revenue growth, acceleration/deceleration, growth drivers, segment/geographic growth, profit growth, EPS growth, FCF growth, margin and operating leverage, reinvestment efficiency, forward visibility, peer/industry context, and growth risk flags only when provided.",
      "Do not assume future growth unless guidance, analyst estimates, backlog, bookings, RPO, deferred revenue, or other forward-looking data is provided.",
      "If peer comparison is missing, do not say better than peers, best-in-class, industry leader, or outperforming competitors.",
      "Required JSON output format:",
      JSON.stringify(growthCapacityCheckResponseFormat),
      "Model input:",
      payloadForModel(payload),
    ].join("\n\n"),
    response_format: growthCapacityCheckResponseFormat,
  };
}
