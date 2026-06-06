import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";

export type LatestPrice = { close: number; date: string; currency: string };

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
    .from("prices").select("close,date,currency").eq("ticker", ticker)
    .order("date", { ascending: false }).limit(1);
  if (error) { console.error(`getLatestPrice(${ticker}) 失败: ${error.message}`); return null; }
  const r = data?.[0];
  return r ? { close: Number(r.close), date: r.date, currency: r.currency ?? "USD" } : null;
});
