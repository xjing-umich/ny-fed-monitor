// quarterSummary.ts — 一位经理本季对上季的汇总(纯函数):按金额判定净买卖、金额最大的几笔、计数、清仓名单。
// 金额按季末价估算(13F 不披露成交价);只算正股,期权名义市值不计。输入的 prior 应已做拆股换算(splitAdjust.ts)。
import type { Holding, HoldingChange } from "./types";

export type QuarterVerdict = "buying" | "selling" | "mixed";
export type QuarterMove = {
  cusip: string;
  issuer: string;
  kind: HoldingChange["kind"];
  flowUsd: number;
  deltaPct: number | null;
  weightAfter: number | null;
  splitFactor?: number;
};
export type QuarterSummary = {
  period: string;
  priorPeriod: string;
  latestValue: number;
  priorValue: number;
  latestCount: number;
  priorCount: number;
  netFlowUsd: number;
  /** 按金额:净额绝对值不到上季正股市值的 FLAT_THRESHOLD → mixed(基本持平)。 */
  verdict: QuarterVerdict;
  /** 旧口径(按只数),列表页在 PR B 切换前沿用。 */
  countVerdict: QuarterVerdict;
  counts: { opened: number; added: number; trimmed: number; exited: number };
  topMoves: QuarterMove[];
  exits: { cusip: string; issuer: string; priorValue: number }[];
};

export const FLAT_THRESHOLD = 0.02;
export const TOP_MOVES = 5;

/** 单笔估算金额:新建 = 本季市值;清仓 = −上季末市值;增减 = 股数变化 × 本季末单价。 */
export function moveFlowUsd(c: HoldingChange): number {
  if (c.kind === "new") return c.value;
  if (c.kind === "exited") return -c.value;
  return c.shares > 0 ? (c.shares - c.prevShares) * (c.value / c.shares) : 0;
}

export function summarizeQuarter(args: { period: string; priorPeriod: string; latest: Holding[]; prior: Holding[]; changes: HoldingChange[] }): QuarterSummary {
  const latest = args.latest.filter((h) => !h.putCall);
  const prior = args.prior.filter((h) => !h.putCall);
  const changes = args.changes.filter((c) => !c.putCall);
  const sum = (hs: Holding[]) => hs.reduce((s, h) => s + h.value, 0);
  const latestValue = sum(latest);
  const priorValue = sum(prior);

  const weight = new Map<string, number>();
  for (const h of latest) weight.set(h.cusip, (weight.get(h.cusip) ?? 0) + (h.weight ?? 0));

  const moves: QuarterMove[] = changes.map((c) => ({
    cusip: c.cusip,
    issuer: c.issuer,
    kind: c.kind,
    flowUsd: moveFlowUsd(c),
    deltaPct: c.deltaPct,
    weightAfter: c.kind === "exited" ? null : weight.get(c.cusip) ?? null,
    ...(c.splitFactor ? { splitFactor: c.splitFactor } : {}),
  }));
  const netFlowUsd = moves.reduce((s, m) => s + m.flowUsd, 0);

  const counts = {
    opened: changes.filter((c) => c.kind === "new").length,
    added: changes.filter((c) => c.kind === "increased").length,
    trimmed: changes.filter((c) => c.kind === "decreased").length,
    exited: changes.filter((c) => c.kind === "exited").length,
  };
  const buys = counts.opened + counts.added;
  const sells = counts.trimmed + counts.exited;
  const countVerdict: QuarterVerdict = buys > sells ? "buying" : sells > buys ? "selling" : "mixed";
  const flat = priorValue > 0 ? Math.abs(netFlowUsd) < FLAT_THRESHOLD * priorValue : netFlowUsd === 0;
  const verdict: QuarterVerdict = flat ? "mixed" : netFlowUsd > 0 ? "buying" : "selling";

  const topMoves = [...moves]
    .sort((a, b) => Math.abs(b.flowUsd) - Math.abs(a.flowUsd) || a.issuer.localeCompare(b.issuer))
    .slice(0, TOP_MOVES);
  const exits = changes
    .filter((c) => c.kind === "exited")
    .map((c) => ({ cusip: c.cusip, issuer: c.issuer, priorValue: c.value }))
    .sort((a, b) => b.priorValue - a.priorValue || a.issuer.localeCompare(b.issuer));

  return {
    period: args.period, priorPeriod: args.priorPeriod, latestValue, priorValue,
    latestCount: latest.length, priorCount: prior.length,
    netFlowUsd, verdict, countVerdict, counts, topMoves, exits,
  };
}
