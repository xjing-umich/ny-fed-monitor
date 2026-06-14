import type { DailyClose, PriceProvider } from "./types";
import { toYahooSymbol } from "./symbol";

type YahooChartJson = {
  chart?: {
    result?: Array<{
      meta?: { currency?: string };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: unknown;
  };
};

// 用未复权 close（与其他源一致, 便于跨源比较 + 对齐当时市值）。
export function parseYahooChart(json: YahooChartJson, ticker: string): DailyClose[] {
  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp;
  const closes = r?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(closes)) return [];
  const T = ticker.trim().toUpperCase();
  const currency = r?.meta?.currency ?? "USD";
  const out: DailyClose[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = Number(closes[i]);
    if (!Number.isFinite(c) || c <= 0) continue;
    const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    out.push({ ticker: T, date, close: c, currency, source: "yahoo" });
  }
  return out;
}

export function parseYahooLatest(json: YahooChartJson, ticker: string): DailyClose | null {
  const rows = parseYahooChart(json, ticker);
  return rows.length ? rows[rows.length - 1] : null;
}

const CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/";
const UA = "Mozilla/5.0 (compatible; CompounderBot/1.0)";

export class YahooChartProvider implements PriceProvider {
  readonly name = "yahoo" as const;
  constructor(private fetchImpl: typeof fetch = fetch) {}

  private async fetchRange(ticker: string, range: string): Promise<DailyClose[]> {
    const sym = toYahooSymbol(ticker);
    const url = `${CHART_URL}${encodeURIComponent(sym)}?interval=1d&range=${range}`;
    const res = await this.fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return [];
    return parseYahooChart(await res.json(), ticker);
  }

  async fetchHistory(ticker: string, sinceYears: number): Promise<DailyClose[]> {
    const range = sinceYears >= 10 ? "max" : `${Math.max(1, Math.ceil(sinceYears))}y`;
    return this.fetchRange(ticker, range);
  }

  async fetchDaily(ticker: string): Promise<DailyClose | null> {
    const rows = await this.fetchRange(ticker, "5d");
    return rows.length ? rows[rows.length - 1] : null;
  }
}
