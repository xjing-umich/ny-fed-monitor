import type { EpvLamp, MoatReading, PerShareUnavailable, ReproductionValue, ValuationFloor, ValuationFloorInput, ValuationFloorYear } from "./types";
import { maintenanceCapex } from "./maintenanceCapex";
import { buildReproductionValue } from "./reproductionValue";
import { computeGrowthValue } from "./growthValue";
import { computeNetNet } from "./netNet";
import { deriveMoatCap, roicStability, durabilityDeclined, ROIC_HURDLE, roicTrend, sustainableGrowth } from "./moatCap";

// audit #3: 股权成本带从 8/10% 提到 9/11%。原 8% 隐含的股权风险溢价(对 ~4.5% 国债仅 ~3.5%)
// 远低于历史 ~4.5–5.5%,系统性高估；提到 9–11% 让 EPV 与提 premium 后的 OE-DCF 一致、更保守。
export const DISCOUNT_RATE_LOW = 0.09;
export const DISCOUNT_RATE_HIGH = 0.11;
export const MAX_TAX_RATE = 0.21; // statutory cap
export const MIN_YEARS = 3;
export const TARGET_YEARS = 5;
export const LEVERAGE_WARN_RATIO = 1.0;
export const MOAT_FRANCHISE_MULTIPLE = 1.25;
export const MOAT_COMMODITY_FLOOR = 0.75;

const MAINT_CAPEX_RULE =
  "Maintenance capex estimated by the four-method median (D&A proxy / Greenwald sales method / PP&E useful life), with the AI-hog 50%-of-capex floor; degrades to D&A when inputs are missing.";

const MULTI_CLASS_REASON =
  "This issuer has a multi-share-class structure; a blended per-share count is not available from the current data source, so a per-share floor is not computed here.";

const SINGLE_LAMP_BASIS_NOTE =
  "Operating income is not reported separately (e.g. banks, insurers, and some diversified issuers), so earnings power is shown via the owner-earnings lens only; the unlevered NOPAT lens does not apply.";

function avg(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * 周期保守正常化(audit #2):盈利下滑(最新年 < 多年均值)时，把"正常化盈利"压到**当前运行率**，
 * 不把已过去的繁荣峰值资本化进价值带 —— Greenwald 对周期股的纪律。稳定/增长股(最新 ≥ 均值)
 * 仍用均值，行为不变(无回归)。这是 SEC 只存 ~6 年、拉不到完整周期时的下行保护。
 */
function conservativeNormalized(series: number[], latest: number | undefined): { value: number; capped: boolean } {
  const a = avg(series);
  if (latest != null && Number.isFinite(latest) && latest < a) return { value: latest, capped: true };
  return { value: a, capped: false };
}

function marginOf(y: ValuationFloorYear): number | undefined {
  if (y.operating_margin != null) return y.operating_margin;
  if (y.operating_income != null && y.revenue) return y.operating_income / y.revenue;
  return undefined;
}

function selectYears(years: ValuationFloorYear[]): ValuationFloorYear[] {
  return years
    .filter((y) => y.revenue != null && marginOf(y) != null && y.net_income != null)
    .sort((a, b) => b.fiscal_year - a.fiscal_year)
    .slice(0, TARGET_YEARS);
}

/** Years carrying a net-income signal (the minimum needed for the owner-earnings lens). */
function selectEarningsYears(years: ValuationFloorYear[]): ValuationFloorYear[] {
  return years
    .filter((y) => y.net_income != null)
    .sort((a, b) => b.fiscal_year - a.fiscal_year)
    .slice(0, TARGET_YEARS);
}

/** Multi-year average effective tax rate, clamped to [0, statutory 21%]; flat 21% fallback when no rate data. */
export function normalizedTaxRate(years: ValuationFloorYear[]): { rate: number; basis: string } {
  const rates: number[] = [];
  for (const y of years) {
    let r = y.effective_tax_rate;
    if (r == null && y.income_tax_expense != null && y.pretax_income) r = y.income_tax_expense / y.pretax_income;
    if (r != null && Number.isFinite(r)) rates.push(r);
  }
  if (rates.length === 0) {
    return { rate: MAX_TAX_RATE, basis: "No effective-rate data available; fell back to the statutory 21%." };
  }
  const clamped = Math.min(MAX_TAX_RATE, Math.max(0, avg(rates)));
  return { rate: clamped, basis: `Average effective tax rate over ${rates.length} year(s), capped at the statutory 21%.` };
}

export function computeValuationFloor(input: ValuationFloorInput): ValuationFloor | PerShareUnavailable | undefined {
  const earningsYears = selectEarningsYears(input.years);
  if (earningsYears.length < MIN_YEARS) return undefined;

  // Prefer the diluted count from a real earnings year (so a latest stub/transition
  // period that carries a share count but no earnings can't supply the per-share
  // divisor for window-averaged earnings); fall back to any year with a usable count.
  const shares =
    earningsYears.map((y) => y.shares_diluted).find((s) => s != null && s > 0) ??
    input.years.map((y) => y.shares_diluted).find((s) => s != null && s > 0);
  if (shares == null) return { kind: "per_share_unavailable", reason: MULTI_CLASS_REASON };

  // Full path uses the margin-qualified year subset for BOTH lamps so years_used is consistent.
  const marginYears = selectYears(input.years);
  if (marginYears.length >= MIN_YEARS) return buildFullFloor(marginYears, shares);
  return buildSingleLampFloor(earningsYears, shares);
}

function buildFullFloor(years: ValuationFloorYear[], shares: number): ValuationFloor {
  const latest = years[0];
  const cash = latest.cash ?? 0;
  const totalDebt = latest.total_debt ?? 0;
  const yearsUsed = years.map((y) => y.fiscal_year);
  const tax = normalizedTaxRate(years);
  const grahamEpv = buildGrahamLamp(years, cash, totalDebt, shares, yearsUsed, tax.rate);
  const buffettEpv = buildBuffettLamp(years, shares, yearsUsed);
  return assembleFloor(years, shares, grahamEpv, buffettEpv, grahamEpv, undefined);
}

function buildSingleLampFloor(years: ValuationFloorYear[], shares: number): ValuationFloor {
  const yearsUsed = years.map((y) => y.fiscal_year);
  const grahamEpv = grahamNotApplicableLamp(yearsUsed);
  const buffettEpv = buildBuffettLamp(years, shares, yearsUsed);
  return assembleFloor(years, shares, grahamEpv, buffettEpv, buffettEpv, SINGLE_LAMP_BASIS_NOTE);
}

// Shared scaffold: asset floor, moat (off the supplied reference lamp), leverage
// flagging, and provenance — assembled identically for both the full two-lamp and
// the single-lamp paths so the leverage threshold/prose and provenance keys live once.
function assembleFloor(
  years: ValuationFloorYear[],
  shares: number,
  grahamEpv: EpvLamp,
  buffettEpv: EpvLamp,
  moatRefLamp: EpvLamp,
  earningsBasisNote: string | undefined,
): ValuationFloor {
  const latest = years[0];
  const cash = latest.cash ?? 0;
  const totalDebt = latest.total_debt ?? 0;
  const equity = latest.shareholders_equity;
  const netDebt = latest.net_debt ?? totalDebt - cash;
  const yearsUsed = years.map((y) => y.fiscal_year);
  const tax = normalizedTaxRate(years);
  const assetFloor = buildReproductionValue(years, shares);
  const moatReading = buildMoatReading(moatRefLamp, assetFloor, shares);
  // Shared maint read for floor-level AI-hog flag + GV gate (lamps still compute their own for OE arithmetic).
  const mc = maintenanceCapex(years);
  const aiCapexDistortion = mc.ai_capex_distortion_warning;
  const epvMid = moatRefLamp.assessable && moatRefLamp.per_share_low != null && moatRefLamp.per_share_high != null
    ? (moatRefLamp.per_share_low + moatRefLamp.per_share_high) / 2
    : undefined;
  const netDebtToEquity = equity != null && equity > 0 ? netDebt / equity : undefined;
  const highLeverage = netDebtToEquity != null && netDebtToEquity > LEVERAGE_WARN_RATIO;

  // ── Moat → competitive-advantage-period (CAP，Phase 2 耐久性闸) — SINGLE SOURCE OF TRUTH ──
  // Computed once here; growth_value (via moatGrade) and the owner-earnings DCF (reads
  // floor.moat_cap directly) both consume this same reading, so the two legs can no longer
  // diverge on grade (BUG2). NOPAT/investedCapital share the ROIC_HURDLE=10% hurdle (BUG1
  // fix: investedCapitalOf returns undefined for negative/zero equity — a basis-invalid year,
  // not a false-positive-stable one).
  const roicTax = tax.rate;
  const nopatOf = (y: ValuationFloorYear): number | undefined =>
    y.operating_income != null ? y.operating_income * (1 - roicTax) : undefined;
  const investedCapitalOf = (y: ValuationFloorYear): number | undefined => {
    if (!(y.shareholders_equity != null && y.shareholders_equity > 0)) return undefined; // BUG1: 负/零权益→口径无效,跳过
    const nd = y.net_debt ?? ((y.total_debt ?? 0) - (y.cash ?? 0));
    return nd + y.shareholders_equity;
  };
  const roicStable = roicStability({ fyYears: years, investedCapitalOf, nopatOf, discountRate: ROIC_HURDLE });
  const roicDeclining = roicTrend({ fyYears: years, investedCapitalOf, nopatOf }) === "declining";
  const sustainableGrowthRate = sustainableGrowth({ fyYears: years, nopatOf, investedCapitalOf });
  const epvAvRatio =
    moatReading.epv_per_share_compared != null &&
    moatReading.asset_per_share_compared != null &&
    moatReading.asset_per_share_compared > 0
      ? moatReading.epv_per_share_compared / moatReading.asset_per_share_compared
      : undefined;
  const moatCap = deriveMoatCap({
    moat: moatReading,
    epvAvRatio,
    declined: durabilityDeclined(years),
    suppressedFlags: highLeverage === true || (aiCapexDistortion === true && roicDeclining),
    roicStable,
  });

  const growthValue = computeGrowthValue({
    years,
    shares,
    taxRate: tax.rate,
    moatSignal: moatReading.signal,
    epvPerShare: epvMid,
    avPerShare: assetFloor.per_share,
    aiCapexDistortion,
    moatGrade: moatCap.grade,
  });
  return {
    kind: "floor",
    graham_epv: grahamEpv,
    buffett_epv: buffettEpv,
    asset_floor: assetFloor,
    net_net: computeNetNet({
      currentAssets: latest.current_assets,
      totalLiabilities: latest.total_liabilities,
      sharesDiluted: shares,
      preferredStock: latest.preferred_equity,
    }),
    moat_reading: moatReading,
    growth_value: growthValue,
    high_leverage_warning: highLeverage,
    high_leverage_note: highLeverage
      ? "High leverage (net debt / shareholders' equity above 1.0): the single 9–11% rate band is a low-leverage / net-cash approximation and is directionally distorted here. The ranges are shown but should be read as degraded."
      : undefined,
    net_debt_to_equity: netDebtToEquity,
    ai_capex_distortion_warning: aiCapexDistortion || undefined,
    moat_cap: moatCap,
    sustainable_growth: sustainableGrowthRate,
    provenance: {
      years_used: yearsUsed,
      as_of_fiscal_year: latest.fiscal_year,
      discount_rate_band: [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH],
      normalized_tax_rate: tax.rate,
      normalized_tax_rate_basis: tax.basis,
      maintenance_capex_rule: MAINT_CAPEX_RULE,
      share_count_basis: "diluted",
      earnings_basis_note: earningsBasisNote,
    },
  };
}

function buildGrahamLamp(
  years: ValuationFloorYear[],
  cash: number,
  totalDebt: number,
  shares: number,
  yearsUsed: number[],
  taxRate: number,
): EpvLamp {
  const mc = maintenanceCapex(years);
  const latestDa = years[0].d_and_a;
  // write A: deduct (maintCapex − D&A) in full cash from after-tax NOPAT. When maintCapex == D&A
  // (or either is missing → degrade), this collapses to NOPAT/WACC (v1 parity).
  const canCorrect = mc.assessable && mc.value != null && latestDa != null;
  const capexDrag = canCorrect ? mc.value! - latestDa! : 0;
  const simplifications: string[] = [];
  if (canCorrect) {
    simplifications.push(
      `Maintenance capex (${mc.confidence}) deducted in full cash (write A): EPV = (NOPAT + D&A − maintenance capex) / WACC; no tax shield on the capex term.`,
    );
    // AI-hog / divergence / method notes come from maintenanceCapex (scheme C: floored then D&A-capped; OE/EPV may look optimistic).
    for (const n of mc.notes) simplifications.push(n);
  } else {
    simplifications.push("Maintenance capex unavailable → degraded to the v1 simplification (maintenance capex = D&A, so the depreciation add-back nets to zero).");
  }
  simplifications.push("Share-based compensation is left as a real expense (not added back).");

  const method = {
    earnings_basis: "Normalized NOPAT = average operating margin over the years shown × latest-year revenue × (1 − normalized tax); then + D&A − maintenance capex (write A).",
    leverage_treatment: "Unlevered (pre-interest, attributable to all capital).",
    denominator: "Capitalized at the 9–11% rate band (read as a WACC proxy).",
    bridge: "Enterprise → equity bridge applied: + cash − total debt.",
    discount_rate_low: DISCOUNT_RATE_LOW,
    discount_rate_high: DISCOUNT_RATE_HIGH,
    years_used: yearsUsed,
    simplifications,
  };
  const latestRevenue = years[0].revenue!;
  const margins = years.map((y) => marginOf(y)!);
  // 周期保守:margin 下滑时压到当前 margin,不用繁荣期均值(audit #2)。
  const normMargin = conservativeNormalized(margins, margins[0]);
  if (normMargin.capped) simplifications.push("Operating margin is below its multi-year average (cyclical/declining): normalized margin capped at the latest year — no peak-margin capitalization (audit #2).");
  const nopat = normMargin.value * latestRevenue * (1 - taxRate);
  const ownerStream = nopat - capexDrag; // = NOPAT + D&A − maintCapex when canCorrect, else NOPAT
  if (ownerStream <= 0) {
    return {
      label: "Graham earnings-power value (normalized NOPAT)",
      assessable: false,
      not_assessable_reason: "Normalized operating earnings net of maintenance capex are non-positive over the years shown; earnings power cannot be capitalized.",
      normalized_earnings: ownerStream,
      method,
    };
  }
  const equityLow = ownerStream / DISCOUNT_RATE_HIGH + cash - totalDebt;
  const equityHigh = ownerStream / DISCOUNT_RATE_LOW + cash - totalDebt;
  return {
    label: "Graham earnings-power value (normalized NOPAT)",
    assessable: true,
    normalized_earnings: ownerStream,
    equity_value_low: equityLow,
    equity_value_high: equityHigh,
    per_share_low: equityLow / shares,
    per_share_high: equityHigh / shares,
    method,
  };
}

/** Single-lamp mode: operating income absent, so the unlevered NOPAT lens cannot be applied. */
function grahamNotApplicableLamp(yearsUsed: number[]): EpvLamp {
  return {
    label: "Graham earnings-power value (normalized NOPAT)",
    assessable: false,
    not_assessable_reason: SINGLE_LAMP_BASIS_NOTE,
    method: {
      earnings_basis: "Normalized NOPAT from operating margin — not applicable when operating income is not reported separately.",
      leverage_treatment: "Unlevered (pre-interest, attributable to all capital).",
      denominator: "Capitalized at the 9–11% rate band (read as a WACC proxy).",
      bridge: "Enterprise → equity bridge (+ cash − total debt) — not applied (lens not assessable).",
      discount_rate_low: DISCOUNT_RATE_LOW,
      discount_rate_high: DISCOUNT_RATE_HIGH,
      years_used: yearsUsed,
      simplifications: [],
    },
  };
}

function buildBuffettLamp(years: ValuationFloorYear[], shares: number, yearsUsed: number[]): EpvLamp {
  const mc = maintenanceCapex(years);
  const niSeries = years.map((y) => y.net_income!);
  // 周期保守:净利下滑时压到当前运行率,不资本化繁荣峰值均值(audit #2)。
  const normNi = conservativeNormalized(niSeries, niSeries[0]);
  const daVals = years.map((y) => y.d_and_a).filter((v): v is number => v != null);
  const avgDa = daVals.length ? avg(daVals) : undefined;
  // Real owner earnings = net income + D&A − maintenance capex, WITHOUT ΔNWC (maintenance ΔNWC ≈ 0;
  // the growth portion of ΔNWC lives in GV — audit fix #3). Degrade to avg net income when inputs missing.
  const canCorrect = mc.assessable && mc.value != null && avgDa != null;
  const ownerEarnings = canCorrect ? normNi.value + avgDa! - mc.value! : normNi.value;

  const simplifications: string[] = [];
  if (normNi.capped) simplifications.push("Net income is below its multi-year average (cyclical/declining): normalized owner earnings anchored to the latest year — no peak-earnings capitalization (audit #2).");
  if (canCorrect) {
    simplifications.push(`Owner earnings = net income + D&A − maintenance capex (${mc.confidence}); the working-capital change is excluded (maintenance ΔNWC ≈ 0; growth ΔNWC is carried in growth value, not double-counted).`);
    // AI-hog / divergence / method notes from maintenanceCapex (scheme C: floored then D&A-capped; OE may look optimistic).
    for (const n of mc.notes) simplifications.push(n);
  } else {
    simplifications.push("Maintenance capex or D&A unavailable → degraded to normalized net income (= average net income over the years shown).");
  }
  simplifications.push("One-time items are not separately normalized (multi-year averaging smooths them partially).");
  simplifications.push("Share-based compensation is left as a real expense (not added back); see the SBC/OE disclosure.");
  simplifications.push("Capitalized at the same 9–11% band as a cost-of-equity proxy (theoretically the cost of equity is higher; v2 simplification, v3 to refine).");

  const method = {
    earnings_basis: "Owner earnings = average net income + average D&A − maintenance capex (zero-growth floor; no ΔNWC).",
    leverage_treatment: "Levered (starts from net income, already after interest — an equity-holder stream).",
    denominator: "Capitalized at the 9–11% rate band (read as a cost-of-equity proxy).",
    bridge: "No enterprise→equity bridge: the capitalized result is already equity value (subtracting debt would double-count interest).",
    discount_rate_low: DISCOUNT_RATE_LOW,
    discount_rate_high: DISCOUNT_RATE_HIGH,
    years_used: yearsUsed,
    simplifications,
  };

  // SBC disclosure (not added back): average SBC / owner earnings.
  const sbcVals = years.map((y) => y.stock_based_comp).filter((v): v is number => v != null);
  const sbcToOe = sbcVals.length && ownerEarnings > 0 ? avg(sbcVals) / ownerEarnings : undefined;

  // 回购是否仅抵消 SBC 稀释(Mauboussin:回购≠净回馈)。share_repurchases 存负现金流出,取绝对值对齐 SBC 正费用。
  const repurchVals = years.map((y) => y.share_repurchases).filter((v): v is number => v != null).map(Math.abs);
  const buybackOffsetsSbc =
    repurchVals.length && sbcVals.length ? avg(repurchVals) <= avg(sbcVals) : undefined;

  if (ownerEarnings <= 0) {
    return {
      label: "Buffett owner-earnings value",
      assessable: false,
      not_assessable_reason: "Normalized owner earnings are non-positive over the years shown; earnings power cannot be capitalized.",
      normalized_earnings: ownerEarnings,
      sbc_to_oe_pct: sbcToOe,
      buyback_offsets_sbc: buybackOffsetsSbc,
      method,
    };
  }
  const equityLow = ownerEarnings / DISCOUNT_RATE_HIGH;
  const equityHigh = ownerEarnings / DISCOUNT_RATE_LOW;
  return {
    label: "Buffett owner-earnings value",
    assessable: true,
    normalized_earnings: ownerEarnings,
    equity_value_low: equityLow,
    equity_value_high: equityHigh,
    per_share_low: equityLow / shares,
    per_share_high: equityHigh / shares,
    sbc_to_oe_pct: sbcToOe,
    buyback_offsets_sbc: buybackOffsetsSbc,
    method,
  };
}

function buildMoatReading(epvLamp: EpvLamp, reproduction: ReproductionValue, shares: number): MoatReading {
  const dualComparable =
    reproduction.dual_av_comparable === true &&
    reproduction.reproduction_per_share != null &&
    Number.isFinite(reproduction.reproduction_per_share);

  const basisNote = dualComparable
    ? "Franchise test compares earnings power (EPV) against reproduction value on both AV_conservative (tangible + capitalized R&D) and AV_reproduction (conservative + acquired-reset proxy). Both must clear the franchise multiple for a moat signal; near it, a commodity; below it, value destruction. A directional reading, not a verdict."
    : reproduction.intangibles_separated
      ? "Franchise test compares earnings power (EPV) against reproduction value (tangible net assets + capitalized R&D). EPV well above reproduction value signals a moat; near it, a commodity; below it, value destruction. A directional reading, not a verdict."
      : "Franchise test compares earnings power (EPV) against reproduction value (tangible net assets + capitalized R&D). EPV well above reproduction value signals a moat; near it, a commodity; below it, value destruction. Dual reproduction test unavailable (intangibles not separated). A directional reading, not a verdict.";

  if (!epvLamp.assessable) {
    return { signal: "value_destruction", label: "Normalized earnings are non-positive, so earnings power sits below the reproduction-value base — a value-destruction signal (not a verdict).", basis_note: basisNote };
  }
  if (!reproduction.assessable || reproduction.per_share == null) {
    return { signal: "not_assessable", label: "The earnings-power vs reproduction-value comparison is unavailable because there is no positive asset base.", basis_note: basisNote };
  }

  const epvMid = (epvLamp.per_share_low! + epvLamp.per_share_high!) / 2;
  const avCons = reproduction.per_share;
  const ratioCons = epvMid / avCons;

  // Dual-AV franchise gate: both EPV/AV_cons and EPV/AV_repr must clear the franchise multiple.
  if (dualComparable) {
    const avRepr = reproduction.reproduction_per_share!;
    const ratioRepr = epvMid / avRepr;
    const dualFields = {
      epv_per_share_compared: epvMid,
      asset_per_share_compared: avCons,
      av_conservative_per_share: avCons,
      av_reproduction_per_share: avRepr,
    };
    if (ratioCons >= MOAT_FRANCHISE_MULTIPLE && ratioRepr >= MOAT_FRANCHISE_MULTIPLE) {
      return {
        signal: "franchise",
        label: "Earnings power sits well above both conservative and reproduction asset values — a franchise (moat) signal, not a verdict.",
        basis_note: basisNote,
        ...dualFields,
        dual_test_passed: true,
        franchise_value: (epvMid - avCons) * shares,
      };
    }
    if (ratioCons >= MOAT_FRANCHISE_MULTIPLE && ratioRepr < MOAT_FRANCHISE_MULTIPLE) {
      return {
        signal: "commodity",
        label: "Earnings power clears the conservative asset floor but not the reproduction (acquired-reset) floor — treated as commodity-like, not a franchise.",
        basis_note: basisNote,
        ...dualFields,
        dual_test_passed: false,
        franchise_blocked_by_reproduction: true,
      };
    }
    // Conservative path for commodity / value_destruction floors (unchanged thresholds).
    if (ratioCons >= MOAT_COMMODITY_FLOOR) {
      return {
        signal: "commodity",
        label: "Earnings power sits near reproduction value — a commodity-like profile with no clear moat signal.",
        basis_note: basisNote,
        ...dualFields,
        dual_test_passed: false,
      };
    }
    return {
      signal: "value_destruction",
      label: "Earnings power sits below reproduction value — a value-destruction signal, not a verdict.",
      basis_note: basisNote,
      ...dualFields,
      dual_test_passed: false,
    };
  }

  // Single-AV fallback when intangibles are not separated (dual reproduction test unavailable).
  if (ratioCons >= MOAT_FRANCHISE_MULTIPLE) {
    return {
      signal: "franchise",
      label: "Earnings power sits well above reproduction value — a franchise (moat) signal, not a verdict.",
      basis_note: basisNote,
      epv_per_share_compared: epvMid,
      asset_per_share_compared: avCons,
      franchise_value: (epvMid - avCons) * shares,
    };
  }
  if (ratioCons >= MOAT_COMMODITY_FLOOR) {
    return { signal: "commodity", label: "Earnings power sits near reproduction value — a commodity-like profile with no clear moat signal.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: avCons };
  }
  return { signal: "value_destruction", label: "Earnings power sits below reproduction value — a value-destruction signal, not a verdict.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: avCons };
}
