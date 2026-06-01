/**
 * treasury.ts — fetch helpers for the US Treasury FiscalData API
 * Mirrors backend/app/analyzers/auction.py fetch logic.
 */

import { fetchJsonWithRetry } from "@/lib/sources/nyfed";

const AUCTIONS_BASE_URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query";

function toFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "null") return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function toDateStr(value: unknown): string | null {
  if (value === null || value === undefined || value === "" || value === "null") return null;
  return String(value);
}

export type AuctionRow = Record<string, unknown> & {
  auction_date: string | null;
  security_type: string | null;
  cusip: string | null;
  offering_amount: number | null;
  bid_to_cover_ratio: number | null;
};

function normalizeAuctionRecord(raw: Record<string, unknown>): AuctionRow {
  return {
    ...raw,
    auction_date: toDateStr(raw.auction_date),
    security_type: raw.security_type ? String(raw.security_type) : null,
    cusip: raw.cusip ? String(raw.cusip) : null,
    offering_amount: toFloat(raw.offering_amt),
    bid_to_cover_ratio: toFloat(raw.bid_to_cover_ratio),
  };
}

/**
 * Fetch upcoming Treasury auctions (auction_date >= today).
 */
export async function fetchUpcomingAuctions(): Promise<AuctionRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${AUCTIONS_BASE_URL}?filter=auction_date:gte:${today}&page[size]=100&sort=auction_date`;
  const payload = (await fetchJsonWithRetry(url, {
    tag: "treasury-auctions-upcoming",
    revalidate: 3600,
  })) as { data?: Array<Record<string, unknown>> };
  return (payload?.data ?? []).map(normalizeAuctionRecord);
}

/**
 * Fetch recent Treasury auction results (last 90 days).
 */
export async function fetchRecentAuctionResults(): Promise<AuctionRow[]> {
  const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const url = `${AUCTIONS_BASE_URL}?filter=auction_date:gte:${start}&page[size]=500&sort=-auction_date`;
  const payload = (await fetchJsonWithRetry(url, {
    tag: "treasury-auctions-recent",
    revalidate: 3600,
  })) as { data?: Array<Record<string, unknown>> };
  return (payload?.data ?? []).map(normalizeAuctionRecord);
}
