import type {
  ValuationFloor,
  ValuationFloorYear,
  LatestPrice,
  OeDcfAssessment,
  OeDcfTier,
  DiscountBandProvenance,
} from "./types";

export const GROWTH_CAP = 0.1;
export const R_STRICT = 0.1;
export const DGS10_PREMIUM = 0.025;
export const FALLBACK_BAND: [number, number] = [0.08, 0.1];
export const TERMINAL_SHARE_FLAG = 0.7;
export const OE_YIELD_FLAG_BPS = 300;
export const QUICK_CHECK_DEV_FLAG = 0.5;
export const PROJECTION_YEARS = 10;
const INVERSION_DGS10 = 0.075; // DGS10 ≥ 7.5% inverts the band

const NO_BRIDGE_NOTE =
  "No enterprise→equity bridge: owner earnings already flow to shareholders (post-interest), so no net cash is added and no debt subtracted — matching the engine owner-earnings lamp.";

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Last FRED point with a numeric value, or null. Shared with the DGS10 reader. */
export function pickLatestFredPoint(
  points: { date: string; value: number | null }[],
): { value: number; date: string } | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p && p.date && p.value !== null && Number.isFinite(p.value)) {
      return { value: p.value as number, date: p.date };
    }
  }
  return null;
}

/** Net-income CAGR across the input years (most-recent-first). Returns endpoints used. */
function netIncomeCagr(years: ValuationFloorYear[]): {
  cagr?: number;
  window?: number[];
} {
  const pts = years
    .filter((y) => y.net_income != null && Number.isFinite(y.net_income))
    .map((y) => ({ fy: y.fiscal_year, ni: y.net_income as number }));
  if (pts.length < 2) return {};
  // most-recent-first → [0] = latest, [last] = oldest
  const latest = pts[0];
  const oldest = pts[pts.length - 1];
  const periods = latest.fy - oldest.fy;
  if (periods <= 0 || oldest.ni <= 0 || latest.ni <= 0) {
    return { cagr: latest.ni < oldest.ni ? -1 : undefined, window: [oldest.fy, latest.fy] };
  }
  const cagr = Math.pow(latest.ni / oldest.ni, 1 / periods) - 1;
  return { cagr, window: [oldest.fy, latest.fy] };
}

/** Project OE for years 1..10: stage1 constant g1 (Y1–5), stage2 linear fade g1→0 (Y6–10). */
function projectOe(oe0: number, g1: number): number[] {
  const path: number[] = [];
  let prev = oe0;
  for (let t = 1; t <= 5; t++) {
    prev = prev * (1 + g1);
    path.push(prev);
  }
  for (let t = 6; t <= PROJECTION_YEARS; t++) {
    const g = (g1 * (PROJECTION_YEARS - t)) / 5; // t=6 → g1·4/5 … t=10 → 0
    prev = prev * (1 + g);
    path.push(prev);
  }
  return path; // length 10, path[9] = OE_10
}

/** One tier: PV(explicit OE 1–10) + PV(zero-growth terminal OE_10/r). */
function dcfTier(oe0: number, g1: number, r: number, shares: number): {
  equity: number;
  perShare: number;
  pvTv: number;
} {
  const oe = projectOe(oe0, g1);
  let pvExplicit = 0;
  for (let t = 1; t <= PROJECTION_YEARS; t++) {
    pvExplicit += oe[t - 1] / Math.pow(1 + r, t);
  }
  const oe10 = oe[PROJECTION_YEARS - 1];
  const tv = oe10 / r; // zero-growth perpetuity at end of year 10
  const pvTv = tv / Math.pow(1 + r, PROJECTION_YEARS);
  const equity = pvExplicit + pvTv;
  return { equity, perShare: equity / shares, pvTv };
}

function discountBand(dgs10: { value: number; date: string } | null): DiscountBandProvenance {
  if (!dgs10 || !Number.isFinite(dgs10.value)) {
    return {
      r_low: FALLBACK_BAND[0],
      r_high: FALLBACK_BAND[1],
      midpoint: (FALLBACK_BAND[0] + FALLBACK_BAND[1]) / 2,
      anchored: false,
      inverted: false,
      note: "DGS10 unavailable — discount band falls back to the 8–10% engine range (not anchored to live treasury).",
    };
  }
  const dgs10Dec = dgs10.value / 100; // FRED percent → decimal
  const rAggressive = dgs10Dec + DGS10_PREMIUM;
  const inverted = dgs10Dec >= INVERSION_DGS10; // rAggressive ≥ 0.10
  const rLow = Math.min(rAggressive, R_STRICT);
  const rHigh = Math.max(rAggressive, R_STRICT);
  return {
    r_low: rLow,
    r_high: rHigh,
    midpoint: (rLow + rHigh) / 2,
    dgs10_value: dgs10Dec,
    dgs10_date: dgs10.date,
    anchored: true,
    inverted,
    note: inverted
      ? `DGS10 ${dgs10.value.toFixed(2)}% pushes the +2.5% end above the 10% strict threshold; band shown as [min,max].`
      : `Discount band: ${(rLow * 100).toFixed(2)}%–${(rHigh * 100).toFixed(2)}% (DGS10 +2.5% to a 10% strict end, as of ${dgs10.date}).`,
  };
}

function tierValues(oe0: number, g1: number, r: number, shares: number): {
  equity_value: number;
  per_share: number;
} {
  const run = dcfTier(oe0, g1, r, shares);
  return { equity_value: run.equity, per_share: run.perShare };
}

export function deriveOeDcf(
  floor: ValuationFloor,
  years: ValuationFloorYear[],
  dgs10: { value: number; date: string } | null,
  price: LatestPrice | null,
): OeDcfAssessment {
  const lamp = floor.buffett_epv;
  if (
    !lamp.assessable ||
    lamp.normalized_earnings == null ||
    !(lamp.normalized_earnings > 0) ||
    lamp.equity_value_low == null ||
    lamp.per_share_low == null ||
    !(lamp.per_share_low > 0)
  ) {
    return {
      assessable: false,
      not_assessable_reason:
        lamp.not_assessable_reason ??
        "Owner earnings are not assessable (non-positive or missing), so the owner-earnings DCF is not shown.",
      no_bridge_note: NO_BRIDGE_NOTE,
    };
  }

  const oe0 = lamp.normalized_earnings;
  const shares = lamp.equity_value_low / lamp.per_share_low;

  const { cagr, window } = netIncomeCagr(years);
  const declined = cagr != null && cagr < 0;
  const g1 = cagr == null ? 0 : clamp(cagr, 0, GROWTH_CAP);

  const discount = discountBand(dgs10);

  const pessimistic: OeDcfTier = {
    growth_stage1: g1 / 2,
    discount_rate: discount.r_high,
    ...tierValues(oe0, g1 / 2, discount.r_high, shares),
  };
  const neutral: OeDcfTier = {
    growth_stage1: g1,
    discount_rate: discount.midpoint,
    ...tierValues(oe0, g1, discount.midpoint, shares),
  };
  const optimistic: OeDcfTier = {
    growth_stage1: g1,
    discount_rate: discount.r_low,
    ...tierValues(oe0, g1, discount.r_low, shares),
  };

  // terminal share computed at the neutral tier
  const neutralRun = dcfTier(oe0, g1, discount.midpoint, shares);
  const terminalShare = neutralRun.pvTv / neutralRun.equity;

  // diagnostics
  const oePerShare = oe0 / shares;
  const quickPerShare = oe0 / discount.midpoint / shares; // no-growth capitalization
  const quickDev = Math.abs(neutral.per_share - quickPerShare) / quickPerShare;
  let oeYield: number | undefined;
  let oeYieldBps: number | undefined;
  let oeYieldFlag: boolean | undefined;
  if (price && price.close > 0) {
    oeYield = oePerShare / price.close;
    if (discount.dgs10_value != null) {
      oeYieldBps = (oeYield - discount.dgs10_value) * 10_000;
      oeYieldFlag = Math.abs(oeYieldBps) > OE_YIELD_FLAG_BPS;
    }
  }

  return {
    assessable: true,
    owner_earnings: oe0,
    oe_fiscal_years: lamp.method.years_used,
    cagr_raw: cagr,
    cagr_window: window,
    growth_g1: g1,
    declined,
    discount,
    tiers: { pessimistic, neutral, optimistic },
    per_share_low: pessimistic.per_share,
    per_share_high: optimistic.per_share,
    terminal_share_pct: terminalShare,
    terminal_dependency_flag: terminalShare > TERMINAL_SHARE_FLAG,
    diagnostics: {
      oe_yield: oeYield,
      oe_yield_vs_dgs10_bps: oeYieldBps,
      oe_yield_flag: oeYieldFlag,
      quick_check_per_share: quickPerShare,
      quick_check_deviation_pct: quickDev,
      quick_check_flag: quickDev > QUICK_CHECK_DEV_FLAG,
    },
    no_bridge_note: NO_BRIDGE_NOTE,
  };
}
