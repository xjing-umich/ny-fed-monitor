import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";
import type { HeldRow, MoveRow, MoveKind, NotableMoves } from "@/lib/aggregations";

type HeldDbRow = { ticker: string; issuer: string; holder_count: number; total_value: number };
type MoveDbRow = { ticker: string; direction: string; issuer: string; manager_count: number; net_value: number; dominant_kind?: string | null };

/** 纯映射(单测): consensus_holdings 行 → HeldRow(cusip 字段填 ticker)。 */
export function mapHeldRows(rows: HeldDbRow[]): HeldRow[] {
  return rows.map((r) => ({ cusip: r.ticker, issuer: r.issuer, holderCount: r.holder_count, totalValue: Number(r.total_value) }));
}
/** 纯映射(单测): consensus_moves 行 → {mostBought, mostSold}。 */
export function mapMoveRows(rows: MoveDbRow[]): NotableMoves {
  const VALID: MoveKind[] = ["new", "increased", "exited", "decreased"];
  const toRow = (r: MoveDbRow): MoveRow => {
    const dk = (r.dominant_kind && VALID.includes(r.dominant_kind as MoveKind))
      ? (r.dominant_kind as MoveKind)
      : (r.direction === "bought" ? "increased" : "decreased"); // conservative weak default
    return { cusip: r.ticker, issuer: r.issuer, count: r.manager_count, value: Number(r.net_value), dominantKind: dk };
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

type HolderCountDbRow = { ticker: string; holder_count: number };

/** 纯映射(单测): consensus_holdings 行 → ticker(大写)→holder_count Map。 */
export function mapHolderCountRows(rows: HolderCountDbRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.ticker.toUpperCase(), Number(r.holder_count));
  return out;
}

/**
 * 按持仓 ticker 批量取"该票被几位超投持有"(consensus_holdings.holder_count)。
 * 与 readValuationVerdicts 同范式: 单次 .in() 查、零 per-ticker 扇出。
 * 空入参 / 无 env / 出错 → 空 Map(优雅降级, 不阻断渲染)。
 * 注意: 绝不用 readConsensusHeld(limit)(只返回 Top-N, 投资人持仓常落在外)。
 */
export const readHolderCounts = cache(async (tickers: string[]): Promise<Map<string, number>> => {
  if (!hasSupabaseEnv() || tickers.length === 0) return new Map();
  const upper = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const { data, error } = await getDb()
    .from("consensus_holdings").select("ticker,holder_count").in("ticker", upper);
  if (error) { console.error(`readHolderCounts 失败: ${error.message}`); return new Map(); }
  return mapHolderCountRows((data ?? []) as HolderCountDbRow[]);
});

export type StockHolderApp = {
  cik: string; slug: string; person: string; issuer: string;
  value: number; shares: number; weight: number; priorWeight: number | undefined;
  kind: "new" | "increased" | "decreased" | "exited" | null;
  period: string | null; filedAt: string | null;
};
type StockHolderDbRow = { cik: string; slug: string; person: string; issuer: string | null; value: number; shares: number; weight: number; prior_weight: number | null; kind: string | null; period: string | null; filed_at: string | null };

/**
 * 读某 ticker 的持有人快照(consensus_stock_holders),取代个股页对 34 户的逐户扇出。
 * 无 env / 出错 / 表未迁移(42P01)→ null;表存在但该 ticker 无行 → []。
 * 调用方:仅当返回非空数组才走快路径,null/[] 一律回退逐户扫描(故部署前/空表零回归)。
 */
export const readStockHolders = cache(async (ticker: string): Promise<StockHolderApp[] | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("consensus_stock_holders")
    .select("cik,slug,person,issuer,value,shares,weight,prior_weight,kind,period,filed_at")
    .eq("ticker", ticker);
  if (error) {
    // 42P01 = undefined_table: 尚未跑 migration → 静默回退(逐户扫描)。
    if (error.code !== "42P01") console.error(`readStockHolders 失败: ${error.message}`);
    return null;
  }
  const VALID = new Set(["new", "increased", "decreased", "exited"]);
  return (data ?? []).map((r: StockHolderDbRow) => ({
    cik: r.cik, slug: r.slug, person: r.person, issuer: r.issuer ?? "",
    value: Number(r.value), shares: Number(r.shares), weight: Number(r.weight),
    priorWeight: r.prior_weight == null ? undefined : Number(r.prior_weight),
    kind: (r.kind && VALID.has(r.kind) ? r.kind : null) as StockHolderApp["kind"],
    period: r.period, filedAt: r.filed_at,
  }));
});

/**
 * 读某 ticker 的持有人数趋势(consensus_stock_trend),按 period 升序、取最近 8 季的人数数组。
 * 无 env / 出错 / 表未迁移(42P01)→ null;调用方回退到逐户扫描历史。
 */
export const readStockTrend = cache(async (ticker: string): Promise<number[] | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("consensus_stock_trend")
    .select("period,holder_count")
    .eq("ticker", ticker)
    .order("period", { ascending: true });
  if (error) {
    if (error.code !== "42P01") console.error(`readStockTrend 失败: ${error.message}`);
    return null;
  }
  return ((data ?? []) as { period: string; holder_count: number }[]).slice(-8).map((r) => Number(r.holder_count));
});

/** 读 notable-moves 快照。无 env → null。 */
export const readConsensusMoves = cache(async (limit: number): Promise<NotableMoves | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("consensus_moves").select("ticker,direction,issuer,manager_count,net_value,dominant_kind")
    .order("manager_count", { ascending: false }).order("net_value", { ascending: false });
  if (error) {
    // 42703 = undefined_column: dominant_kind 尚未迁移 → 静默回退到内存扫描(标签更准, 含 NEW/EXIT)。
    // 迁移后(alter table consensus_moves add column dominant_kind text; npm run consensus)自动启用 DB 快路径。
    if (error.code !== "42703") console.error(`readConsensusMoves 失败: ${error.message}`);
    return null;
  }
  const all = mapMoveRows((data ?? []) as MoveDbRow[]);
  return { mostBought: all.mostBought.slice(0, limit), mostSold: all.mostSold.slice(0, limit) };
});
