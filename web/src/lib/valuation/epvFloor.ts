import type { AssetFloor, EpvLamp, MoatReading, PerShareUnavailable, ValuationFloor, ValuationFloorInput, ValuationFloorYear } from "./types";

export const DISCOUNT_RATE_LOW = 0.08;
export const DISCOUNT_RATE_HIGH = 0.1;
export const MAX_TAX_RATE = 0.21; // statutory cap
export const MIN_YEARS = 3;
export const TARGET_YEARS = 5;
export const LEVERAGE_WARN_RATIO = 1.0;
export const MOAT_FRANCHISE_MULTIPLE = 1.25;
export const MOAT_COMMODITY_FLOOR = 0.75;

const MAINT_CAPEX_RULE =
  "v1: maintenance capex set equal to D&A, so the depreciation add-back nets to zero (Buffett lamp = avg net income). Sales-driven maintenance-capex estimation deferred to v2.";

const MULTI_CLASS_REASON =
  "This issuer has a multi-share-class structure; a blended per-share count is not available from the current data source, so a per-share floor is not computed here.";

const SINGLE_LAMP_BASIS_NOTE =
  "Operating income is not reported separately (e.g. banks, insurers, and some diversified issuers), so earnings power is shown via the owner-earnings lens only; the unlevered NOPAT lens does not apply.";

function avg(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
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
function normalizedTaxRate(years: ValuationFloorYear[]): { rate: number; basis: string } {
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

  // Scan all input years (not just the margin-qualified subset) for any usable diluted count.
  const shares = input.years.map((y) => y.shares_diluted).find((s) => s != null && s > 0);
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
  const assetFloor = buildAssetFloor(latest, shares);
  const moatReading = buildMoatReading(moatRefLamp, assetFloor);
  const netDebtToEquity = equity != null && equity > 0 ? netDebt / equity : undefined;
  const highLeverage = netDebtToEquity != null && netDebtToEquity > LEVERAGE_WARN_RATIO;
  return {
    kind: "floor",
    graham_epv: grahamEpv,
    buffett_epv: buffettEpv,
    asset_floor: assetFloor,
    moat_reading: moatReading,
    high_leverage_warning: highLeverage,
    high_leverage_note: highLeverage
      ? "High leverage (net debt / shareholders' equity above 1.0): the single 8–10% rate band is a low-leverage / net-cash approximation and is directionally distorted here. The ranges are shown but should be read as degraded."
      : undefined,
    net_debt_to_equity: netDebtToEquity,
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
  const method = {
    earnings_basis: "Normalized NOPAT = average operating margin over the years shown × latest-year revenue × (1 − normalized tax).",
    leverage_treatment: "Unlevered (pre-interest, attributable to all capital).",
    denominator: "Capitalized at the 8–10% rate band (read as a WACC proxy).",
    bridge: "Enterprise → equity bridge applied: + cash − total debt.",
    discount_rate_low: DISCOUNT_RATE_LOW,
    discount_rate_high: DISCOUNT_RATE_HIGH,
    years_used: yearsUsed,
    simplifications: [
      "No depreciation add-back (maintenance capex = D&A by construction in v1).",
      "Share-based compensation is left as a real expense (not added back).",
    ],
  };
  const latestRevenue = years[0].revenue!;
  const avgMargin = avg(years.map((y) => marginOf(y)!));
  const nopat = avgMargin * latestRevenue * (1 - taxRate);
  if (nopat <= 0) {
    return {
      label: "Graham earnings-power value (normalized NOPAT)",
      assessable: false,
      not_assessable_reason: "Normalized operating earnings are non-positive over the years shown; earnings power cannot be capitalized.",
      normalized_earnings: nopat,
      method,
    };
  }
  const equityLow = nopat / DISCOUNT_RATE_HIGH + cash - totalDebt;
  const equityHigh = nopat / DISCOUNT_RATE_LOW + cash - totalDebt;
  return {
    label: "Graham earnings-power value (normalized NOPAT)",
    assessable: true,
    normalized_earnings: nopat,
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
      denominator: "Capitalized at the 8–10% rate band (read as a WACC proxy).",
      bridge: "Enterprise → equity bridge (+ cash − total debt) — not applied (lens not assessable).",
      discount_rate_low: DISCOUNT_RATE_LOW,
      discount_rate_high: DISCOUNT_RATE_HIGH,
      years_used: yearsUsed,
      simplifications: [],
    },
  };
}

function buildBuffettLamp(years: ValuationFloorYear[], shares: number, yearsUsed: number[]): EpvLamp {
  const method = {
    earnings_basis: "Owner earnings = average net income over the years shown (= net income + D&A − maintenance capex, with D&A − maintenance capex = 0 in v1).",
    leverage_treatment: "Levered (starts from net income, already after interest — an equity-holder stream).",
    denominator: "Capitalized at the 8–10% rate band (read as a cost-of-equity proxy).",
    bridge: "No enterprise→equity bridge: the capitalized result is already equity value (subtracting debt would double-count interest).",
    discount_rate_low: DISCOUNT_RATE_LOW,
    discount_rate_high: DISCOUNT_RATE_HIGH,
    years_used: yearsUsed,
    simplifications: [
      "Buffett's ± working-capital term is omitted in v1.",
      "One-time items are not separately normalized (multi-year averaging smooths them partially).",
      "Share-based compensation is left as a real expense (not added back).",
    ],
  };
  const ownerEarnings = avg(years.map((y) => y.net_income!));
  if (ownerEarnings <= 0) {
    return {
      label: "Buffett owner-earnings value",
      assessable: false,
      not_assessable_reason: "Normalized owner earnings are non-positive over the years shown; earnings power cannot be capitalized.",
      normalized_earnings: ownerEarnings,
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
    method,
  };
}

/** Tangible book = equity − goodwill − intangibles; total-book fallback when both intangible fields are missing. */
function buildAssetFloor(latest: ValuationFloorYear, shares: number): AssetFloor {
  const equity = latest.shareholders_equity;
  if (equity == null) {
    return { assessable: false, not_assessable_reason: "Shareholders' equity is unavailable, so no asset floor is shown.", basis: "Unavailable.", intangibles_separated: false };
  }
  const hasIntangibleData = latest.goodwill != null || latest.intangibles != null;
  if (!hasIntangibleData) {
    const basis = "Total book value (shareholders' equity ÷ diluted shares); intangibles not separated — goodwill/intangibles unavailable this period.";
    if (equity <= 0) return { assessable: false, not_assessable_reason: "Book value is negative or unavailable, so no asset floor is shown.", basis, intangibles_separated: false };
    return { assessable: true, basis, intangibles_separated: false, total_value: equity, per_share: equity / shares };
  }
  const tangible = equity - (latest.goodwill ?? 0) - (latest.intangibles ?? 0);
  const basis = "Tangible book value = shareholders' equity − goodwill − intangibles, ÷ diluted shares.";
  if (tangible <= 0) {
    return { assessable: false, not_assessable_reason: "Tangible book value is negative, so no asset floor is shown.", basis, intangibles_separated: true };
  }
  return { assessable: true, basis, intangibles_separated: true, total_value: tangible, per_share: tangible / shares };
}

function buildMoatReading(graham: EpvLamp, asset: AssetFloor): MoatReading {
  const basisNote =
    "Directional only, based on book value. A true franchise test compares earnings power against reproduction value (deferred to v2); against book value this reads systematically more franchise-like.";
  if (!graham.assessable) {
    return { signal: "value_destruction", label: "Normalized earnings are non-positive, so earnings power sits below the asset base — a value-destruction signal (not a verdict).", basis_note: basisNote };
  }
  if (!asset.assessable || asset.per_share == null) {
    return { signal: "not_assessable", label: "The earnings-power vs asset-base comparison is unavailable because there is no positive book-value floor.", basis_note: basisNote };
  }
  const epvMid = (graham.per_share_low! + graham.per_share_high!) / 2;
  const ratio = epvMid / asset.per_share;
  if (ratio >= MOAT_FRANCHISE_MULTIPLE) {
    return { signal: "franchise", label: "Earnings power sits well above the asset base — a franchise (moat) signal, not a verdict.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: asset.per_share };
  }
  if (ratio >= MOAT_COMMODITY_FLOOR) {
    return { signal: "commodity", label: "Earnings power sits near the asset base — a commodity-like profile with no clear moat signal.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: asset.per_share };
  }
  return { signal: "value_destruction", label: "Earnings power sits below the asset base — a value-destruction signal, not a verdict.", basis_note: basisNote, epv_per_share_compared: epvMid, asset_per_share_compared: asset.per_share };
}
