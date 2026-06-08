import type { EvidenceBasedRiskCheckResult, SkillInput, SupportedRiskFlag } from "../schemas/researchSchemas";
import { coverageBlock, disclaimer, hasAny, unavailable } from "./skillHelpers";

function flags(category: string, values: string[] | undefined, dataNeededNext: string[]): SupportedRiskFlag[] {
  return (values ?? []).map((evidence) => ({
    risk_category: category,
    severity: "Medium",
    evidence,
    why_it_matters: "This risk is included only because it appears in the normalized risk signal input.",
    data_needed_next: dataNeededNext,
  }));
}

export function runEvidenceBasedRiskCheck(input: SkillInput): EvidenceBasedRiskCheckResult {
  const risk = input.risk_signals;
  const external = input.external_evidence;
  const hasRisk = hasAny(risk) || hasAny(external) || hasAny(input.thirteen_f_summary);
  const supported_risk_flags = [
    ...flags("Growth risk", risk?.growth_risk, ["segment growth", "forward growth indicators"]),
    ...flags("Profitability and margin risk", risk?.profitability_margin_risk, ["margin bridge", "cost drivers"]),
    ...flags("Free cash flow risk", risk?.free_cash_flow_risk, ["working capital", "capex", "cash conversion"]),
    ...flags("Balance sheet and leverage risk", risk?.balance_sheet_leverage_risk, ["debt maturity schedule", "interest coverage"]),
    ...flags("Capital allocation risk", risk?.capital_allocation_risk, ["share count trend", "buybacks", "dividends"]),
    ...flags("Valuation risk", risk?.valuation_risk, ["valuation metrics", "historical valuation range"]),
    ...flags("Forward-looking risk", risk?.forward_looking_risk, ["guidance", "backlog", "RPO", "deferred revenue"]),
  ];

  return {
    data_coverage: coverageBlock(input, hasRisk ? "Partial" : "Missing"),
    investor_signal_risk: input.thirteen_f_summary
      ? "13F investor signal risk is limited to lagged disclosed holdings and position changes; it cannot support real-time holding or motivation claims."
      : unavailable("13F summary data is missing."),
    growth_risk: risk?.growth_risk?.join("; ") || unavailable("growth risk signals are missing."),
    profitability_margin_risk:
      risk?.profitability_margin_risk?.join("; ") || unavailable("profitability and margin risk signals are missing."),
    free_cash_flow_risk: risk?.free_cash_flow_risk?.join("; ") || unavailable("free cash flow risk signals are missing."),
    balance_sheet_leverage_risk:
      risk?.balance_sheet_leverage_risk?.join("; ") || unavailable("balance sheet and leverage risk signals are missing."),
    capital_allocation_risk:
      risk?.capital_allocation_risk?.join("; ") || unavailable("capital allocation risk signals are missing."),
    valuation_risk: input.valuation_metrics
      ? risk?.valuation_risk?.join("; ") || "No normalized valuation risk signal was supplied."
      : unavailable("valuation metrics are missing, so valuation risk cannot be assessed."),
    forward_looking_risk:
      risk?.forward_looking_risk?.join("; ") || unavailable("forward-looking risk signals are missing."),
    external_evidence_risk: hasAny(external)
      ? Object.entries(external ?? {})
          .flatMap(([category, values]) => (values ?? []).map((value) => `${category}: ${value}`))
          .join("; ")
      : unavailable("external evidence is missing; regulatory, litigation, competition, churn, management, and geopolitical risks cannot be invented."),
    data_quality_risk: input.data_quality_gate.limitations.join(" "),
    supported_risk_flags,
    cannot_assess: input.data_quality_gate.missing_data.map((field) => `Cannot assess ${field} without normalized supporting data.`),
    overall_risk_summary:
      supported_risk_flags.length > 0
        ? "Risk summary is limited to supported normalized risk flags and quality-gate limitations."
        : "No specific supported risk flags were supplied; only data quality limitations can be stated.",
    next_data_needed: input.data_quality_gate.missing_data,
    disclaimer: disclaimer(),
  };
}
