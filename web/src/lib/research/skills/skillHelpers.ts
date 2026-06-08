import type { CoverageStatus, DataCoverageBlock, SkillInput } from "../schemas/researchSchemas";
import { NOT_INVESTMENT_RECOMMENDATION } from "../schemas/researchSchemas";

export function coverageBlock(input: SkillInput, status: CoverageStatus): DataCoverageBlock {
  return {
    status,
    data_confidence: input.data_quality_gate.data_confidence,
    missing_fields: input.data_quality_gate.missing_data,
    allowed_claims: input.data_quality_gate.allowed_claims,
    forbidden_claims: input.data_quality_gate.forbidden_claims,
    evidence_used: input.data_quality_gate.evidence_used,
    limitations: input.data_quality_gate.limitations,
  };
}

export function formatPct(value: number | undefined): string | null {
  if (value == null) return null;
  return `${(value * 100).toFixed(1)}%`;
}

export function unavailable(reason: string): string {
  return `Cannot assess: ${reason}`;
}

export function disclaimer(): string {
  return NOT_INVESTMENT_RECOMMENDATION;
}

export function hasAny(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  return Object.values(data).some((value) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
}
