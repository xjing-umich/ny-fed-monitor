import type {
  ValuationFloor,
  ValuationFloorYear,
  LatestPrice,
  OeDcfAssessment,
  OeDcfTier,
  DiscountBandProvenance,
  MethodReconciliation,
  ConsistencyReading,
} from "./types";

export const GROWTH_CAP = 0.1;
// audit #3: 股权风险溢价从 2.5% 提到 4.5%(历史 ~4.5–5.5%),strict 端 10%→12%,
// fallback 带 8–10%→9–11%。原 2.5% 溢价系统性低估贴现率 → 高估所有名字,对高风险名字最甚。
export const R_STRICT = 0.12;
export const DGS10_PREMIUM = 0.045;
export const FALLBACK_BAND: [number, number] = [0.09, 0.11];
export const TERMINAL_SHARE_FLAG = 0.7;
export const OE_YIELD_FLAG_BPS = 300;
export const QUICK_CHECK_DEV_FLAG = 0.5;
export const R_MINUS_G_FLAG = 0.04; // (r − g) below this → explicit-phase value is sensitive
export const PROJECTION_YEARS = 10;
export const GDP_NOMINAL_CAP = 0.03; // 名义 GDP 长期上限 —— 永续增长 g 的封顶之一（Damodaran 铁律）
export const MIN_RG_SPREAD = 0.03;   // r − g 最小间距，防终值爆炸；触及则退回零增长
const INVERSION_DGS10 = 0.075; // DGS10 ≥ 7.5% inverts the band
const DGS10_MAX_AGE_DAYS = 45; // last-good DGS10 older than this is stale, not a live anchor

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

/** One tier: PV(explicit OE 1–10) + PV(terminal value at end of year 10). */
export function dcfTier(oe0: number, g1: number, r: number, shares: number, gTerminal: number): {
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
  // 带上限 Gordon：g 与贴现率同源、且 r−g 足够宽时用 Gordon；否则退回零增长（安全兜底）。
  const useGordon = gTerminal > 0 && r - gTerminal >= MIN_RG_SPREAD;
  const tv = useGordon ? (oe10 * (1 + gTerminal)) / (r - gTerminal) : oe10 / r;
  const pvTv = tv / Math.pow(1 + r, PROJECTION_YEARS);
  const equity = pvExplicit + pvTv;
  return { equity, perShare: equity / shares, pvTv };
}

/**
 * Damodaran 两阶段线性衰减增长的闭式解（H-model），返回权益价值：
 *   V = OE0 · [ (1 + gL) + H · (gS − gL) ] / (r − gL),  H = PROJECTION_YEARS / 2.
 * 用作 quick-check 基线：与 neutral 档同增长假设(gS=g1, gL=gTerminal, r=midpoint)，
 * 故 |neutral − 此基线| 只在离散 10 年 DCF 对分档/贴现异常敏感时才大 —— 这才是
 * 名副其实的可靠性信号，而非把「有增长」误当「不稳定」。gS=gL=0 时退化为 OE0/r。
 * r−gL 在本引擎恒 ≥ ~5%（midpoint ≥ 8.25%、gL ≤ 3%），r−gL ≤ 0 时防御性退回 OE0/r。
 */
export function hModelValue(oe0: number, gS: number, gL: number, r: number): number {
  const H = PROJECTION_YEARS / 2;
  const denom = r - gL;
  if (!(denom > 0)) return oe0 / r; // 防御：现实输入不会触及
  return (oe0 * ((1 + gL) + H * (gS - gL))) / denom;
}

function discountBand(dgs10: { value: number; date: string } | null): DiscountBandProvenance {
  if (!dgs10 || !Number.isFinite(dgs10.value)) {
    return {
      r_low: FALLBACK_BAND[0],
      r_high: FALLBACK_BAND[1],
      midpoint: (FALLBACK_BAND[0] + FALLBACK_BAND[1]) / 2,
      anchored: false,
      inverted: false,
      note: "DGS10 unavailable — discount band falls back to the 9–11% engine range (not anchored to live treasury).",
    };
  }
  const dgs10Dec = dgs10.value / 100; // FRED percent → decimal
  const rAggressive = dgs10Dec + DGS10_PREMIUM;
  const inverted = dgs10Dec >= INVERSION_DGS10; // rAggressive ≥ R_STRICT (0.12)
  const rLow = Math.min(rAggressive, R_STRICT);
  const rHigh = Math.max(rAggressive, R_STRICT);
  // Local staleness check (do NOT import isPriceStale from @/lib/managers/priceRead —
  // that module is server-only and this valuation module must stay pure).
  const dgs10Stale =
    (Date.now() - new Date(dgs10.date + "T00:00:00Z").getTime()) / 86_400_000 > DGS10_MAX_AGE_DAYS;
  return {
    r_low: rLow,
    r_high: rHigh,
    midpoint: (rLow + rHigh) / 2,
    dgs10_value: dgs10Dec,
    dgs10_date: dgs10.date,
    anchored: !dgs10Stale,
    inverted,
    note: dgs10Stale
      ? `DGS10 last-good ${dgs10.date} 超 ${DGS10_MAX_AGE_DAYS} 天,贴现带未锚定实时利率。`
      : inverted
      ? `DGS10 ${dgs10.value.toFixed(2)}% pushes the +4.5% end above the 12% strict threshold; band shown as [min,max].`
      : `Discount band: ${(rLow * 100).toFixed(2)}%–${(rHigh * 100).toFixed(2)}% (DGS10 +4.5% to a 12% strict end, as of ${dgs10.date}).`,
  };
}

function tierValues(oe0: number, g1: number, r: number, shares: number, gTerminal: number): {
  equity_value: number;
  per_share: number;
} {
  const run = dcfTier(oe0, g1, r, shares, gTerminal);
  return { equity_value: run.equity, per_share: run.perShare };
}

export const DIVERGENCE_FLAG = 0.2; // formulas.md §9 reconciliation line

export function reconcileMethods(
  greenwaldCeilings: { pessimistic: number; neutral: number; optimistic: number } | undefined,
  oeDcf: OeDcfAssessment | undefined,
  price: LatestPrice | null,
): MethodReconciliation {
  const gwOk =
    greenwaldCeilings != null &&
    [greenwaldCeilings.pessimistic, greenwaldCeilings.neutral, greenwaldCeilings.optimistic].every(
      (n) => Number.isFinite(n),
    );
  const bfOk =
    oeDcf != null && oeDcf.assessable && oeDcf.per_share_low != null && oeDcf.per_share_high != null;

  if (!gwOk || !bfOk) {
    return {
      comparable: false,
      reason_if_not: !gwOk
        ? "Greenwald growth-value ceilings are unavailable, so the two methods cannot be cross-checked."
        : "The owner-earnings DCF is unavailable, so the two methods cannot be cross-checked.",
      ...(gwOk ? { greenwald_range: [greenwaldCeilings!.pessimistic, greenwaldCeilings!.optimistic] as [number, number] } : {}),
      ...(bfOk ? { buffett_range: [oeDcf!.per_share_low!, oeDcf!.per_share_high!] as [number, number] } : {}),
    };
  }

  const gwLow = Math.min(greenwaldCeilings!.pessimistic, greenwaldCeilings!.optimistic);
  const gwHigh = Math.max(greenwaldCeilings!.pessimistic, greenwaldCeilings!.optimistic);
  const bfLow = Math.min(oeDcf!.per_share_low!, oeDcf!.per_share_high!);
  const bfHigh = Math.max(oeDcf!.per_share_low!, oeDcf!.per_share_high!);

  const gwMid = Math.min(gwHigh, Math.max(gwLow, greenwaldCeilings!.neutral));
  const bfMid = Math.min(bfHigh, Math.max(bfLow, oeDcf!.tiers!.neutral.per_share));
  const mean = (gwMid + bfMid) / 2;
  const divergence = mean > 0 ? Math.abs(gwMid - bfMid) / mean : 0;

  let consistency: ConsistencyReading | undefined;
  if (price && price.close > 0) {
    const below = Math.min(gwLow, bfLow);
    const above = Math.max(gwHigh, bfHigh);
    if (price.close < below) consistency = "both_margin_of_safety";
    else if (price.close > above) consistency = "above_both_values";
    else consistency = "within_value_range";
  }

  return {
    comparable: true,
    greenwald_range: [gwLow, gwHigh],
    buffett_range: [bfLow, bfHigh],
    price: price?.close,
    consistency,
    divergence_pct: divergence,
    divergence_flag: divergence > DIVERGENCE_FLAG,
  };
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

  // Measure growth over the SAME fiscal years that back oe0 (the lamp's window),
  // not the full input history — otherwise an anomalous oldest year outside the
  // window can inflate g1 to the cap and compound into the terminal value.
  const windowYears = years.filter((y) => lamp.method.years_used.includes(y.fiscal_year));
  const { cagr, window } = netIncomeCagr(windowYears.length >= 2 ? windowYears : years);
  const declined = cagr != null && cagr < 0;
  const g1 = cagr == null ? 0 : clamp(cagr, 0, GROWTH_CAP);

  const discount = discountBand(dgs10);

  // 终值增长（中枢/乐观档）：g = min(10Y国债, 3%名义GDP) 且不快于近期 g1；恶化/高杠杆股不给终值增长。
  const gCap = Math.min(discount.dgs10_value ?? 0.025, GDP_NOMINAL_CAP);
  const gTerminal = declined || floor.high_leverage_warning ? 0 : Math.min(gCap, g1);

  const pessimistic: OeDcfTier = {
    growth_stage1: g1 / 2,
    discount_rate: discount.r_high,
    ...tierValues(oe0, g1 / 2, discount.r_high, shares, 0), // 悲观档保留零增长底
  };
  const neutralRun = dcfTier(oe0, g1, discount.midpoint, shares, gTerminal);
  const neutral: OeDcfTier = {
    growth_stage1: g1,
    discount_rate: discount.midpoint,
    equity_value: neutralRun.equity,
    per_share: neutralRun.perShare,
  };
  const optimistic: OeDcfTier = {
    growth_stage1: g1,
    discount_rate: discount.r_low,
    ...tierValues(oe0, g1, discount.r_low, shares, gTerminal),
  };

  // terminal share computed at the neutral tier (reuse neutralRun)
  const terminalShare = neutralRun.pvTv / neutralRun.equity;

  // diagnostics
  const oePerShare = oe0 / shares;
  // quick-check 基线：与 neutral 档同增长假设的 H-model 闭式解（非零增长资本化），
  // 使偏离只在模型真不稳定时才大 —— 成长股不再被误判 unreliable（Phase A 皱褶修复）。
  const quickPerShare = hModelValue(oe0, g1, gTerminal, discount.midpoint) / shares;
  const quickDev = Math.abs(neutral.per_share - quickPerShare) / quickPerShare;
  const rMinusG = discount.midpoint - g1;
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
    terminal_growth: gTerminal,
    terminal_method: gTerminal > 0 ? "gordon_capped" : "zero_growth",
    diagnostics: {
      oe_yield: oeYield,
      oe_yield_vs_dgs10_bps: oeYieldBps,
      oe_yield_flag: oeYieldFlag,
      quick_check_per_share: quickPerShare,
      quick_check_deviation_pct: quickDev,
      quick_check_flag: quickDev > QUICK_CHECK_DEV_FLAG,
      r_minus_g: rMinusG,
      r_minus_g_flag: rMinusG < R_MINUS_G_FLAG,
    },
    no_bridge_note: NO_BRIDGE_NOTE,
  };
}
