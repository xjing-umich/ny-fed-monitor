import { deriveFusionSignal, CONSENSUS_MIN } from "./fusionSignal";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m);
}
const v = (o: Partial<SnapshotVerdict>): SnapshotVerdict => ({
  ticker: "X", bucket: "within", inStrikeZone: false, rangeLo: 1, rangeHi: 2,
  price: 1.5, priceDate: "2026-01-01", marginPct: 0, coverage: "full",
  reliable: true, computedAt: "2026-01-01", ...o,
} as SnapshotVerdict);

// 1) 便宜档 rank < 带内 < 高于
{
  const cheap = deriveFusionSignal({ holderCount: 3, verdict: v({ inStrikeZone: true }) }).attractivenessRank;
  const within = deriveFusionSignal({ holderCount: 3, verdict: v({ bucket: "within" }) }).attractivenessRank;
  const above = deriveFusionSignal({ holderCount: 3, verdict: v({ bucket: "above" }) }).attractivenessRank;
  assert(cheap < within && within < above, "便宜 < 带内 < 高于");
}
// 2) 同档内 holderCount 高者靠前(rank 更小)
{
  const many = deriveFusionSignal({ holderCount: 20, verdict: v({ inStrikeZone: true }) }).attractivenessRank;
  const few = deriveFusionSignal({ holderCount: 4, verdict: v({ inStrikeZone: true }) }).attractivenessRank;
  assert(many < few, "同档 holderCount 高者 rank 更小(靠前)");
}
// 3) 未确认便宜(reliable=false)不算便宜档,降到带内权重
{
  const unconf = deriveFusionSignal({ holderCount: 10, verdict: v({ inStrikeZone: true, reliable: false }) });
  const within = deriveFusionSignal({ holderCount: 10, verdict: v({ bucket: "within" }) });
  assert(unconf.attractivenessRank === within.attractivenessRank, "未确认便宜=带内权重");
  assert(unconf.isCheapConsensus === false, "未确认便宜 → 非顶层");
}
// 4) isCheapConsensus 阈值
{
  assert(deriveFusionSignal({ holderCount: CONSENSUS_MIN, verdict: v({ inStrikeZone: true }) }).isCheapConsensus === true, "≥门槛 ∧ 便宜 → 顶层");
  assert(deriveFusionSignal({ holderCount: CONSENSUS_MIN - 1, verdict: v({ inStrikeZone: true }) }).isCheapConsensus === false, "低于门槛 → 非顶层");
  assert(deriveFusionSignal({ holderCount: 50, verdict: v({ bucket: "below" }) }).isCheapConsensus === true, "below 档也算便宜");
  assert(deriveFusionSignal({ holderCount: 50, verdict: v({ bucket: "above" }) }).isCheapConsensus === false, "高于价值 → 非顶层");
}
// 5) 隐含预期档透传
{
  const withTier = deriveFusionSignal({ holderCount: 3, verdict: v({ expectations: { assessable: true, tier: "demanding" } as any }) });
  assert(withTier.impliedTier === "demanding", "expectations 可评估 → 透传 tier");
  const noTier = deriveFusionSignal({ holderCount: 3, verdict: v({ expectations: { assessable: false } as any }) });
  assert(noTier.impliedTier === undefined, "expectations 不可评估 → 省略");
}
// 6) 缺 verdict 降级不崩,落末档
{
  const none = deriveFusionSignal({ holderCount: 0, verdict: undefined });
  assert(Number.isFinite(none.attractivenessRank) && none.isCheapConsensus === false && none.impliedTier === undefined, "缺 verdict → 落末档,不崩");
  const above = deriveFusionSignal({ holderCount: 0, verdict: v({ bucket: "above" }) });
  assert(none.attractivenessRank > above.attractivenessRank, "无估值排在高于价值之后");
}
console.log(process.exitCode ? "SOME TESTS FAILED" : "ALL PASS");
