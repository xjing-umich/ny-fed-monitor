import type { DailyClose, PriceProvider, SplitEvent } from "./types";
import { toYahooSymbol } from "./symbol";

type YahooChartJson = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        gmtoffset?: number;
        currentTradingPeriod?: { regular?: { start?: number; end?: number } };
      };
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

/**
 * 近几日日线 + 「当日已收盘但日线尚未落地」的那一根。
 *
 * 为什么:收盘后数小时内,chart 的当日日线 close 仍为 null(或整根缺席),而 meta.regularMarketPrice
 * 已是收盘价。只取日线 → 价格系统性晚一个交易日(2026-10 实测:周五晚跑的价格任务写的是周四,
 * 周一的估值用周四价)。故当 meta 的成交时刻已是「本场结束后」且日期新于最后一根日线时,
 * 以 meta 价补出当日这根。日期按交易所本地时区(gmtoffset)取,不用 UTC。
 * 盘中(本场尚未结束)不补:盘中价不是收盘价。
 */
export function parseYahooRecent(json: YahooChartJson, ticker: string, nowSec = Math.floor(Date.now() / 1000)): DailyClose[] {
  const rows = parseYahooChart(json, ticker);
  const meta = json?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  const t = Number(meta?.regularMarketTime);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(t)) return rows;
  const session = meta?.currentTradingPeriod?.regular;
  const start = Number(session?.start), end = Number(session?.end);
  // 成交时刻早于「当前/下一场」开盘 → 属于已结束的上一场;或当前场已收盘。
  const sessionOver = (Number.isFinite(start) && t < start) || (Number.isFinite(end) && nowSec >= end);
  if (!sessionOver) return rows;
  const date = new Date((t + (Number(meta?.gmtoffset) || 0)) * 1000).toISOString().slice(0, 10);
  const last = rows[rows.length - 1];
  if (last && date <= last.date) return rows;
  return [...rows, { ticker: ticker.trim().toUpperCase(), date, close: price, currency: meta?.currency ?? "USD", source: "yahoo" }];
}

export function parseYahooLatest(json: YahooChartJson, ticker: string, nowSec?: number): DailyClose | null {
  const rows = parseYahooRecent(json, ticker, nowSec);
  return rows.length ? rows[rows.length - 1] : null;
}

type YahooSplitsJson = {
  chart?: { result?: Array<{ events?: { splits?: Record<string, { date?: number; numerator?: number; denominator?: number }> } }> };
};

// 解析 chart.result[0].events.splits → SplitEvent[]。无 events / 退化输入 → []。
export function parseYahooSplits(json: unknown, ticker: string): SplitEvent[] {
  const splits = (json as YahooSplitsJson)?.chart?.result?.[0]?.events?.splits;
  if (!splits || typeof splits !== "object") return [];
  const T = ticker.trim().toUpperCase();
  const out: SplitEvent[] = [];
  for (const ev of Object.values(splits)) {
    const num = Number(ev?.numerator);
    const den = Number(ev?.denominator);
    const epoch = Number(ev?.date);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0 || num <= 0) continue;
    if (!Number.isFinite(epoch)) continue;
    const split_date = new Date(epoch * 1000).toISOString().slice(0, 10);
    out.push({ ticker: T, split_date, ratio: num / den });
  }
  return out;
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

  /** 近 5 个交易日(含 meta 补出的当日收盘)。日更任务整段 upsert,漏掉的日子下一轮自动补齐。 */
  async fetchRecent(ticker: string): Promise<DailyClose[]> {
    const sym = toYahooSymbol(ticker);
    const url = `${CHART_URL}${encodeURIComponent(sym)}?interval=1d&range=5d`;
    const res = await this.fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return [];
    return parseYahooRecent(await res.json(), ticker);
  }

  async fetchDaily(ticker: string): Promise<DailyClose | null> {
    const rows = await this.fetchRecent(ticker);
    return rows.length ? rows[rows.length - 1] : null;
  }

  async fetchSplits(ticker: string, sinceYears = 2): Promise<SplitEvent[]> {
    const sym = toYahooSymbol(ticker);
    const range = `${Math.max(1, Math.ceil(sinceYears))}y`;
    const url = `${CHART_URL}${encodeURIComponent(sym)}?interval=1d&range=${range}&events=splits`;
    const res = await this.fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return [];
    return parseYahooSplits(await res.json(), ticker);
  }
}
