import type { ReproductionValue, ValuationFloorYear } from "./types";

/** Greenwald default R&D capitalization life (straight-line). */
export const RD_CAPITALIZATION_YEARS = 5;

/** Acquired-intangibles reset proxy: (goodwill + intangibles) × this discount → AV_reproduction add-on. */
export const ACQUIRED_RESET_DISCOUNT = 0.5;

/**
 * Reproduction value (spec §1.4): AV_conservative = tangible net assets + capitalized R&D.
 * Tangible net assets = shareholders' equity − goodwill − acquired intangibles.
 * Capitalized R&D = Σ rd_expense(t) × (N − age)/N over the last N years (age 0..N−1).
 * When intangibles are separated, also emit AV_reproduction = AV_conservative + acquired_reset_proxy
 * for the franchise dual-pass gate. `years` most-recent-first.
 * Degrades to tangible book (no R&D) or total book (no intangible split).
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

  // Total-book fallback when intangibles are not separable (v1 behavior) — dual AV unavailable.
  if (!hasIntangibleData) {
    const basis = capitalizedRd != null
      ? "Total book value (equity ÷ diluted shares) + capitalized R&D; intangibles not separated — goodwill/intangibles unavailable this period."
      : "Total book value (shareholders' equity ÷ diluted shares); intangibles not separated — goodwill/intangibles unavailable this period.";
    if (equity <= 0) {
      return { assessable: false, not_assessable_reason: "Book value is negative or unavailable, so no asset floor is shown.", basis, intangibles_separated: false, dual_av_comparable: false };
    }
    const total = equity + (capitalizedRd ?? 0);
    return {
      assessable: true, basis, intangibles_separated: false, dual_av_comparable: false,
      tangible_net_assets: equity, capitalized_rd: capitalizedRd,
      total_value: total, per_share: total / shares, rd_years_used: capitalizedRd != null ? rdYearsUsed : undefined,
    };
  }

  const goodwill = latest.goodwill ?? 0;
  const intangibles = latest.intangibles ?? 0;
  const tangible = equity - goodwill - intangibles;
  const acquiredResetProxy = (goodwill + intangibles) * ACQUIRED_RESET_DISCOUNT;
  const rd = capitalizedRd ?? 0;

  if (tangible > 0) {
    // 有形为正(MSFT/AAPL 类):保持今天的 dual-AV 结构 byte-for-byte,零漂移(spec §6.4 对照回归守护)。
    const basis = capitalizedRd != null
      ? "Reproduction value = tangible net assets (equity − goodwill − intangibles) + capitalized R&D (5y straight-line), ÷ diluted shares."
      : "Tangible net assets = shareholders' equity − goodwill − intangibles, ÷ diluted shares (no R&D history to capitalize).";
    const total = tangible + rd;
    const reproductionTotal = total + acquiredResetProxy;
    return {
      assessable: true, basis, intangibles_separated: true, dual_av_comparable: true,
      tangible_net_assets: tangible, capitalized_rd: capitalizedRd,
      total_value: total, per_share: total / shares, rd_years_used: capitalizedRd != null ? rdYearsUsed : undefined,
      acquired_reset_proxy: acquiredResetProxy,
      reproduction_total_value: reproductionTotal,
      reproduction_per_share: reproductionTotal / shares,
    };
  }

  // 有形为负但净重置为正(NFLX/MA/SPGI/ADBE 类轻资产 franchise):以 avCore 为**单一**重置底。
  // Greenwald 原意:重建其收购来的品牌/网络/牌照仍有成本 → 剔除无形代理的"avCons"对这类公司恒为负、
  // 是伪保守。改单-AV 对 avCore 比较(dual 关闭),护城河测试才不被负分母击穿。
  const avCore = tangible + rd + acquiredResetProxy;
  const basis = capitalizedRd != null
    ? "Reproduction value = intangible-inclusive net reproduction (tangible net assets + acquired-intangible reset proxy + capitalized R&D), ÷ diluted shares; tangible net assets alone are negative for this asset-light franchise."
    : "Reproduction value = tangible net assets + acquired-intangible reset proxy, ÷ diluted shares; tangible net assets alone are negative for this asset-light franchise (no R&D history to capitalize).";
  if (avCore <= 0) {
    return { assessable: false, not_assessable_reason: "Intangible-inclusive net reproduction value is negative, so no asset floor is shown.", basis, intangibles_separated: true, dual_av_comparable: false };
  }
  return {
    assessable: true, basis, intangibles_separated: true, dual_av_comparable: false,
    tangible_net_assets: tangible, capitalized_rd: capitalizedRd,
    total_value: avCore, per_share: avCore / shares, rd_years_used: capitalizedRd != null ? rdYearsUsed : undefined,
    acquired_reset_proxy: acquiredResetProxy,
  };
}
