// splitStore.ts — 拆股系数与季度汇总的落库(共识步骤用)。纯映射 + 一个带过期清理的写入函数。
import type { SplitFactor, SplitFactorLookup } from "../../src/lib/managers/splitAdjust";
import { rescaleToLatestBasis } from "../../src/lib/managers/splitAdjust";
import { computeChanges, type CanonicalKey } from "../../src/lib/managers/assemble";
import { toScanChanges, type ScanChange } from "../../src/lib/consensus/compute";
import type { QuarterSummary } from "../../src/lib/managers/quarterSummary";
import type { Holding } from "../../src/lib/managers/types";

/** 表未迁移判定只在 src/lib/managers/db.ts 定义一份,这里转出给脚本与检查用。 */
export { isMissingTableError as isMissingTable } from "../../src/lib/managers/db";

export function splitRow(f: SplitFactor, computedAt: string) {
  return { cusip: f.cusip, ticker: f.ticker, from_period: f.fromPeriod, to_period: f.toPeriod, factor: f.factor, source: f.source, evidence: f.evidence, computed_at: computedAt };
}

export function summaryRow(cik: string, s: QuarterSummary, computedAt: string, source?: { latestId: number; priorId: number }) {
  return {
    cik, period: s.period, prior_period: s.priorPeriod, latest_value: s.latestValue, prior_value: s.priorValue,
    latest_count: s.latestCount, prior_count: s.priorCount, net_flow_usd: s.netFlowUsd, verdict: s.verdict,
    count_verdict: s.countVerdict, counts: s.counts, top_moves: s.topMoves, exits: s.exits, computed_at: computedAt,
    ...(source ? { latest_filing_id: source.latestId, prior_filing_id: source.priorId } : {}),
  };
}

export type DbHolding = { cusip: string; issuer: string; value: number | string; shares: number | string; weight?: number | string; put_call?: string | null };
export const toHolding = (h: DbHolding): Holding => ({
  cusip: h.cusip, issuer: h.issuer, value: Number(h.value), shares: Number(h.shares),
  weight: h.weight == null ? undefined : Number(h.weight), putCall: h.put_call ?? undefined,
});

/** 两季持仓 → 拆股换算后的共识动作(与投资人页 assembleManagerDetail 同一口径)。 */
export function consensusChangesFor(latestH: DbHolding[], priorH: DbHolding[], latestPeriod: string, priorPeriod: string, lookup: SplitFactorLookup, canon?: CanonicalKey): ScanChange[] {
  const [latest, prior] = rescaleToLatestBasis(
    [{ period: latestPeriod, holdings: latestH.map(toHolding) }, { period: priorPeriod, holdings: priorH.map(toHolding) }],
    lookup,
  );
  return toScanChanges(computeChanges(latest.holdings, prior.holdings, canon));
}

/** 单次事务发布两表;RPC 未迁移时明确失败,不能回退分批双写。 */
export async function publishManagerDerived(
  db: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> },
  splits: object[], summaries: object[], computedAt: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("publish_manager_derived", { p_splits: splits, p_summaries: summaries, p_computed_at: computedAt });
  if (error) throw new Error(`Derived publication failed: ${error.message}${error.code === "PGRST202" ? " — apply 20261029_atomic_derived_publication migration first" : ""}`);
  if (typeof data !== "boolean") throw new Error("Derived publication returned invalid change status");
  return data;
}
