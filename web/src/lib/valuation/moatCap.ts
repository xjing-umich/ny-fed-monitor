import type { MoatReading, MoatCapAssessment, ValuationFloorYear } from "./types";

export const CAP_STRONG = 20;
export const CAP_MODERATE = 10;
export const CAP_NONE = 0;
export const MOAT_STRONG_RATIO = 2.0; // EPV/AV 强档阈值·单一来源(growthValue.MOAT_STRONG_MULTIPLE 复用本值)

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
    roics.push(np / ic);
  }
  if (roics.length < ROIC_MIN_YEARS) return undefined;
  const above = roics.filter((x) => x > discountRate).length;
  return above / roics.length >= 2 / 3;
}
