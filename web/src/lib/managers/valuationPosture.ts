import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import type { VerdictBucket } from "@/lib/valuation/deriveValuationVerdict";

export type CheapHolding = {
  issuer: string;
  ticker: string;
  marginPct: number | null; // 安全边际(分数); 展示 Math.round(*100)%
  inStrikeZone: boolean;
  bucket: VerdictBucket;
};

export type ValuationPosture = {
  covered: number; // 有可信估值(reliable)的长仓持仓数(分母)
  strikeCount: number; // inStrikeZone && reliable
  belowCount: number; // bucket==="below" && reliable
  cheap: CheapHolding[]; // inStrikeZone ∪ below, marginPct 降序(null 垫底), 不截断
  asOf: string; // 参与计数行最大 priceDate; 无则 ""
};

export const POSTURE_LIMIT = 6;

/**
 * 从已加载的估值快照(readValuationVerdicts 结果)派生投资人组合的「估值姿态」。
 * 信心闸: 只认 reliable=true(与 /stocks/screener strike_zone/below 视图同口径)。
 * 纯函数、零 IO → valuationPosture.check.ts 断言。截断挪展示层(返回全部 cheap)。
 */
export function deriveValuationPosture(input: {
  holdings: { cusip: string; issuer: string }[];
  cusipToTicker: Map<string, string>;
  verdicts: Map<string, SnapshotVerdict>;
}): ValuationPosture {
  let covered = 0;
  let strikeCount = 0;
  let belowCount = 0;
  let asOf = "";
  const cheap: CheapHolding[] = [];
  for (const h of input.holdings) {
    const ticker = input.cusipToTicker.get(h.cusip);
    if (!ticker) continue;
    const vd = input.verdicts.get(ticker.toUpperCase());
    if (vd == null || !vd.reliable) continue; // 信心闸
    covered += 1;
    if (vd.priceDate && vd.priceDate > asOf) asOf = vd.priceDate;
    const isBelow = vd.bucket === "below";
    if (vd.inStrikeZone) strikeCount += 1;
    if (isBelow) belowCount += 1;
    if (vd.inStrikeZone || isBelow) {
      cheap.push({
        issuer: h.issuer,
        ticker,
        marginPct: vd.marginPct,
        inStrikeZone: vd.inStrikeZone,
        bucket: vd.bucket,
      });
    }
  }
  // marginPct 降序, null 垫底
  cheap.sort((a, b) => {
    if (a.marginPct == null && b.marginPct == null) return 0;
    if (a.marginPct == null) return 1;
    if (b.marginPct == null) return -1;
    return b.marginPct - a.marginPct;
  });
  return { covered, strikeCount, belowCount, cheap, asOf };
}
