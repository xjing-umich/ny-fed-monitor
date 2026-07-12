import type { MoatReading, MoatCapAssessment, ValuationFloorYear } from "./types";

export const CAP_STRONG = 20;
export const CAP_MODERATE = 10;
export const CAP_NONE = 0;
export const MOAT_STRONG_RATIO = 2.0; // EPV/AV 强档阈值·单一来源(growthValue.MOAT_STRONG_MULTIPLE 复用本值)
export const ROIC_HURDLE = 0.10; // 两腿(growthValue/ownerEarningsDcf)共享的 ROIC 门槛·单一来源
export const ROIC_SANITY = 3.0; // ROIC 上限 sanity：>300% 视口径失真(通常是负/近零投入资本口径错误)，剔除该年

export function deriveMoatCap(input: {
  moat: MoatReading;
  epvAvRatio: number | undefined;
  declined: boolean;
  suppressedFlags: boolean;
  roicStable: boolean | undefined;
}): MoatCapAssessment {
  const { moat, epvAvRatio, declined, suppressedFlags, roicStable } = input;
  if (moat.signal !== "franchise" || epvAvRatio == null || !Number.isFinite(epvAvRatio)) {
    return { grade: "none", capYears: CAP_NONE, durablePassed: false, basis: "无护城河信号，不延长竞争优势期。" };
  }
  const strongRatio = epvAvRatio >= MOAT_STRONG_RATIO && moat.dual_test_passed === true;
  const durablePassed = strongRatio && !declined && !suppressedFlags && roicStable === true;
  if (durablePassed) {
    return { grade: "strong", capYears: CAP_STRONG, durablePassed: true, roicStable: true,
      basis: `强护城河（EPV/AV ${epvAvRatio.toFixed(1)}×、双资产测试通过、ROIC 历史稳定）→ 竞争优势期约 ${CAP_STRONG} 年。` };
  }
  // franchise 但未达强档或耐久性未过 → 中档
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
