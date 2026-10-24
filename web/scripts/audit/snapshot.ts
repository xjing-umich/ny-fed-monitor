/**
 * 数据审计 · 只读快照:把生产库审计要用的表拉到本地 JSON。
 *
 * 只读靠 fetch 守卫强制,而不是靠自觉:只放行 GET/HEAD,以及对白名单只读 RPC 的 POST;
 * 其余请求(insert/update/upsert/delete、其它 RPC)在发出前直接抛错。
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { effectiveMovesPeriod } from "../../src/lib/freshness/derive";

const READONLY_RPCS = new Set(["manager_index", "manager_qoq"]);

export function readOnlyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const rpc = /\/rest\/v1\/rpc\/([^/?]+)$/.exec(url.pathname)?.[1];
  const ok = method === "GET" || method === "HEAD" || (method === "POST" && rpc != null && READONLY_RPCS.has(rpc));
  if (!ok) throw new Error(`审计只读守卫拦截了 ${method} ${url.pathname}`);
  return fetch(input, init);
}

type Db = ReturnType<typeof createClient>;

export function readOnlyClient(url: string, key: string): Db {
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: readOnlyFetch },
    realtime: { transport: WebSocket as unknown as never },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = (q: any) => any;

async function readAll(db: Db, table: string, cols: string, orderKey: string, filter: Filter = (q) => q): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(db.from(table).select(cols)).order(orderKey, { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

const TABLES: Array<[string, string, string]> = [
  ["managers", "*", "cik"],
  ["filings", "*", "id"],
  ["holdings", "id,filing_id,cusip,issuer,title_of_class,value,shares,put_call,weight", "id"],
  ["security_cusips", "cusip,ticker,issuer,resolved,source", "cusip"],
  ["securities", "ticker,name,exchange,sector,security_type,ads_ratio,primary_cusip,source,as_of", "ticker"],
  ["consensus_holdings", "*", "ticker"],
  ["consensus_stock_holders", "ticker,cik,slug,value,shares,weight,prior_weight,kind,period,filed_at,computed_at", "ticker"],
  ["valuation_snapshot", "ticker,verdict_bucket,in_strike_zone,range_lo,range_hi,price,price_date,margin_pct,coverage,reliable,computed_at,basis:payload->fundamental_basis", "ticker"],
  ["company_fundamentals_latest", "*", "ticker"],
  ["sec_companies", "ticker,cik,company_name,sic,fiscal_year_end,is_foreign_issuer,updated_at", "ticker"],
  ["company_fundamentals_periods", "ticker,cik,form,fiscal_year,fiscal_period,period_end,filing_date,revenue,gross_profit,operating_income,net_income,eps_diluted,shares_diluted,operating_cash_flow,capex,free_cash_flow,total_assets,total_liabilities,shareholders_equity,data_quality,updated_at", "id"],
  ["stock_splits", "*", "ticker"],
  ["market_rates", "*", "series_id"],
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(s + "T00:00:00Z") + n * 86400000));

async function priceCount(db: Db, date: string): Promise<number> {
  const { count, error } = await db.from("prices").select("ticker", { count: "exact", head: true }).eq("date", date);
  if (error) throw new Error(`prices count ${date}: ${error.message}`);
  return count ?? 0;
}

/**
 * 最近 3 个交易日:从今天往回数 14 个日历日,逐日计数(按日查询避开区间扫描超时),
 * 行数 ≥ 窗口内最大值一半的日子才算完整交易日(当天收盘前的半截数据不算)。
 */
async function recentTradingDays(db: Db, today: string): Promise<{ days: string[]; counts: Record<string, number> }> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, -i);
    const n = await priceCount(db, d);
    if (n > 0) counts[d] = n;
  }
  const max = Math.max(0, ...Object.values(counts));
  const days = Object.keys(counts).filter((d) => counts[d] >= max / 2).sort().reverse().slice(0, 3);
  return { days, counts };
}

async function pricesOn(db: Db, date: string): Promise<Row[]> {
  return readAll(db, "prices", "ticker,date,close,currency,source", "ticker", (q) => q.eq("date", date));
}

export type SnapshotMeta = {
  fetchedAt: string;
  supabaseHost: string;
  rows: Record<string, number>;
  tradingDays: string[];
  quarterEnd: string | null;
  quarterWindow: string[];
};

/** 拉一份完整快照到 dir;返回元信息(同时写到 dir/_meta.json)。 */
export async function takeSnapshot(db: Db, dir: string, supabaseHost: string, log: (s: string) => void): Promise<SnapshotMeta> {
  fs.mkdirSync(dir, { recursive: true });
  const rows: Record<string, number> = {};
  const save = (name: string, data: unknown[]) => {
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data));
    rows[name] = data.length;
    log(`  ${name} ${data.length}`);
  };
  const fetchedAt = new Date().toISOString();
  let filings: Row[] = [];
  for (const [t, cols, order] of TABLES) {
    const data = await readAll(db, t, cols, order);
    if (t === "filings") filings = data;
    save(t, data);
  }
  for (const fn of READONLY_RPCS) {
    const { data, error } = await db.rpc(fn);
    if (error) throw new Error(`rpc ${fn}: ${error.message}`);
    save(`rpc_${fn}`, data as unknown[]);
  }

  // 价格窗口:最近 3 个交易日 + 最近一个 13F 基准季末前后各 3 个日历日。
  // 基准季用站内同一口径(effectiveMovesPeriod):申报截止前少数人早交的下一季不算,否则季末核对只剩一两家。
  const { days } = await recentTradingDays(db, iso(new Date()));
  const latestPeriod = new Map<string, string>();
  for (const f of filings) if (!latestPeriod.has(f.cik) || f.period > latestPeriod.get(f.cik)!) latestPeriod.set(f.cik, f.period);
  const quarterEnd = effectiveMovesPeriod([...latestPeriod.values()], new Date()).period;
  const quarterWindow = quarterEnd ? [-3, -2, -1, 0, 1, 2, 3].map((n) => addDays(quarterEnd, n)) : [];
  const prices: Row[] = [];
  for (const d of [...new Set([...days, ...quarterWindow])]) {
    const ps = await pricesOn(db, d);
    if (ps.length) log(`  prices ${d} ${ps.length}`);
    prices.push(...ps);
  }
  save("prices", prices);

  const meta: SnapshotMeta = { fetchedAt, supabaseHost, rows, tradingDays: days, quarterEnd, quarterWindow };
  fs.writeFileSync(path.join(dir, "_meta.json"), JSON.stringify(meta, null, 2));
  return meta;
}
