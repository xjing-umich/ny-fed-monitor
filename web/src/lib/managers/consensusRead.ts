import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";
import type { HeldRow, MoveRow, MoveKind, NotableMoves } from "@/lib/aggregations";
import { CONSENSUS_MIN_HOLDERS } from "@/lib/aggregations";
import { mapHolderCountRows, type HolderCountDbRow } from "@/lib/managers/holderCounts";

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

/** 共识票计数(holder_count>=CONSENSUS_MIN_HOLDERS)。count-only,零行传输。无 env→null。 */
export const readConsensusCount = cache(async (): Promise<number | null> => {
  if (!hasSupabaseEnv()) return null;
  const { count, error } = await getDb()
    .from("consensus_holdings")
    .select("ticker", { count: "exact", head: true })
    .gte("holder_count", CONSENSUS_MIN_HOLDERS);
  if (error) { console.error(`readConsensusCount 失败: ${error.message}`); return null; }
  return count ?? 0;
});

/** 共识票 Top-n(holder_count>=阈值,已排序)。取代 mostHeld(5000) 过取。无 env→null。 */
export const readConsensusHeldTop = cache(async (n: number): Promise<HeldRow[] | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("consensus_holdings").select("ticker,issuer,holder_count,total_value")
    .gte("holder_count", CONSENSUS_MIN_HOLDERS)
    .order("holder_count", { ascending: false }).order("total_value", { ascending: false })
    .limit(n);
  if (error) { console.error(`readConsensusHeldTop 失败: ${error.message}`); return null; }
  return mapHeldRows((data ?? []) as HeldDbRow[]);
});

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

export type CoOwnershipApp = {
  coTicker: string;
  coIssuer: string;
  sharedHolders: number;
  coTotalValue: number;
};

type CoOwnershipDbRow = { co_ticker: string; co_issuer: string | null; shared_holders: number; co_total_value: number };

/**
 * 个股页"持有 X 的这些人还共同重仓 Y"。无 env / 表未迁移(42P01)/ 出错 / 空 → 返回 []（优雅降级, 不阻断页面）。
 * 无 fallback 即时计算(与快照架构一致; 本地无库时该节不渲染, 可接受)。
 */
export const readCoOwnership = cache(async (ticker: string, limit = 6): Promise<CoOwnershipApp[]> => {
  if (!hasSupabaseEnv()) return [];
  const up = ticker.toUpperCase();
  const { data, error } = await getDb()
    .from("consensus_coownership")
    .select("co_ticker,co_issuer,shared_holders,co_total_value")
    .eq("ticker", up)
    .order("shared_holders", { ascending: false })
    .order("co_total_value", { ascending: false })
    .limit(limit);
  if (error) {
    if (error.code !== "42P01") console.error(`readCoOwnership 失败: ${error.message}`);
    return [];
  }
  return (data ?? [])
    .filter((r: CoOwnershipDbRow) => r.co_ticker && r.co_ticker !== up)
    .map((r: CoOwnershipDbRow) => ({
      coTicker: r.co_ticker,
      coIssuer: r.co_issuer ?? r.co_ticker,
      sharedHolders: Number(r.shared_holders) || 0,
      coTotalValue: Number(r.co_total_value) || 0,
    }));
});
