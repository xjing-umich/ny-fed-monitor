import { parseQuote } from "@/lib/prices/finnhub";
import type { PriceData } from "./types";

export async function fetchFinnhubPrice(ticker: string, fetchImpl: typeof fetch = fetch): Promise<PriceData | null> {
  const apiKey = process.env.FINNHUB_API_KEY?.trim();
  if (!apiKey) return null;
  const normalizedTicker = ticker.trim().toUpperCase();
  const response = await fetchImpl(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(normalizedTicker)}&token=${encodeURIComponent(apiKey)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    throw new Error(`Finnhub quote request failed with HTTP ${response.status}`);
  }
  const parsed = parseQuote(await response.json());
  if (!parsed) return null;
  return {
    ticker: normalizedTicker,
    latest_price: parsed.close,
    price_date: parsed.date,
    currency: "USD",
    source: "FINNHUB_QUOTE",
  };
}

export function mockPrice(ticker: string, latestPrice = 430, priceDate = "2026-06-08"): PriceData {
  return {
    ticker: ticker.trim().toUpperCase(),
    latest_price: latestPrice,
    price_date: priceDate,
    currency: "USD",
    source: "MOCK_PRICE",
  };
}
