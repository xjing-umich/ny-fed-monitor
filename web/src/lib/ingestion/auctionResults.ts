import "server-only";
import type { MarketTimeSeriesObservationInput } from "@/lib/db/market";
import { fetchRecentAuctionResults, fetchUpcomingAuctions } from "@/lib/sources/treasury";
import { persistIngestion, recordFailedIngestion, toDate, toFloat } from "@/lib/ingestion/common";

export const auctionResultsSourceName = "Auction Calendar and Results";

type DailyAuctionAggregate = {
  date: string;
  sizeTotal: number;
  bidToCoverValues: number[];
  highYieldValues: number[];
  tailValues: number[];
  auctions: Array<Record<string, unknown>>;
};

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function ingestAuctionResults() {
  const startedAt = new Date().toISOString();
  try {
    const [recent, upcoming] = await Promise.all([
      fetchRecentAuctionResults(),
      fetchUpcomingAuctions(),
    ]);
    const rows = [...recent, ...upcoming];
    const byDate = new Map<string, DailyAuctionAggregate>();
    for (const row of rows) {
      const date = toDate(row.auction_date);
      if (!date) continue;
      const current = byDate.get(date) ?? {
        date,
        sizeTotal: 0,
        bidToCoverValues: [],
        highYieldValues: [],
        tailValues: [],
        auctions: [],
      };
      if (row.offering_amount !== null) current.sizeTotal += row.offering_amount;
      if (row.bid_to_cover_ratio !== null) current.bidToCoverValues.push(row.bid_to_cover_ratio);
      const highYield = toFloat(row.high_investment_rate ?? row.high_yield);
      if (highYield !== null) current.highYieldValues.push(highYield);
      const tail = toFloat(row.tail);
      if (tail !== null) current.tailValues.push(tail);
      if (current.auctions.length < 20) {
        current.auctions.push({
          cusip: row.cusip,
          security_type: row.security_type,
          term: row.security_term,
          issue_date: row.issue_date,
          maturity_date: row.maturity_date,
          offering_amount: row.offering_amount,
          bid_to_cover_ratio: row.bid_to_cover_ratio,
        });
      }
      byDate.set(date, current);
    }

    const observations: MarketTimeSeriesObservationInput[] = [];
    for (const daily of byDate.values()) {
      const metadata = {
        provider: "U.S. Treasury FiscalData",
        auction_count: daily.auctions.length,
        auctions: daily.auctions,
      };
      const values: Array<[string, number | null, string]> = [
        ["TREASURY_AUCTION_SIZE", daily.sizeTotal || null, "millions_usd"],
        ["TREASURY_AUCTION_BID_TO_COVER", average(daily.bidToCoverValues), "ratio"],
        ["TREASURY_AUCTION_HIGH_YIELD", average(daily.highYieldValues), "percent"],
        ["TREASURY_AUCTION_TAIL", average(daily.tailValues), "basis_points"],
      ];
      for (const [seriesCode, value, unit] of values) {
        if (value === null) continue;
        observations.push({
          source_id: 0,
          series_code: seriesCode,
          observation_date: daily.date,
          value,
          unit,
          metadata,
        });
      }
    }
    return persistIngestion({
      sourceName: auctionResultsSourceName,
      observations,
      cadence: "business_daily",
      startedAt,
      partial: recent.length === 0 || upcoming.length === 0,
      series: [
        "TREASURY_AUCTION_SIZE",
        "TREASURY_AUCTION_BID_TO_COVER",
        "TREASURY_AUCTION_HIGH_YIELD",
        "TREASURY_AUCTION_TAIL",
      ],
    });
  } catch (error) {
    return recordFailedIngestion({ sourceName: auctionResultsSourceName, startedAt, error });
  }
}
