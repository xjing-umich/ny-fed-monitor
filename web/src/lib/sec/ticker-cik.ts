import { SEC_WWW_BASE, secFetchJson } from "./sec-client";
import { normalizeTicker } from "./company-universe";

type SecTickerMapRow = {
  cik_str: number;
  ticker: string;
  title: string;
};

export type TickerCikMatch = {
  ticker: string;
  normalizedTicker: string;
  cik: string;
  companyName: string;
};

let cachedTickerMap: Map<string, TickerCikMatch> | null = null;

export async function getTickerCikMap() {
  if (cachedTickerMap) return cachedTickerMap;

  const raw = await secFetchJson<Record<string, SecTickerMapRow>>(`${SEC_WWW_BASE}/files/company_tickers.json`);
  const map = new Map<string, TickerCikMatch>();

  for (const row of Object.values(raw)) {
    const normalizedTicker = normalizeTicker(row.ticker);
    const match = {
      ticker: row.ticker.toUpperCase(),
      normalizedTicker,
      cik: String(row.cik_str).padStart(10, "0"),
      companyName: row.title
    };
    map.set(normalizedTicker, match);
    map.set(row.ticker.toUpperCase(), match);
    map.set(row.ticker.toUpperCase().replace("-", "."), match);
  }

  cachedTickerMap = map;
  return map;
}

export async function resolveTickerCik(ticker: string) {
  const map = await getTickerCikMap();
  return map.get(normalizeTicker(ticker)) ?? map.get(ticker.trim().toUpperCase()) ?? null;
}
