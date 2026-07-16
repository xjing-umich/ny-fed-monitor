import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";
import { PRICE_MAX_AGE_DAYS, isPriceStale } from "@/lib/valuation/priceAge";

export type LatestPrice = { close: number; date: string; currency: string; source?: string; stale?: boolean };
export type PricePoint = { date: string; close: number };

export { PRICE_MAX_AGE_DAYS, isPriceStale };

/** 现价事实展示(纯函数, 单测)。无价→占位。 */
export function fmtPriceFact(p: LatestPrice | null): string {
  if (!p) return "—";
  const sym = p.currency === "USD" ? "$" : "";
  return `${sym}${p.close.toFixed(2)}`;
}

/** 某 ticker 最新一条价格。无 env / 无数据 → null。 */
export const getLatestPrice = cache(async (ticker: string): Promise<LatestPrice | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("prices").select("close,date,currency,source").eq("ticker", ticker)
    .order("date", { ascending: false }).limit(1);
  if (error) { console.error(`getLatestPrice(${ticker}) 失败: ${error.message}`); return null; }
  const r = data?.[0];
  return r
    ? { close: Number(r.close), date: r.date, currency: r.currency ?? "USD", source: r.source, stale: isPriceStale(r.date, new Date()) }
    : null;
});

/** 某 ticker 近 N 天价格历史(升序), 供走势图/历史估值带。无 env/数据→[]。 */
export const getPriceHistory = cache(async (ticker: string, days = 365): Promise<PricePoint[]> => {
  if (!hasSupabaseEnv()) return [];
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await getDb()
    .from("prices").select("date,close").eq("ticker", ticker)
    .gte("date", cutoff).order("date", { ascending: true }).limit(5000);
  if (error) { console.error(`getPriceHistory(${ticker}) 失败: ${error.message}`); return []; }
  return (data ?? []).map((r: { date: string; close: number }) => ({ date: r.date, close: Number(r.close) }));
});

/** 某 ticker 最近一次拆股日期(ISO)。无 env / 无表 / 无行 → null。护栏用。 */
export const getLatestSplit = cache(async (ticker: string): Promise<string | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("stock_splits").select("split_date").eq("ticker", ticker)
    .order("split_date", { ascending: false }).limit(1);
  if (error) { console.error(`getLatestSplit(${ticker}) 失败: ${error.message}`); return null; }
  return data?.[0]?.split_date ?? null;
});
