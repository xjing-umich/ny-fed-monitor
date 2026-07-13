import type { MoatReading, MoatCapAssessment, ValuationFloorYear } from "./types";

export const CAP_STRONG = 20;
export const CAP_MODERATE = 10;
export const CAP_NONE = 0;
export const MOAT_STRONG_RATIO = 2.0; // EPV/AV 强档阈值·单一来源(growthValue.MOAT_STRONG_MULTIPLE 复用本值)
export const ROIC_HURDLE = 0.10; // 两腿(growthValue/ownerEarningsDcf)共享的 ROIC 门槛·单一来源
export const ROIC_SANITY = 3.0; // ROIC 上限 sanity：>300% 视口径失真(通常是负/近零投入资本口径错误)，剔除该年
export const OPERATING_CASH_PCT = 0.02; // Damodaran 经营性现金占营收比例;超出部分视为「超额现金」,从资产分母剔除(pathA)

export function deriveMoatCap(input: {
  moat: MoatReading;
  epvAvRatio: number | undefined;
  /**
   * 经营资产口径的 EPV/AV(剔除超额现金后的资产分母,Greenwald EPV 框架既有调整项)。传入时优先
   * 于 epvAvRatio 用于 pathA 判定(千亿现金撑大资产重置价值、压低比率的 GOOGL/META 类误判解药);
   * 缺失(cash/revenue 不可得)时回退旧 epvAvRatio，保证无数据时行为不变。
   */
  epvAvRatioOperating?: number;
  declined: boolean;
  suppressedFlags: boolean;
  roicStable: boolean | undefined;
  /** ROIC 长期回报型久期判据(Task 3 填真值);本 Task 只接参数，默认当 false 用。 */
  roicLongTermStrong?: boolean;
}): MoatCapAssessment {
  const { moat, epvAvRatio, epvAvRatioOperating, declined, suppressedFlags, roicStable, roicLongTermStrong } = input;
  if (moat.signal !== "franchise" || (epvAvRatio == null && epvAvRatioOperating == null)) {
    return { grade: "none", capYears: CAP_NONE, durablePassed: false, basis: "无护城河信号，不延长竞争优势期。" };
  }
  const ratioForMoat = epvAvRatioOperating ?? epvAvRatio;
  if (ratioForMoat == null || !Number.isFinite(ratioForMoat)) {
    return { grade: "none", capYears: CAP_NONE, durablePassed: false, basis: "无护城河信号，不延长竞争优势期。" };
  }
  const strongRatio = ratioForMoat >= MOAT_STRONG_RATIO && moat.dual_test_passed === true;
  const franchiseCore = moat.signal === "franchise" && !declined && !suppressedFlags && roicStable === true;
  const durablePassed = franchiseCore && (strongRatio || roicLongTermStrong === true);
  if (durablePassed) {
    return { grade: "strong", capYears: CAP_STRONG, durablePassed: true, roicStable: true,
      basis: `强护城河（EPV/AV ${ratioForMoat.toFixed(1)}×、双资产测试通过、ROIC 历史稳定）→ 竞争优势期约 ${CAP_STRONG} 年。` };
  }
  // franchise 但未达强档或耐久性未过 → 中档
  // 注:!strongRatio 分支覆盖 pathA(比率)与 pathB(roicLongTermStrong)均未通过的情形，文案对两条路径都成立。
  const reason = !strongRatio ? "护城河存在但未达强档" : declined ? "盈利下滑" : suppressedFlags ? "资本开支/杠杆红旗" : "ROIC 稳定性不足";
  return { grade: "moderate", capYears: CAP_MODERATE, durablePassed: false,
    ...(roicStable != null ? { roicStable } : {}),
    basis: `${reason} → 竞争优势期约 ${CAP_MODERATE} 年。` };
}

// ── ROIC 稳定性度量（数据准确性硬门） ────────────────────────────────────────

export const ROIC_MIN_YEARS = 3;

/**
 * ROIC>资本成本 历史稳定性：逐 FY 年 ROIC = NOPAT / 投入资本，要求窗口内 ≥⅔ 年 > 贴现率。
 * NOPAT 与投入资本口径复用 growthValue/reproduction（实现时核实可干净取得；不可靠→返回 undefined，deriveMoatCap 据此降中档）。
 * 只吃 fiscal_period=FY 行（[[cusip-corruption-episode]] 纪律，调用方须先过滤）；<3 年 → undefined。
 *
 * BUG1 二道防线：investedCapitalOf 在 epvFloor 层已对负/零权益年份返回 undefined（口径无效，
 * 跳过该年）；这里再叠加 sanity 剔除任何仍然产生失真 ROIC（>300%，通常是极小正投入资本口径
 * 错误）的年份，防止假阳「stable」把回购股(负权益修复前/接近零权益边界)错判为强护城河。
 */
export function roicStability(input: {
  fyYears: ValuationFloorYear[]; // 已确认 FY 行
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  discountRate: number;
}): boolean | undefined {
  const { fyYears, investedCapitalOf, nopatOf, discountRate } = input;
  const roics: number[] = [];
  for (const y of fyYears) {
    const ic = investedCapitalOf(y), np = nopatOf(y);
    if (ic == null || np == null || !(ic > 0)) continue;
    const roic = np / ic;
    if (!Number.isFinite(roic) || Math.abs(roic) > ROIC_SANITY) continue; // BUG1 sanity: 失真 ROIC 剔除，不计入稳定性
    roics.push(roic);
  }
  if (roics.length < ROIC_MIN_YEARS) return undefined;
  const above = roics.filter((x) => x > discountRate).length;
  return above / roics.length >= 2 / 3;
}

/**
 * 耐久性下滑判据（BUG2 单一来源）：最近 FY 与最旧 FY 的 net_income 端点比较。fyYears 不假设
 * 已排序 —— 按 fiscal_year 取 max/min 两端。缺任一端点值 → 不判定下滑（false，保守不误伤）。
 */
export function durabilityDeclined(fyYears: ValuationFloorYear[]): boolean {
  if (fyYears.length === 0) return false;
  let latest = fyYears[0];
  let oldest = fyYears[0];
  for (const y of fyYears) {
    if (y.fiscal_year > latest.fiscal_year) latest = y;
    if (y.fiscal_year < oldest.fiscal_year) oldest = y;
  }
  const latestNi = latest.net_income;
  const oldestNi = oldest.net_income;
  return latestNi != null && oldestNi != null && latestNi < oldestNi;
}

// ── ROIC 趋势闸(Phase 2.5:回报型久期判据) ────────────────────────────────────
export const ROIC_TREND_LAG = 2;        // 排除最新 N 年未成熟投资(与 growthValue.ROIIC_ENDPOINT_LAG 同哲学)
export const ROIC_TREND_MIN_YEARS = 4;  // 成熟序列(去 lag 后)至少 N 年才评估趋势;否则 undefined
export const ROIC_TREND_DROP = 0.15;    // 较新半段均值 < 较旧半段均值 ×(1−此值)判 "declining"

/**
 * 成熟资本上的 ROIC 趋势(Phase 2.5)。capex 激增会立刻抬「投入资本」分母、但回报滞后进 NOPAT
 * 分子 → surge 当年 ROIC 机械性下滑(哪怕投资很好)。故本函数**排除最新 ROIC_TREND_LAG 年**,只看
 * 成熟资本的 ROIC 是否早已在跌,避免把健康烧钱股误判 declining(自我拆台)。有效性过滤同 roicStability。
 */
export function roicTrend(input: {
  fyYears: ValuationFloorYear[];
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
  nopatOf: (y: ValuationFloorYear) => number | undefined;
}): "declining" | "stable" | undefined {
  const { fyYears, investedCapitalOf, nopatOf } = input;
  const series: { fy: number; roic: number }[] = [];
  for (const y of fyYears) {
    const ic = investedCapitalOf(y), np = nopatOf(y);
    if (ic == null || np == null || !(ic > 0)) continue;
    const roic = np / ic;
    if (!Number.isFinite(roic) || Math.abs(roic) > ROIC_SANITY) continue;
    series.push({ fy: y.fiscal_year, roic });
  }
  series.sort((a, b) => b.fy - a.fy); // most-recent-first
  const matured = series.slice(ROIC_TREND_LAG); // 丢弃最新 LAG 年未成熟投资
  if (matured.length < ROIC_TREND_MIN_YEARS) return undefined;
  const half = Math.floor(matured.length / 2);
  const newer = matured.slice(0, half);                 // 较新的成熟年
  const older = matured.slice(matured.length - half);   // 较旧的成熟年
  const mean = (xs: { roic: number }[]) => xs.reduce((s, x) => s + x.roic, 0) / xs.length;
  const olderMean = mean(older);
  if (!(olderMean > 0)) return "stable"; // 负/零基不做比值判定(非 franchise,交 roicStable/signal 兜)
  return mean(newer) < olderMean * (1 - ROIC_TREND_DROP) ? "declining" : "stable";
}

// ── ROIC 长期极高且稳(Task 3:strong pathB,Morningstar/Mauboussin 主判据) ─────
export const ROIC_MOAT_MIN_YEARS = 6; // 真数据校准(mTask 1):getSecCompanyData 每票最多 6 个有效 FY 年，用 8 会让 GOOGL/META 永远进不了 pathB
export const ROIC_MOAT_STRONG = 0.22;  // Task 1 真数据校准:GOOGL 25%/META 28.6% 过，F −4.7%/T 4.6% 拦
export const ROIC_MOAT_CV = 0.35;      // 变异系数阈值:GOOGL CV0.17/META CV0.22 过，F CV7.60/T CV0.76(周期股)拦

/**
 * ROIC 长期回报型久期判据(Phase 3 strong pathB)：近 ROIC_MOAT_MIN_YEARS 个有效 FY 年 ROIC 均值
 * ≥ ROIC_MOAT_STRONG 且变异系数(CV=std/|mean|) < ROIC_MOAT_CV → true。用于让 ROIC 长期极高且稳但
 * 经营资产 EPV/AV 达不到 pathA 阈值的公司(GOOGL/META)仍可凭 ROIC 走 strong。有效性过滤复用
 * roicStability 同款(investedCapital 负/零→跳过该年；ROIC_SANITY>300%→剔除失真年)。
 * 有效年 <ROIC_MOAT_MIN_YEARS → false(不可评估不放行，保守)。
 */
export function roicLongTermStrong(input: {
  fyYears: ValuationFloorYear[];
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
}): boolean {
  const rs: number[] = [];
  for (const y of input.fyYears) {
    const nopat = input.nopatOf(y);
    const ic = input.investedCapitalOf(y);
    if (nopat == null || ic == null || !(ic > 0)) continue;
    const roic = nopat / ic;
    if (!Number.isFinite(roic) || Math.abs(roic) > ROIC_SANITY) continue;
    rs.push(roic);
  }
  if (rs.length < ROIC_MOAT_MIN_YEARS) return false;
  const mean = rs.reduce((s, v) => s + v, 0) / rs.length;
  if (!(mean >= ROIC_MOAT_STRONG)) return false;
  const sd = Math.sqrt(rs.reduce((s, v) => s + (v - mean) ** 2, 0) / rs.length);
  const cv = mean !== 0 ? sd / Math.abs(mean) : Infinity;
  return cv < ROIC_MOAT_CV;
}

// ── 可持续增长率(Task 1:g_used 的基本面上限,Damodaran 增长内生化) ──────────────
export const SUSTAINABLE_MIN_YEARS = 3;
/**
 * 可持续增长率 g = ROIC × 净再投资率(Damodaran 增长内生化)。用作 g_used 的基本面上限。
 * ROIC = 成熟段 NOPAT/投入资本(复用有效性过滤:investedCapital 负/零权益→undefined;剔非有限);
 * 净再投资率 = mean((capex − d_and_a + ΔWC) / NOPAT);ΔWC 缺失年按 0。负再投资率 clamp 到 0。
 * 上限用途,偏低不偏高;有效年 <SUSTAINABLE_MIN_YEARS 或分母不成立 → undefined。
 */
export function sustainableGrowth(input: {
  fyYears: ValuationFloorYear[];
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
}): number | undefined {
  const { fyYears, nopatOf, investedCapitalOf } = input;
  const sorted = [...fyYears].sort((a, b) => a.fiscal_year - b.fiscal_year); // 升序,供 ΔWC
  const roics: number[] = [];
  const reinvest: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const y = sorted[i];
    const nopat = nopatOf(y);
    const ic = investedCapitalOf(y);
    if (nopat == null || ic == null || !(ic > 0) || !Number.isFinite(nopat)) continue;
    const roic = nopat / ic;
    if (!Number.isFinite(roic) || Math.abs(roic) > ROIC_SANITY) continue;
    if (!(nopat > 0)) continue; // 净再投资率分母须正
    roics.push(roic);
    const capex = y.capex ?? 0;
    const da = y.d_and_a ?? 0;
    const prevWc = i > 0 ? sorted[i - 1].working_capital : undefined;
    const dWc = y.working_capital != null && prevWc != null ? y.working_capital - prevWc : 0;
    const rate = (capex - da + dWc) / nopat;
    reinvest.push(Math.max(0, rate)); // 负再投资率(净收缩)→ 0
  }
  if (roics.length < SUSTAINABLE_MIN_YEARS) return undefined;
  const meanRoic = roics.reduce((s, v) => s + v, 0) / roics.length;
  const meanReinvest = reinvest.reduce((s, v) => s + v, 0) / reinvest.length;
  const g = meanRoic * meanReinvest;
  return Number.isFinite(g) ? Math.max(0, g) : undefined;
}

// ── 金融股识别 + SGR(Task 4:收紧假增长,金融股用可持续增长率封顶而非扁平 7% cap) ──────

/** 银行(National/State Commercial Banks 等)SIC 区间。 */
export const SIC_BANK_RANGE: [number, number] = [6020, 6099];
/** 保险(Fire/Marine/Casualty、Life 等)SIC 区间。 */
export const SIC_INSURANCE_RANGE: [number, number] = [6300, 6399];

/** is_financial = sic∈[6020,6099]∪[6300,6399](银行+保险，Task 1 真数据校准，无歧义)。 */
export function isFinancialSic(sic: number | null | undefined): boolean {
  if (sic == null || !Number.isFinite(sic)) return false;
  return (
    (sic >= SIC_BANK_RANGE[0] && sic <= SIC_BANK_RANGE[1]) ||
    (sic >= SIC_INSURANCE_RANGE[0] && sic <= SIC_INSURANCE_RANGE[1])
  );
}

/**
 * 金融股可持续增长率(SGR，Task 1/4 口径)：SGR = ROE × 留存率
 *   ROE = net_income / shareholders_equity(逐 FY 年)
 *   留存率 = 1 − ((dividends_paid ?? 0) + (share_repurchases ?? 0)) / net_income，clamp 到 [0,1]
 * net_income ≤ 0 的年跳过(ROE/留存率口径均失效)；股东权益 ≤ 0 的年跳过。
 * 逐年 SGR 取均值(近数年代表值)；无有效年 → undefined(不降级到 5%，交给调用方决定 fallback)。
 */
export function sustainableGrowthRateFinancial(fyYears: ValuationFloorYear[]): number | undefined {
  const sgrs: number[] = [];
  for (const y of fyYears) {
    const ni = y.net_income;
    const equity = y.shareholders_equity;
    if (ni == null || !(ni > 0) || equity == null || !(equity > 0)) continue;
    const roe = ni / equity;
    const payout = (y.dividends_paid ?? 0) + (y.share_repurchases ?? 0);
    const retention = clampUnit(1 - payout / ni);
    const sgr = roe * retention;
    if (Number.isFinite(sgr)) sgrs.push(sgr);
  }
  if (sgrs.length === 0) return undefined;
  return sgrs.reduce((s, v) => s + v, 0) / sgrs.length;
}

function clampUnit(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * ROIC 口径闭包工厂(逐字提取自 epvFloor.assembleFloor,供结构性置信分 s 与 assembleFloor 共用,
 * 避免两处重复定义)。nopatOf=税后经营利润;investedCapitalOf 对负/零权益年返回 undefined(BUG1 口径守卫)。
 */
export function roicHelpers(taxRate: number): {
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
} {
  const nopatOf = (y: ValuationFloorYear): number | undefined =>
    y.operating_income != null ? y.operating_income * (1 - taxRate) : undefined;
  const investedCapitalOf = (y: ValuationFloorYear): number | undefined => {
    if (!(y.shareholders_equity != null && y.shareholders_equity > 0)) return undefined;
    const nd = y.net_debt ?? ((y.total_debt ?? 0) - (y.cash ?? 0));
    return nd + y.shareholders_equity;
  };
  return { nopatOf, investedCapitalOf };
}
