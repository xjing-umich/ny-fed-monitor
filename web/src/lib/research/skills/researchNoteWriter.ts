import type {
  EvidenceBasedRiskCheckResult,
  FundamentalQualityCheckResult,
  GrowthCapacityCheckResult,
  ResearchNoteWriterResult,
  SkillInput,
} from "../schemas/researchSchemas";
import { disclaimer } from "./skillHelpers";

export function runResearchNoteWriter(
  input: SkillInput,
  fundamental: FundamentalQualityCheckResult,
  growth: GrowthCapacityCheckResult,
  risk: EvidenceBasedRiskCheckResult,
): ResearchNoteWriterResult {
  return {
    research_snapshot: `${input.company_name ?? input.ticker} ${input.period ?? ""}`.trim(),
    key_evidence: input.data_quality_gate.evidence_used,
    fundamental_summary: fundamental.supported_conclusions[0] ?? fundamental.business_quality,
    growth_summary: growth.supported_conclusions[0] ?? growth.growth_quality_assessment,
    risk_summary: risk.overall_risk_summary,
    limitations: input.data_quality_gate.limitations,
    next_data_needed: [...new Set([...fundamental.next_data_needed, ...growth.next_data_needed, ...risk.next_data_needed])],
    disclaimer: disclaimer(),
  };
}
