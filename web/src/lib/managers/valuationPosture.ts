import type { Lang } from "@/lib/nav";
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
  covered: number; // 有可信估值(reliable,即估值无红旗)的长仓持仓数(分母)
  strikeCount: number; // inStrikeZone && reliable
  belowCount: number; // bucket==="below" && reliable
  cheap: CheapHolding[]; // inStrikeZone ∪ below, marginPct 降序(null 垫底), 不截断
  pending: CheapHolding[]; // 便宜档但 reliable=false(待确认),不计入 covered/cheap, marginPct 降序
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
  const pending: CheapHolding[] = [];
  for (const h of input.holdings) {
    const ticker = input.cusipToTicker.get(h.cusip);
    if (!ticker) continue;
    const vd = input.verdicts.get(ticker.toUpperCase());
    if (vd == null) continue;
    if (!vd.reliable) {
      // 待确认:照实列出,但不进分母、不进便宜计数(spec 2026-10-23 §三.2)
      if (vd.inStrikeZone || vd.bucket === "below")
        pending.push({ issuer: h.issuer, ticker, marginPct: vd.marginPct, inStrikeZone: vd.inStrikeZone, bucket: vd.bucket });
      continue; // 信心闸
    }
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
  const byMargin = (a: CheapHolding, b: CheapHolding) => {
    if (a.marginPct == null && b.marginPct == null) return 0;
    if (a.marginPct == null) return 1;
    if (b.marginPct == null) return -1;
    return b.marginPct - a.marginPct;
  };
  cheap.sort(byMargin);
  pending.sort(byMargin);
  return { covered, strikeCount, belowCount, cheap, pending, asOf };
}

/** 击球区的待确认持仓名(原始 issuer,调用方自行 cleanIssuer)。底部 handoff 讲击球区,below-待确认不进。 */
export function strikePendingIssuers(posture: ValuationPosture): string[] {
  return posture.pending.filter((p) => p.inStrikeZone).map((p) => p.issuer);
}

/** 估值姿态引语。分母 covered 只含估值无红旗的持仓,句中照实写明;待确认另计。 */
export function postureLeadIn(posture: ValuationPosture, lang: Lang): string {
  const cheap = posture.cheap.length;
  const strike = posture.strikeCount;
  const pending = posture.pending.length;
  const asOf = posture.asOf;
  if (lang === "zh") {
    // 不写「这只基金」:伯克希尔、Daily Journal 等不是基金。
    const head = `该组合的 ${posture.covered} 只估值无红旗的美股持仓中，`;
    const body = cheap > 0
      ? `有 ${cheap} 只现价低于内在价值${strike > 0 ? `（其中 ${strike} 只落在击球区）` : ""}`
      : "没有现价低于内在价值的";
    return `${head}${body}${pending > 0 ? `；另有 ${pending} 只待确认` : ""}${asOf ? `（估值截至 ${asOf}）` : ""}：`;
  }
  const head = `Of ${posture.covered} valued US positions without red flags, `;
  const body = cheap > 0
    ? `${cheap} trade below intrinsic value${strike > 0 ? ` (${strike} in the strike zone)` : ""}`
    : "none trade below intrinsic value";
  return `${head}${body}${pending > 0 ? `; ${pending} more pending` : ""}${asOf ? ` (as of ${asOf})` : ""}:`;
}
