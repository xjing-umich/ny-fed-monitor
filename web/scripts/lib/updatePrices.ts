import { parseQuote, type FinnhubQuote } from "../../src/lib/prices/finnhub";

const QUOTE_URL = "https://finnhub.io/api/v1/quote";
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchQuote(symbol: string, key: string): Promise<FinnhubQuote | null> {
  const res = await fetch(`${QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${key}`);
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) return null;
  return (await res.json()) as FinnhubQuote;
}

/**
 * 读 securities 全部真 ticker, 逐个拉 Finnhub /quote, upsert (ticker,date,close)。
 * 免费档 60/min → 每次 ~1.1s 间隔。429 退避重试一次。返回统计。
 */
export async function updatePrices(db: any, key: string): Promise<{ total: number; written: number; skipped: number }> {
  const tickers: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("securities").select("ticker").range(from, from + 999);
    if (error) throw new Error(`securities read: ${error.message}`);
    if (!data?.length) break;
    tickers.push(...data.map((r: { ticker: string }) => r.ticker));
    if (data.length < 1000) break;
  }

  let written = 0, skipped = 0;
  const rows: { ticker: string; date: string; close: number; source: string }[] = [];
  for (const ticker of tickers) {
    let q: FinnhubQuote | null = null;
    try {
      q = await fetchQuote(ticker, key);
    } catch (e) {
      if (e instanceof Error && e.message === "RATE_LIMIT") { await sleep(5000); try { q = await fetchQuote(ticker, key); } catch { q = null; } }
    }
    const parsed = q ? parseQuote(q) : null;
    if (!parsed) { skipped++; await sleep(1100); continue; }
    rows.push({ ticker, date: parsed.date, close: parsed.close, source: "finnhub" });
    written++;
    if (rows.length >= 200) { await flush(db, rows.splice(0)); }
    await sleep(1100); // 免费档 60/min
  }
  if (rows.length) await flush(db, rows.splice(0));
  return { total: tickers.length, written, skipped };
}

async function flush(db: any, rows: { ticker: string; date: string; close: number; source: string }[]): Promise<void> {
  const { error } = await db.from("prices").upsert(rows, { onConflict: "ticker,date" });
  if (error) console.warn(`prices upsert err: ${error.message}`);
}
