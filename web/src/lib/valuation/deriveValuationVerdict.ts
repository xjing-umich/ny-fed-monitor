// deriveValuationVerdict.ts — 把"现价相对保守价值带的位置档"判定抽成纯函数（零 I/O）。
// 逻辑逐字搬运自 EarningsPowerFloorCard 的 ValueSpine：估值卡与投资人页叠加层共用此函数，
// 保证 bucket 永不漂移。OBSERVATION，非推荐——无 BUY/SELL/目标价。
import type {
  MethodReconciliation,
  OeDcfAssessment,
  PerShareUnavailable,
  StrikeZoneAssessment,
  ValuationFloor,
  ValuePosition,
} from "./types";

export type VerdictBucket = "below" | "within" | "above";
export type VerdictCoverage = "full" | "single_lamp";

export type ValuationVerdict = {
  /** 现价相对保守价值带的位置：below=有安全边际 / within=带内 / above=高于。 */
  bucket: VerdictBucket;
  /** below 的深折扣子集：现价 ≤ 价值带下沿 ×(1−1/3)。引擎权威标志。 */
  inStrikeZone: boolean;
  /** 展示用价值带下沿（每股，= 两法各端的最小值）。 */
  rangeLo: number;
  /** 展示用价值带上沿（每股，= 两法各端的最大值）。 */
  rangeHi: number;
  /** 判定所用现价。 */
  price: number;
  /** 价格 as-of（ISO date）。 */
  priceDate: string;
  /** 安全边际 %（vs rangeLo，仅 below/strike zone 有意义）；rangeLo≤0 → null。 */
  marginPct: number | null;
  /** full=两法夹逼 / single_lamp=仅单法（金融单灯或缺一法）。 */
  coverage: VerdictCoverage;
};

function finitePositive(n: number | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

/**
 * 数据健壮性上限:保守引擎正常不该出现 >80% 安全边际(≈现价 < 价值带下沿 1/5)。
 * 超过它几乎必是坏数据——缺/错 shares_diluted、或拆股调整后的价格与 SEC 股数不一致
 * (典型:Yahoo 拆股价 vs 申报老股数 → per-share 带被抬高 10×)。
 */
export const SANE_MARGIN_MAX = 0.8;

/**
 * 价值带与现价严重脱节 = 坏数据,判定应整条抑制(返回 null,即"无可信判定")。
 * 守 [[valuation-philosophy-constraint]]:宁可诚实空缺,也不把"打一折"的算崩当真实
 * 安全边际推到最敏感的面(strike zone / below)。screener/卡片/投资人页共用此判据。
 */
export function isImplausibleBand(v: {
  rangeLo: number;
  rangeHi: number;
  price: number;
  marginPct: number | null;
}): boolean {
  if (!(v.price > 0) || !(v.rangeLo > 0) || !(v.rangeHi >= v.rangeLo)) return true; // 退化带
  if (v.marginPct != null && v.marginPct > SANE_MARGIN_MAX) return true; // 假深度低估
  return false;
}
// 逐字搬运自卡片：两法 consistency → bucket。
function bucketFromConsistency(c?: string): VerdictBucket | null {
  if (c === "both_margin_of_safety") return "below";
  if (c === "within_value_range") return "within";
  if (c === "above_both_values") return "above";
  return null;
}
// 逐字搬运自卡片：单法 position → bucket。
function bucketFromPosition(p: ValuePosition): VerdictBucket {
  if (p === "in_strike_zone" || p === "approaching") return "below";
  if (p === "above_optimistic" || p === "above_zero_growth") return "above";
  return "within";
}

export function deriveValuationVerdict(input: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
}): ValuationVerdict | null {
  const { floor, strikeZone, oeDcf, reconciliation } = input;
  if (!floor || floor.kind !== "floor") return null; // thin data / per_share_unavailable
  const epv = strikeZone?.epv;
  if (!epv) return null; // 无价格 / 货币不匹配 / 无可比地板 → 无判定
  const price = strikeZone!.price.close;

  // 与卡片 ValueSpine 同源：conservative=OE-DCF 区间，growth=Greenwald 增长带或零增长点。
  const oeOk = oeDcf?.assessable && finitePositive(oeDcf.per_share_low) && finitePositive(oeDcf.per_share_high);
  const conservative = oeOk ? { lo: oeDcf!.per_share_low!, hi: oeDcf!.per_share_high! } : null;
  const growth = epv.ceilings
    ? { lo: epv.ceilings.pessimistic, hi: epv.ceilings.optimistic }
    : { lo: epv.base, hi: epv.base };
  const ends = [conservative?.lo, conservative?.hi, growth.lo, growth.hi].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  );
  if (ends.length === 0) return null;
  const rangeLo = Math.min(...ends);
  const rangeHi = Math.max(...ends);
  const bothMethods = !!conservative && !!epv.ceilings;

  // bucket：优先两法 consistency，否则单法 position（与卡片同序）。
  const bucket =
    (bothMethods ? bucketFromConsistency(reconciliation?.consistency) : null) ?? bucketFromPosition(epv.position);
  const inStrikeZone = epv.position === "in_strike_zone";
  const marginPct = rangeLo > 0 ? (rangeLo - price) / rangeLo : null;
  const coverage: VerdictCoverage = bothMethods ? "full" : "single_lamp";

  // 数据健壮性闸:价值带与现价严重脱节(坏 shares / 拆股不一致)→ 无可信判定,不污染最敏感的面。
  if (isImplausibleBand({ rangeLo, rangeHi, price, marginPct })) return null;

  return { bucket, inStrikeZone, rangeLo, rangeHi, price, priceDate: strikeZone!.price.date, marginPct, coverage };
}
