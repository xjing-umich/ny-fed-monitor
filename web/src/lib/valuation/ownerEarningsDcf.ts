import type {
  ValuationFloor,
  ValuationFloorYear,
  LatestPrice,
  OeDcfAssessment,
  OeDcfTier,
  DiscountBandProvenance,
  MethodReconciliation,
  ConsistencyReading,
  MoatCapAssessment,
} from "./types";
import { historicalGrowthBaseRate } from "./growthBaseRate";

export const GROWTH_CAP_FRANCHISE = 0.20; // 已验证 franchise(moat strong):Mauboussin 上沿,须 ROIC×再投资支撑
export const GROWTH_CAP_MODERATE = 0.07;  // moderate(非 strong 但有 franchise 信号):贴近名义 GDP+小幅;原 GROWTH_CAP_BASE 改名,值不变
export const GROWTH_CAP_NONE = 0.05;      // 非金融、无护城河(none):比 moderate 更收紧;主流不认无护城河的长期高增长
export const S_STRUCTURAL_GROWTH = 0.5; // 结构性置信门槛:≥此值的非金融 franchise，其 g1 不再受 gFund(=ROIC×净再投资率)封零 —— 近零再投资复利股的成长靠定价权/网络效应而非砸钱。真数据校准(548 franchise，门槛 0.5 保住 MA/SPGI/NFLX/ADBE、挡住 CAT/KO)，provenance 见 docs/superpowers/calibration/2026-07-17-structural-growth-threshold.md。
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
export const HIGH_GROWTH_YEARS = 5; // 有界高增长子段（其后线性 fade 到 0）
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

/**
 * 投影 OE 至 capYears 年：前 min(highGrowthYears,capYears) 年恒 g1，其后线性 fade g1→0 到
 * 第 capYears 年。默认参数（capYears=10, highGrowthYears=5）与原 10 年三段式实现逐年相等
 * ——moat-CAP 参数化的向后兼容点。
 */
export function projectOe(
  oe0: number,
  g1: number,
  capYears: number = PROJECTION_YEARS,
  highGrowthYears: number = HIGH_GROWTH_YEARS,
): number[] {
  const H = Math.min(highGrowthYears, capYears);
  const fadeSpan = Math.max(0, capYears - H);
  const path: number[] = [];
  let prev = oe0;
  for (let t = 1; t <= H; t++) {
    prev = prev * (1 + g1);
    path.push(prev);
  }
  for (let t = 1; t <= fadeSpan; t++) {
    const g = (g1 * (fadeSpan - t)) / fadeSpan;
    prev = prev * (1 + g);
    path.push(prev);
  }
  return path; // length = capYears；cap=10,H=5 时与原实现逐年相等
}

/** One tier: PV(explicit OE 1..capYears) + PV(terminal value at end of year capYears). */
export function dcfTier(
  oe0: number,
  g1: number,
  r: number,
  shares: number,
  gTerminal: number,
  capYears: number = PROJECTION_YEARS,
): {
  equity: number;
  perShare: number;
  pvTv: number;
} {
  const oe = projectOe(oe0, g1, capYears);
  let pvExplicit = 0;
  for (let t = 1; t <= capYears; t++) {
    pvExplicit += oe[t - 1] / Math.pow(1 + r, t);
  }
  const oeN = oe[capYears - 1];
  // 带上限 Gordon：g 与贴现率同源、且 r−g 足够宽时用 Gordon；否则退回零增长（安全兜底）。
  const useGordon = gTerminal > 0 && r - gTerminal >= MIN_RG_SPREAD;
  const tv = useGordon ? (oeN * (1 + gTerminal)) / (r - gTerminal) : oeN / r;
  const pvTv = tv / Math.pow(1 + r, capYears);
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

// leveragePremium：由 epvFloor.assembleFloor 算一次并发布在 floor.leverage_premium 上,这里只读、不重算
// （单一真相源,防两条腿分歧——沿用 moat_cap 的模式）。owner earnings 是股权流,贴现率随杠杆
// 上升（MM Prop II）。同量平移 r_low/r_high,不改变二者的大小关系,倒挂 flag 判据不受影响。
function discountBand(
  dgs10: { value: number; date: string } | null,
  leveragePremium = 0,
): DiscountBandProvenance {
  // 溢价>0 时必须在 note 里披露,否则文案数字对不上实际返回的 rLow/rHigh(见 spec Task 3 review finding 1);
  // 溢价=0 时 premiumClause 为空串,拼出的文案与改动前逐字节相同。
  const premiumClause =
    leveragePremium > 0 ? `, each +${(leveragePremium * 100).toFixed(2)}pp for leverage premium` : "";
  if (!dgs10 || !Number.isFinite(dgs10.value)) {
    return {
      r_low: FALLBACK_BAND[0] + leveragePremium,
      r_high: FALLBACK_BAND[1] + leveragePremium,
      midpoint: (FALLBACK_BAND[0] + FALLBACK_BAND[1]) / 2 + leveragePremium,
      anchored: false,
      inverted: false,
      note: `DGS10 unavailable — discount band falls back to the 9–11% engine range${premiumClause} (not anchored to live treasury).`,
    };
  }
  const dgs10Dec = dgs10.value / 100; // FRED percent → decimal
  const rAggressive = dgs10Dec + DGS10_PREMIUM + leveragePremium;
  const inverted = dgs10Dec >= INVERSION_DGS10; // rAggressive ≥ R_STRICT (0.12), 判据只看 DGS10,不受溢价平移影响
  const rStrictShifted = R_STRICT + leveragePremium;
  const rLow = Math.min(rAggressive, rStrictShifted);
  const rHigh = Math.max(rAggressive, rStrictShifted);
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
      : `Discount band: ${(rLow * 100).toFixed(2)}%–${(rHigh * 100).toFixed(2)}% (DGS10 +4.5% to a 12% strict end${premiumClause}, as of ${dgs10.date}).`,
  };
}

function tierValues(
  oe0: number,
  g1: number,
  r: number,
  shares: number,
  gTerminal: number,
  capYears?: number,
): {
  equity_value: number;
  per_share: number;
} {
  const run = dcfTier(oe0, g1, r, shares, gTerminal, capYears);
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
  years: ValuationFloorYear[],       // 工作序列(TTM 生效时头是 TTM):oe0 窗口/cagr/declined 用,与 oe0 同批
  dgs10: { value: number; date: string } | null,
  price: LatestPrice | null,
  // 纯 FY 审计序列(锁定 decision #2):gRaw 增长回归恒吃纯 FY,不吃 TTM 头。缺省 → years
  // (无 TTM 的调用方 years 本就是纯 FY,零变化);生产 runValuation 显式传 floorInput.years。
  fyYears: ValuationFloorYear[] = years,
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
  const { cagr, window } = netIncomeCagr(windowYears.length >= 2 ? windowYears : years); // 保留:declined + cagr_raw 披露
  const declined = cagr != null && cagr < 0;

  // 证据驱动增长:历史营收 log 回归(抗端点)与基本面上限(ROIC×再投资)取小,再受 franchise 分档量级封顶。
  const gRaw = historicalGrowthBaseRate(fyYears);               // 全历史纯 FY 营收 log 回归(decision #2,不吃 TTM 头)
  const gFund = floor.sustainable_growth;                        // Task 1: ROIC × 净再投资率
  // cap 四分档(Task 4,收紧假增长):strong franchise 20% > 金融股(银行/保险)SGR 封顶 > moderate 7% > 非金融无护城河 5%。
  // 金融股走 SGR(ROE×留存率)而非扁平 7% —— 原扁平 cap 把无护城河的区域银行/保险统一抬高含增长估值。
  const grade = floor.moat_cap?.grade;
  const cap =
    grade === "strong"
      ? GROWTH_CAP_FRANCHISE
      : floor.is_financial
      ? floor.financial_sgr != null && floor.financial_sgr > 0
        ? Math.min(floor.financial_sgr, GROWTH_CAP_MODERATE)
        : GROWTH_CAP_NONE
      : grade === "moderate"
      ? GROWTH_CAP_MODERATE
      : GROWTH_CAP_NONE;
  const cagrFallback = cagr != null && cagr > 0 ? cagr : undefined;
  // 层③(增长率引擎修正):近零再投资的轻资产 franchise，gFund=ROIC×净再投资率 结构性≈0，经 Math.min
  // 把已证实的营收/盈利增长盖成 0(MA/SPGI 现价被误判远超内在价值的真机制)。非金融 franchise 且
  // 结构性置信 s≥S_STRUCTURAL_GROWTH 时，gFund 不再作 g1 上限 —— 改由已证实的 gRaw(营收 log 回归)+
  // cagr 决定，仍受 grade cap 与 declined 闸约束。金融股走 SGR 不涉及；顺周期股(低 s，如 CAT/KO)
  // 保留 gFund，不给峰值增长计入。门槛 provenance 见 docs/superpowers/calibration/2026-07-17-structural-growth-threshold.md。
  const structuralFranchise =
    (grade === "strong" || grade === "moderate") &&
    floor.is_financial !== true &&
    floor.structural_confidence != null &&
    floor.structural_confidence >= S_STRUCTURAL_GROWTH;
  const fundamentalCeilings = structuralFranchise ? [gRaw, cagrFallback] : [gRaw, gFund, cagrFallback];
  const candidates = fundamentalCeilings.filter(
    (n): n is number => n != null && Number.isFinite(n) && n >= 0,
  );
  // gRaw/gFund 皆缺 → candidates 仅剩 cagrFallback(退回今天行为,但用新 cap);全缺 → 0。
  const g1 = declined ? 0 : candidates.length ? clamp(Math.min(...candidates), 0, cap) : 0;

  // owner earnings 是股权流,读 floor.leverage_premium(epvFloor 已发布,单一真相源)——不本地重算。
  const discount = discountBand(dgs10, floor.leverage_premium ?? 0);

  // 终值增长（中枢/乐观档）：g = min(10Y国债, 3%名义GDP) 且不快于近期 g1；恶化的生意不给终值增长。
  // 杠杆已由股权成本溢价(floor.leverage_premium)承担,不再在此二次归零 —— 见 spec §3.3。
  const gCap = Math.min(discount.dgs10_value ?? 0.025, GDP_NOMINAL_CAP);
  const gTerminal = declined ? 0 : Math.min(gCap, g1);

  // ── Moat → competitive-advantage-period (CAP，Phase 2) ─────────────────────
  // Single source of truth: floor.moat_cap, computed once in epvFloor.computeValuationFloor
  // (durabilityDeclined + ROIC_HURDLE shared with growthValue) — no local recomputation here,
  // so this leg and the Greenwald growth-value leg can no longer disagree on grade (BUG2 fix).
  // 防御性兜底（理论上真实 ValuationFloor 恒有 moat_cap）：缺失 → 视作非-franchise，CAP 不延长。
  const moatCap: MoatCapAssessment = floor.moat_cap ?? { grade: "none", capYears: 0, durablePassed: false, basis: "" };
  // CAP→显式期翻译：commodity/moderate(0/10) 一律保持基线 10 年（值不变）；strong(20) 才抬上沿。
  const neutralCap = Math.max(PROJECTION_YEARS, moatCap.capYears);

  const pessimistic: OeDcfTier = {
    growth_stage1: g1 / 2,
    discount_rate: discount.r_high,
    ...tierValues(oe0, g1 / 2, discount.r_high, shares, 0), // 悲观档保留零增长底，不接 CAP，值逐位不变
  };
  // 基线 cap=10（今天的行为）：quick-check 诊断锚点，与 CAP 抬升解耦，保证 reliable 逐位不变。
  const neutralBaselineRun = dcfTier(oe0, g1, discount.midpoint, shares, gTerminal);
  // 展示用：moat-CAP 允许把中枢/乐观档投影抬到 20 年（strong 档）。
  const neutralRun = dcfTier(oe0, g1, discount.midpoint, shares, gTerminal, neutralCap);
  const neutral: OeDcfTier = {
    growth_stage1: g1,
    discount_rate: discount.midpoint,
    equity_value: neutralRun.equity,
    per_share: neutralRun.perShare,
  };
  const optimistic: OeDcfTier = {
    growth_stage1: g1,
    discount_rate: discount.r_low,
    ...tierValues(oe0, g1, discount.r_low, shares, gTerminal, neutralCap),
  };

  // terminal share computed at the (CAP-adjusted) neutral tier
  const terminalShare = neutralRun.pvTv / neutralRun.equity;

  // diagnostics
  const oePerShare = oe0 / shares;
  // quick-check 基线：与基线 cap=10 的 neutral 档（非展示用 neutralRun）比较同增长假设的
  // H-model 闭式解 —— 诊断口径与今天逐字一致，quick_check_flag/reliable 与 CAP 抬升完全解耦。
  const quickPerShare = hModelValue(oe0, g1, gTerminal, discount.midpoint) / shares;
  const quickDev = Math.abs(neutralBaselineRun.perShare - quickPerShare) / quickPerShare;
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
    expectations_inputs: { oe0, shares, r: discount.midpoint, gTerminal, capYears: neutralCap },
    moatCap,
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
