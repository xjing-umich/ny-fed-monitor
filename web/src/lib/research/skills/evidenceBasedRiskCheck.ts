import type { EvidenceBasedRiskCheckResult, RiskSignal, RiskSignalCategory, SkillInput, SupportedRiskFlag } from "../schemas/researchSchemas";
import { coverageBlock, disclaimer, unavailable } from "./skillHelpers";

function byCategory(signals: RiskSignal[], category: RiskSignalCategory): RiskSignal[] {
  return signals.filter((signal) => signal.category === category);
}

function summarize(signals: RiskSignal[], fallback: string): string {
  if (signals.length === 0) return unavailable(fallback);
  return signals.map((signal) => `${signal.id}: ${signal.evidence}`).join("; ");
}

function toSupportedRiskFlag(signal: RiskSignal): SupportedRiskFlag {
  return {
    id: signal.id,
    risk_category: signal.category,
    severity: signal.severity,
    evidence_strength: signal.evidence_strength,
    evidence: signal.evidence,
    why_it_matters: signal.why_it_matters,
    data_needed_next: signal.data_needed_next,
    source_fields: signal.source_fields,
    source: signal.source,
  };
}

export function runEvidenceBasedRiskCheck(input: SkillInput): EvidenceBasedRiskCheckResult {
  const signals = input.risk_signals?.signals ?? [];
  const external = input.external_evidence;
  const supported_risk_flags = signals.map(toSupportedRiskFlag);
  const dataQualitySignals = byCategory(signals, "Data Quality Risk");

  return {
    data_coverage: coverageBlock(input, signals.length > 0 ? "Partial" : "Missing"),
    investor_signal_risk: summarize(byCategory(signals, "13F Investor Signal Risk"), "13F summary data is missing or no 13F risk signal was generated."),
    growth_risk: summarize(byCategory(signals, "Growth Risk"), "growth risk signals are missing."),
    profitability_margin_risk: summarize(byCategory(signals, "Profitability and Margin Risk"), "profitability and margin risk signals are missing."),
    free_cash_flow_risk: summarize(byCategory(signals, "Free Cash Flow Risk"), "free cash flow risk signals are missing."),
    balance_sheet_leverage_risk: summarize(byCategory(signals, "Balance Sheet and Leverage Risk"), "balance sheet and leverage risk signals are missing."),
    capital_allocation_risk: summarize(byCategory(signals, "Capital Allocation Risk"), "capital allocation risk signals are missing."),
    valuation_risk: summarize(byCategory(signals, "Valuation Risk"), "valuation risk signals are missing."),
    forward_looking_risk: summarize(dataQualitySignals.filter((signal) => signal.id === "missing_forward_looking_data"), "forward-looking risk signals are missing."),
    external_evidence_risk: external
      ? Object.entries(external ?? {})
          .flatMap(([category, values]) => (values ?? []).map((value) => `${category}: ${value}`))
          .join("; ")
      : summarize(dataQualitySignals.filter((signal) => signal.id === "missing_external_evidence"), "external evidence is missing; regulatory, litigation, competition, churn, management, and geopolitical risks cannot be invented."),
    data_quality_risk: summarize(dataQualitySignals, "data quality risk signals are missing."),
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
