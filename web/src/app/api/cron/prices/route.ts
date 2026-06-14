import { isAuthorizedIngestRequest, unauthorizedResponse } from "@/lib/ingestion/auth";
import { databaseNotConfigured } from "@/lib/ingestion/routes";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";
import { defaultProviders, resolveDaily, type DailyClose } from "@/lib/prices/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 有界并发：1884 票顺序拉会超 300s；5 路并发约 ~120s 稳落上限内。
// Yahoo 不官方, 并发保守取 5 以免触发 429（保守优于丢数据）。
const CONCURRENCY = 5;

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedIngestRequest(request)) return unauthorizedResponse();
  if (!hasSupabaseEnv()) return databaseNotConfigured();

  const db = getDb();
  const { data: run } = await db.from("price_ingest_runs")
    .insert({ run_type: "daily", status: "running" }).select("id").single();
  const runId = run?.id;

  try {
    const tickers: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("securities").select("ticker").range(from, from + 999);
      if (error) throw new Error(`securities read: ${error.message}`);
      if (!data?.length) break;
      tickers.push(...data.map((r: { ticker: string }) => r.ticker));
      if (data.length < 1000) break;
    }

    const providers = defaultProviders();
    let skipped = 0, fallback = 0;
    const collected: DailyClose[] = [];

    // 工作池：CONCURRENCY 个 worker 抢同一游标(idx++ 单线程原子, 不会重号)。
    let idx = 0;
    async function worker() {
      while (idx < tickers.length) {
        const ticker = tickers[idx++];
        const d = await resolveDaily(ticker, providers).catch(() => null);
        if (!d) { skipped++; continue; }
        if (d.source !== "yahoo") fallback++;
        collected.push(d);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tickers.length) }, () => worker()));

    // 收尾批量 upsert（避免并发期共享数组 flush 竞态）。
    const asOf = new Date().toISOString();
    let written = 0;
    for (let i = 0; i < collected.length; i += 500) {
      const chunk = collected.slice(i, i + 500).map((d) => ({
        ticker: d.ticker, date: d.date, close: d.close, currency: d.currency, source: d.source, as_of: asOf,
      }));
      const { error } = await db.from("prices").upsert(chunk, { onConflict: "ticker,date" });
      if (error) { console.warn(`prices upsert err: ${error.message}`); continue; }
      written += chunk.length;
    }

    if (runId) await db.from("price_ingest_runs").update({
      status: "success", rows_written: written, tickers_total: tickers.length,
      tickers_filled_by_fallback: fallback, finished_at: new Date().toISOString(),
    }).eq("id", runId);

    return Response.json({ ok: true, total: tickers.length, written, skipped, fallback });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId) await db.from("price_ingest_runs").update({
      status: "error", error_message: msg, finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return Response.json({ ok: false, message: msg }, { status: 500 });
  }
}
