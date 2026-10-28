// splitStore.ts — 拆股系数与季度汇总的落库(共识步骤用)。纯映射 + 一个带过期清理的写入函数。
import type { SplitFactor, SplitFactorLookup } from "../../src/lib/managers/splitAdjust";
import { rescaleToLatestBasis } from "../../src/lib/managers/splitAdjust";
import { computeChanges } from "../../src/lib/managers/assemble";
import { toScanChanges, type ScanChange } from "../../src/lib/consensus/compute";
import type { QuarterSummary } from "../../src/lib/managers/quarterSummary";
import type { Holding } from "../../src/lib/managers/types";
import { isMissingTableError } from "../../src/lib/managers/db";

/** 表未迁移判定只在 src/lib/managers/db.ts 定义一份,这里转出给脚本与检查用。 */
export { isMissingTableError as isMissingTable } from "../../src/lib/managers/db";

export function splitRow(f: SplitFactor, computedAt: string) {
  return { cusip: f.cusip, ticker: f.ticker, from_period: f.fromPeriod, to_period: f.toPeriod, factor: f.factor, source: f.source, evidence: f.evidence, computed_at: computedAt };
}

export function summaryRow(cik: string, s: QuarterSummary, computedAt: string) {
  return {
    cik, period: s.period, prior_period: s.priorPeriod, latest_value: s.latestValue, prior_value: s.priorValue,
    latest_count: s.latestCount, prior_count: s.priorCount, net_flow_usd: s.netFlowUsd, verdict: s.verdict,
    count_verdict: s.countVerdict, counts: s.counts, top_moves: s.topMoves, exits: s.exits, computed_at: computedAt,
  };
}

export type DbHolding = { cusip: string; issuer: string; value: number | string; shares: number | string; weight?: number | string; put_call?: string | null };
export const toHolding = (h: DbHolding): Holding => ({
  cusip: h.cusip, issuer: h.issuer, value: Number(h.value), shares: Number(h.shares),
  weight: h.weight == null ? undefined : Number(h.weight), putCall: h.put_call ?? undefined,
});

/** 两季持仓 → 拆股换算后的共识动作(与投资人页 assembleManagerDetail 同一口径)。 */
export function consensusChangesFor(latestH: DbHolding[], priorH: DbHolding[], latestPeriod: string, priorPeriod: string, lookup: SplitFactorLookup): ScanChange[] {
  const [latest, prior] = rescaleToLatestBasis(
    [{ period: latestPeriod, holdings: latestH.map(toHolding) }, { period: priorPeriod, holdings: priorH.map(toHolding) }],
    lookup,
  );
  return toScanChanges(computeChanges(latest.holdings, prior.holdings));
}

/**
 * 派生表整表替换:先 upsert 本次全部行(computed_at = 本次时间),再删更早的行。
 * 不先删后写:详情页随时在读,先删会有一段时间读到空表(= 系数 1,假增持短暂复现)。
 * 表未迁移 → "missing"(调用方 warn 跳过);其他错误 THROW(静默失败会让页面继续发错数据)。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function replaceDerivedRows(db: any, table: string, rows: object[], onConflict: string, computedAt: string): Promise<"ok" | "missing"> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (isMissingTableError(error)) return "missing";
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
  const { error } = await db.from(table).delete().lt("computed_at", computedAt);
  if (isMissingTableError(error)) return "missing";
  if (error) throw new Error(`${table} stale delete failed: ${error.message}`);
  return "ok";
}
