import { ROIC_SANITY, SUSTAINABLE_MIN_YEARS } from "./moatCap";
import type { ValuationFloorYear } from "./types";

export type ReinvestmentEvidenceStatus =
  | "available" | "missing_fields" | "insufficient_history"
  | "nonpositive_nopat" | "nonpositive_capital" | "implausible_roic"
  | "unaligned_periods";
export type ReinvestmentMissingField = "nopat" | "invested_capital" | "capex" | "d_and_a" | "operating_working_capital";
export type ReinvestmentEvidence = {
  status: ReinvestmentEvidenceStatus;
  /** Fiscal years contributing changes, rather than the opening balance year. */
  years: number[];
  growth?: number;
  missing_fields?: { fiscal_year: number; period_end?: string; fields: ReinvestmentMissingField[] }[];
  affected_years?: number[];
  unaligned_periods?: {
    previous_fiscal_year: number;
    current_fiscal_year: number;
    previous_period_end?: string;
    current_period_end?: string;
    days?: number;
  }[];
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Pure audit companion to sustainableGrowth: same full-window requirements and
 * arithmetic, with explicit failure causes. It does not change model eligibility.
 * Dated balances must span an annual interval; legacy undated rows use FY labels.
 */
export function assessReinvestmentEvidence(input: {
  fyYears: ValuationFloorYear[];
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
}): ReinvestmentEvidence {
  const sorted = [...input.fyYears].sort((a, b) => a.period_end && b.period_end ? a.period_end.localeCompare(b.period_end) : a.fiscal_year - b.fiscal_year);
  const years = sorted.slice(1).map(y => y.fiscal_year);
  const unaligned: NonNullable<ReinvestmentEvidence["unaligned_periods"]> = [];
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1], current = sorted[i];
    const dated = previous.period_end != null && current.period_end != null;
    const days = dated ? (Date.parse(current.period_end!) - Date.parse(previous.period_end!)) / 86_400_000 : undefined;
    if (dated ? !finite(days) || days < 350 || days > 380 : current.fiscal_year - previous.fiscal_year !== 1) {
      unaligned.push({ previous_fiscal_year: previous.fiscal_year, current_fiscal_year: current.fiscal_year,
        previous_period_end: previous.period_end, current_period_end: current.period_end,
        ...(finite(days) ? { days } : {}) });
    }
  }
  if (unaligned.length) return { status: "unaligned_periods", years, unaligned_periods: unaligned };

  const missing = new Map<ValuationFloorYear, Set<ReinvestmentMissingField>>();
  const check = (row: ValuationFloorYear, field: ReinvestmentMissingField, value: unknown) => {
    if (finite(value)) return;
    if (!missing.has(row)) missing.set(row, new Set());
    missing.get(row)!.add(field);
  };
  const pairs = sorted.slice(1).map((y, index) => {
    const previous = sorted[index];
    const nopat = input.nopatOf(y), calculatedCapital = input.investedCapitalOf(y);
    // roicHelpers rejects nonpositive equity before computing invested capital.
    // Preserve that economic rejection instead of reporting an absent source field.
    const capital = calculatedCapital == null && finite(y.shareholders_equity) && y.shareholders_equity <= 0
      ? y.shareholders_equity : calculatedCapital;
    check(y, "nopat", nopat);
    check(y, "invested_capital", capital);
    check(y, "capex", y.capex);
    check(y, "d_and_a", y.d_and_a);
    check(y, "operating_working_capital", y.operating_working_capital);
    check(previous, "operating_working_capital", previous.operating_working_capital);
    return { y, previous, nopat, capital };
  });
  if (missing.size) return { status: "missing_fields", years,
    missing_fields: [...missing].sort(([a], [b]) => a.fiscal_year - b.fiscal_year).map(([y, fields]) => ({
      fiscal_year: y.fiscal_year, ...(y.period_end ? { period_end: y.period_end } : {}), fields: [...fields],
    })) };
  const economicFailures: [ReinvestmentEvidenceStatus, typeof pairs][] = [
    ["nonpositive_nopat", pairs.filter(p => !(p.nopat! > 0))],
    ["nonpositive_capital", pairs.filter(p => !(p.capital! > 0))],
    ["implausible_roic", pairs.filter(p => Math.abs(p.nopat! / p.capital!) > ROIC_SANITY)],
  ];
  for (const [status, failures] of economicFailures) {
    if (failures.length) return { status, years, affected_years: failures.map(p => p.y.fiscal_year) };
  }
  if (pairs.length < SUSTAINABLE_MIN_YEARS) return { status: "insufficient_history", years };
  const meanRoic = pairs.reduce((sum, p) => sum + p.nopat! / p.capital!, 0) / pairs.length;
  const meanReinvestment = pairs.reduce((sum, p) => sum + Math.max(0,
    (p.y.capex! - p.y.d_and_a! + p.y.operating_working_capital! - p.previous.operating_working_capital!) / p.nopat!), 0) / pairs.length;
  const growth = meanRoic * meanReinvestment;
  // Overflow is invalid computed evidence, never a positive growth estimate.
  if (!finite(growth)) return { status: "implausible_roic", years, affected_years: years };
  return { status: "available", years, growth: Math.max(0, growth) };
}
