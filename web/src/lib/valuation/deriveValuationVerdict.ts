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

  return { bucket, inStrikeZone, rangeLo, rangeHi, price, priceDate: strikeZone!.price.date, marginPct, coverage };
}
