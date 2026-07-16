import { defaultProviders, resolveDaily, YahooChartProvider, type DailyClose, type SplitEvent } from "../../src/lib/prices/providers/index.js";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

type PriceRow = { ticker: string; date: string; close: number; currency: string; source: string; as_of: string };

/**
 * 读 securities 全部 ticker, 按 [Yahoo, Eastmoney] 顺序取最新 EOD, upsert prices。
 * 小间隔礼貌拉取。写 price_ingest_runs 记录(供 health-watchdog)。
 * 返回统计（fallback = 非主源 Yahoo 命中的票数）。
 */
export async function updatePrices(
  db: any,
  opts: { throttleMs?: number } = {},
): Promise<{ total: number; written: number; skipped: number; fallback: number }> {
  // 记账: running → success/error。GitHub Actions / 手动 CLI 跑完, watchdog 才看得到。
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
    const throttle = opts.throttleMs ?? 150;

    let written = 0, skipped = 0, fallback = 0;
    const rows: PriceRow[] = [];
    const yahoo = new YahooChartProvider();
    const splitRows: SplitEvent[] = [];
    for (const ticker of tickers) {
      const d: DailyClose | null = await resolveDaily(ticker, providers);
      if (!d) { skipped++; await sleep(throttle); continue; }
      if (d.source !== "yahoo") fallback++;
      rows.push({ ticker, date: d.date, close: d.close, currency: d.currency, source: d.source, as_of: new Date().toISOString() });
      written++;
      const splits = await yahoo.fetchSplits(ticker).catch(() => [] as SplitEvent[]);
      if (splits.length) splitRows.push(...splits);
      if (rows.length >= 200) await flush(db, rows.splice(0));
      await sleep(throttle);
    }
    if (rows.length) await flush(db, rows.splice(0));

    if (splitRows.length) {
      const { error } = await db.from("stock_splits").upsert(
        splitRows.map((s) => ({ ticker: s.ticker, split_date: s.split_date, ratio: s.ratio })),
        { onConflict: "ticker,split_date" },
      );
      if (error) console.warn(`stock_splits upsert err: ${error.message}`);
    }

    if (runId) await db.from("price_ingest_runs").update({
      status: "success", rows_written: written, tickers_total: tickers.length,
      tickers_filled_by_fallback: fallback, finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return { total: tickers.length, written, skipped, fallback };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId) await db.from("price_ingest_runs").update({
      status: "error", error_message: msg, finished_at: new Date().toISOString(),
    }).eq("id", runId);
    throw e;
  }
}

async function flush(db: any, rows: PriceRow[]): Promise<void> {
  const { error } = await db.from("prices").upsert(rows, { onConflict: "ticker,date" });
  if (error) console.warn(`prices upsert err: ${error.message}`);
}
