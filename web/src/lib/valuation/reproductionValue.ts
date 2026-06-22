import type { ReproductionValue, ValuationFloorYear } from "./types";

/** Greenwald default R&D capitalization life (straight-line). */
export const RD_CAPITALIZATION_YEARS = 5;

/**
 * Reproduction value (spec §1.4): AV = tangible net assets + capitalized R&D.
 * Tangible net assets = shareholders' equity − goodwill − acquired intangibles.
 * Capitalized R&D = Σ rd_expense(t) × (N − age)/N over the last N years (age 0..N−1).
 * `years` most-recent-first. Degrades to tangible book (no R&D) or total book (no intangible split).
 */
export function buildReproductionValue(years: ValuationFloorYear[], shares: number): ReproductionValue {
  const sorted = [...years].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const latest = sorted[0];
  const equity = latest?.shareholders_equity;

  if (equity == null) {
    return {
      assessable: false,
      not_assessable_reason: "Shareholders' equity is unavailable, so no asset floor is shown.",
      basis: "Unavailable.", intangibles_separated: false,
    };
  }

  // Capitalized R&D over the last N years (straight-line amortization weights).
  const N = RD_CAPITALIZATION_YEARS;
  const currentYear = latest.fiscal_year;
  let capitalizedRd: number | undefined;
  const rdYearsUsed: number[] = [];
  let rdSum = 0;
  for (const y of sorted) {
    const age = currentYear - y.fiscal_year;
    if (age < 0 || age >= N) continue;
    if (y.rd_expense == null) continue;
    const weight = (N - age) / N;
    rdSum += y.rd_expense * weight;
    rdYearsUsed.push(y.fiscal_year);
  }
  if (rdYearsUsed.length > 0) capitalizedRd = rdSum;

  const hasIntangibleData = latest.goodwill != null || latest.intangibles != null;

  // Total-book fallback when intangibles are not separable (v1 behavior).
  if (!hasIntangibleData) {
    const basis = capitalizedRd != null
      ? "Total book value (equity ÷ diluted shares) + capitalized R&D; intangibles not separated — goodwill/intangibles unavailable this period."
      : "Total book value (shareholders' equity ÷ diluted shares); intangibles not separated — goodwill/intangibles unavailable this period.";
    if (equity <= 0) {
      return { assessable: false, not_assessable_reason: "Book value is negative or unavailable, so no asset floor is shown.", basis, intangibles_separated: false };
    }
    const total = equity + (capitalizedRd ?? 0);
    return {
      assessable: true, basis, intangibles_separated: false,
      tangible_net_assets: equity, capitalized_rd: capitalizedRd,
      total_value: total, per_share: total / shares, rd_years_used: capitalizedRd != null ? rdYearsUsed : undefined,
    };
  }

  const tangible = equity - (latest.goodwill ?? 0) - (latest.intangibles ?? 0);
  const basis = capitalizedRd != null
    ? "Reproduction value = tangible net assets (equity − goodwill − intangibles) + capitalized R&D (5y straight-line), ÷ diluted shares."
    : "Tangible net assets = shareholders' equity − goodwill − intangibles, ÷ diluted shares (no R&D history to capitalize).";
  if (tangible <= 0) {
    return { assessable: false, not_assessable_reason: "Tangible net assets are negative, so no asset floor is shown.", basis, intangibles_separated: true };
  }
  const total = tangible + (capitalizedRd ?? 0);
  return {
    assessable: true, basis, intangibles_separated: true,
    tangible_net_assets: tangible, capitalized_rd: capitalizedRd,
    total_value: total, per_share: total / shares, rd_years_used: capitalizedRd != null ? rdYearsUsed : undefined,
  };
}
