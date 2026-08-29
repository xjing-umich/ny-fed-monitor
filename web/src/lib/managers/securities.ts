import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";
import { processCached } from "@/lib/managers/processCache";

/** 全表 Map 的进程级缓存时长。取值理由见 processCache.ts。 */
const FULL_TABLE_TTL_MS = 10 * 60 * 1000;

export type CusipMapRow = { cusip: string; ticker: string | null; issuer: string | null };
export type CusipInfo = { ticker: string | null; name: string | null };

/** 纯映射(单测): 行数组 → cusip Map。 */
export function rowsToCusipMap(rows: CusipMapRow[]): Map<string, CusipInfo> {
  const m = new Map<string, CusipInfo>();
  for (const r of rows) m.set(r.cusip, { ticker: r.ticker, name: r.issuer });
  return m;
}

/**
 * 全量 cusip→info Map。无 Supabase env(本地 JSON 开发) → 空 Map(优雅降级)。
 * 两层缓存:processCached 跨请求(同一函数实例内 TTL 复用),cache() 再在单次渲染内去重。
 */
const loadCusipMap = processCached("cusipMap", FULL_TABLE_TTL_MS, async (): Promise<Map<string, CusipInfo>> => {
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

export const getCusipMap = cache(loadCusipMap);

/**
 * ticker → 交易所代码(Google Finance 用, 如 NASDAQ/NYSE)。无 env → 空 Map。
 * 来源 securities.exchange(经 SEC 回填)。同 getCusipMap 两层缓存。
 */
const loadTickerExchangeMap = processCached("tickerExchangeMap", FULL_TABLE_TTL_MS, async (): Promise<Map<string, string>> => {
  if (!hasSupabaseEnv()) return new Map();
  const db = getDb();
  const out = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("securities").select("ticker,exchange").range(from, from + 999);
    if (error) {
      console.error(`getTickerExchangeMap: securities 读取在 offset ${from} 失败: ${error.message}`);
      break;
    }
    if (!data?.length) break;
    for (const r of data as { ticker: string | null; exchange: string | null }[]) {
      if (r.ticker && r.exchange) out.set(r.ticker, r.exchange);
    }
    if (data.length < 1000) break;
  }
  return out;
});

export const getTickerExchangeMap = cache(loadTickerExchangeMap);

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

/** 单票证券元数据:估值层做 ADR/ADS 归一化用。security_type 判是否 ADR,ads_ratio 是每股折合比例。 */
export const getSecurityMeta = cache(
  async (ticker: string): Promise<{ securityType: string | null; adsRatio: number | null }> => {
    if (!hasSupabaseEnv()) return { securityType: null, adsRatio: null };
    const db = getDb();
    const { data, error } = await db
      .from("securities")
      .select("security_type,ads_ratio")
      .eq("ticker", ticker.toUpperCase())
      .maybeSingle();
    if (error || !data) return { securityType: null, adsRatio: null };
    return {
      securityType: (data.security_type as string | null) ?? null,
      adsRatio: (data.ads_ratio as number | null) ?? null,
    };
  },
);
