import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import type { ExpectationsTier } from "@/lib/valuation/types";

export const CONSENSUS_MIN = 5;

export type FusionSignal = {
  attractivenessRank: number;
  isCheapConsensus: boolean;
  impliedTier?: ExpectationsTier;
};

// 位置档权重:便宜(已确认) 0 → 带内/未确认便宜 1 → 高于价值 2 → 无估值 3。
const W_CHEAP = 0, W_WITHIN = 1, W_ABOVE = 2, W_UNVALUED = 3;
const RANK_SCALE = 1_000_000; // 权重主序,holderCount 次序(同档高者靠前)

function isConfirmedCheap(v: SnapshotVerdict): boolean {
  return (v.inStrikeZone || v.bucket === "below") && v.reliable !== false;
}
function bucketWeight(v: SnapshotVerdict | undefined): number {
  if (!v) return W_UNVALUED;
  if (isConfirmedCheap(v)) return W_CHEAP;
  if (v.bucket === "above") return W_ABOVE;
  return W_WITHIN; // 带内,或未确认便宜(reliable=false)
}

export function deriveFusionSignal(input: {
  holderCount: number;
  verdict: SnapshotVerdict | undefined;
}): FusionSignal {
  const { holderCount, verdict } = input;
  const weight = bucketWeight(verdict);
  const attractivenessRank = weight * RANK_SCALE - Math.max(0, holderCount);
  const isCheapConsensus = weight === W_CHEAP && holderCount >= CONSENSUS_MIN;
  const impliedTier = verdict?.expectations?.assessable ? verdict.expectations.tier : undefined;
  return { attractivenessRank, isCheapConsensus, ...(impliedTier ? { impliedTier } : {}) };
}
