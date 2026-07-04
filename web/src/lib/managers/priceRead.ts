import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";

export type LatestPrice = { close: number; date: string; currency: string; source?: string; stale?: boolean };
export type PricePoint = { date: string; close: number };

/** 价格视为陈旧的最大时龄(天)。超过此天数的最新价不应被当作"现价"喂估值。 */
export const PRICE_MAX_AGE_DAYS = 10;

/** 纯判定: date 相对 today 是否超过 maxDays 天(陈旧)。 */
export function isPriceStale(date: string, today: Date, maxDays = PRICE_MAX_AGE_DAYS): boolean {
  const d = new Date(date + "T00:00:00Z").getTime();
  return (today.getTime() - d) / 86_400_000 > maxDays;
}

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
