import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";
import type { HeldRow, MoveRow, MoveKind, NotableMoves } from "@/lib/aggregations";

type HeldDbRow = { ticker: string; issuer: string; holder_count: number; total_value: number };
type MoveDbRow = { ticker: string; direction: string; issuer: string; manager_count: number; net_value: number };

/** 纯映射(单测): consensus_holdings 行 → HeldRow(cusip 字段填 ticker)。 */
export function mapHeldRows(rows: HeldDbRow[]): HeldRow[] {
  return rows.map((r) => ({ cusip: r.ticker, issuer: r.issuer, holderCount: r.holder_count, totalValue: Number(r.total_value) }));
}
/** 纯映射(单测): consensus_moves 行 → {mostBought, mostSold}。 */
export function mapMoveRows(rows: MoveDbRow[]): NotableMoves {
  const toRow = (r: MoveDbRow): MoveRow => {
    const dominantKind: MoveKind = r.direction === "bought" ? "new" : "exited";
    return { cusip: r.ticker, issuer: r.issuer, count: r.manager_count, value: Number(r.net_value), dominantKind };
  };
  return {
    mostBought: rows.filter((r) => r.direction === "bought").map(toRow),
    mostSold: rows.filter((r) => r.direction === "sold").map(toRow),
  };
}

/** 读 most-held 快照(已按 holder_count 排序)。无 env → null(调用方回退扫描)。 */
export const readConsensusHeld = cache(async (limit: number): Promise<HeldRow[] | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("consensus_holdings").select("ticker,issuer,holder_count,total_value")
    .order("holder_count", { ascending: false }).order("total_value", { ascending: false }).limit(limit);
  if (error) { console.error(`readConsensusHeld 失败: ${error.message}`); return null; }
  return mapHeldRows((data ?? []) as HeldDbRow[]);
});

/** 读 notable-moves 快照。无 env → null。 */
export const readConsensusMoves = cache(async (limit: number): Promise<NotableMoves | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("consensus_moves").select("ticker,direction,issuer,manager_count,net_value")
    .order("manager_count", { ascending: false }).order("net_value", { ascending: false });
  if (error) { console.error(`readConsensusMoves 失败: ${error.message}`); return null; }
  const all = mapMoveRows((data ?? []) as MoveDbRow[]);
  return { mostBought: all.mostBought.slice(0, limit), mostSold: all.mostSold.slice(0, limit) };
});
