import { defaultProviders, resolveDaily, type DailyClose } from "../../src/lib/prices/providers/index.js";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

type PriceRow = { ticker: string; date: string; close: number; currency: string; source: string; as_of: string };

/**
 * 读 securities 全部 ticker, 按 [Yahoo, Eastmoney] 顺序取最新 EOD, upsert prices。
 * 小间隔礼貌拉取。返回统计（fallback = 非主源 Yahoo 命中的票数）。
 */
export async function updatePrices(
  db: any,
  opts: { throttleMs?: number } = {},
): Promise<{ total: number; written: number; skipped: number; fallback: number }> {
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
  for (const ticker of tickers) {
    const d: DailyClose | null = await resolveDaily(ticker, providers);
    if (!d) { skipped++; await sleep(throttle); continue; }
    if (d.source !== "yahoo") fallback++;
    rows.push({ ticker, date: d.date, close: d.close, currency: d.currency, source: d.source, as_of: new Date().toISOString() });
    written++;
    if (rows.length >= 200) await flush(db, rows.splice(0));
    await sleep(throttle);
  }
  if (rows.length) await flush(db, rows.splice(0));
  return { total: tickers.length, written, skipped, fallback };
}

async function flush(db: any, rows: PriceRow[]): Promise<void> {
  const { error } = await db.from("prices").upsert(rows, { onConflict: "ticker,date" });
  if (error) console.warn(`prices upsert err: ${error.message}`);
}
