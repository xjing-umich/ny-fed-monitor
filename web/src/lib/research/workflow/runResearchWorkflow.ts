import { dataQualityGate } from "../gates/dataQualityGate";
import type { NormalizedResearchData, ResearchWorkflowResult } from "../schemas/researchSchemas";
import { NOT_INVESTMENT_RECOMMENDATION } from "../schemas/researchSchemas";
import { runEvidenceBasedRiskCheck } from "../skills/evidenceBasedRiskCheck";
import { runFundamentalQualityCheck } from "../skills/fundamentalQualityCheck";
import { runGrowthCapacityCheck } from "../skills/growthCapacityCheck";
import { runResearchNoteWriter } from "../skills/researchNoteWriter";

export function runResearchWorkflow(ticker: string, normalizedData: NormalizedResearchData): ResearchWorkflowResult {
  const data = { ...normalizedData, ticker: ticker.toUpperCase() };
  const gate = dataQualityGate(data);
  const skillInput = { ...data, data_quality_gate: gate };

  const fundamental = runFundamentalQualityCheck(skillInput);
  const growth = runGrowthCapacityCheck(skillInput);
  const risk = runEvidenceBasedRiskCheck(skillInput);
  const note = runResearchNoteWriter(skillInput, fundamental, growth, risk);

  return {
    ticker: data.ticker,
    company_name: data.company_name,
    period: data.period,
    data_quality_gate: gate,
    ui_ready: {
      data_coverage: gate.available_data,
      data_confidence: gate.data_confidence,
      missing_fields: gate.missing_data,
      allowed_claims: gate.allowed_claims,
      forbidden_claims: gate.forbidden_claims,
      evidence_used: gate.evidence_used,
      limitations: gate.limitations,
      disclaimer: NOT_INVESTMENT_RECOMMENDATION,
    },
    skill_results: {
      fundamental_quality_check: fundamental,
      growth_capacity_check: growth,
      evidence_based_risk_check: risk,
      research_note_writer: note,
    },
  };
}
