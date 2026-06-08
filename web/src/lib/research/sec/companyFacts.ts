import { SEC_COMPANYFACTS_BASE_URL, secUserAgent } from "./secConfig";
import { padCik, tickerToCik } from "./tickerCik";
import type { SecCompanyFactsJson } from "./types";

export async function fetchCompanyFactsByCik(cik: string, fetchImpl: typeof fetch = fetch): Promise<SecCompanyFactsJson> {
  const paddedCik = padCik(cik);
  const response = await fetchImpl(`${SEC_COMPANYFACTS_BASE_URL}/CIK${paddedCik}.json`, {
    headers: {
      "User-Agent": secUserAgent(),
      Accept: "application/json",
    },
  });

  if (response.status === 429) {
    throw new Error("SEC companyfacts request was rate limited with HTTP 429");
  }
  if (!response.ok) {
    throw new Error(`SEC companyfacts request failed with HTTP ${response.status}`);
  }
  return (await response.json()) as SecCompanyFactsJson;
}

export async function fetchCompanyFactsByTicker(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ cik: string; facts: SecCompanyFactsJson }> {
  const cik = await tickerToCik(ticker, fetchImpl);
  if (!cik) {
    throw new Error(`SEC ticker mapping not found for ${ticker.toUpperCase()}`);
  }
  return { cik, facts: await fetchCompanyFactsByCik(cik, fetchImpl) };
}
