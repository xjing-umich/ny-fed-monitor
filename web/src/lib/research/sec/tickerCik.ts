import { SEC_TICKER_CIK_URL, secUserAgent } from "./secConfig";
import type { SecCompanyTickerRecord, SecCompanyTickersResponse } from "./types";

let tickerCache: Map<string, SecCompanyTickerRecord> | null = null;

export function padCik(cik: number | string): string {
  return String(cik).replace(/^0+/, "").padStart(10, "0");
}

export function buildTickerMap(payload: SecCompanyTickersResponse): Map<string, SecCompanyTickerRecord> {
  const map = new Map<string, SecCompanyTickerRecord>();
  for (const record of Object.values(payload)) {
    if (record?.ticker && record?.cik_str != null) {
      map.set(record.ticker.toUpperCase(), record);
    }
  }
  return map;
}

export async function fetchTickerMap(fetchImpl: typeof fetch = fetch): Promise<Map<string, SecCompanyTickerRecord>> {
  if (tickerCache) return tickerCache;
  const response = await fetchImpl(SEC_TICKER_CIK_URL, {
    headers: {
      "User-Agent": secUserAgent(),
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`SEC ticker mapping request failed with HTTP ${response.status}`);
  }
  const json = (await response.json()) as SecCompanyTickersResponse;
  tickerCache = buildTickerMap(json);
  return tickerCache;
}

export async function tickerToCik(ticker: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) return null;
  const map = await fetchTickerMap(fetchImpl);
  const record = map.get(normalizedTicker);
  return record ? padCik(record.cik_str) : null;
}

export function clearTickerMapCacheForTests() {
  tickerCache = null;
}
