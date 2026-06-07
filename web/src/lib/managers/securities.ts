import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";

export type CusipMapRow = { cusip: string; ticker: string | null; issuer: string | null };
export type CusipInfo = { ticker: string | null; name: string | null };

/** 纯映射(单测): 行数组 → cusip Map。 */
export function rowsToCusipMap(rows: CusipMapRow[]): Map<string, CusipInfo> {
  const m = new Map<string, CusipInfo>();
  for (const r of rows) m.set(r.cusip, { ticker: r.ticker, name: r.issuer });
  return m;
}

/** 全量 cusip→info Map。无 Supabase env(本地 JSON 开发) → 空 Map(优雅降级)。每次渲染缓存一次。 */
export const getCusipMap = cache(async (): Promise<Map<string, CusipInfo>> => {
  if (!hasSupabaseEnv()) return new Map();
  const db = getDb();
  const rows: CusipMapRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("security_cusips").select("cusip,ticker,issuer").range(from, from + 999);
    if (error) {
      // 数据准确性: 不静默吞错——读失败时记录, 让退化为空 Map 这件事可见。
      console.error(`getCusipMap: security_cusips 读取在 offset ${from} 失败: ${error.message}`);
      break;
    }
    if (!data?.length) break;
    rows.push(...(data as CusipMapRow[]));
    if (data.length < 1000) break;
  }
  return rowsToCusipMap(rows);
});

/**
 * ticker → 该 ticker 下的全部 cusip(用于按 ticker 聚合持有人)。无 env → []。
 * 从已缓存的全量 getCusipMap 派生,而非再发一次 DB 查询——个股页本就需要 getCusipMap
 * (做 cusip→ticker 重定向),复用它可省掉一次重复往返。cache() 再对同 ticker 去重。
 */
export const tickerToCusips = cache(async (ticker: string): Promise<string[]> => {
  const map = await getCusipMap();
  if (map.size === 0) return [];
  const out: string[] = [];
  for (const [cusip, info] of map) {
    if (info.ticker === ticker) out.push(cusip);
  }
  return out;
});
