import "server-only";
import { ingestAuctionResults } from "@/lib/ingestion/auctionResults";
import { ingestFacilityUsage } from "@/lib/ingestion/facilityUsage";
import { ingestMarketShare } from "@/lib/ingestion/marketShare";
import { ingestPolicyExpectations } from "@/lib/ingestion/policyExpectations";
import { ingestPrimaryDealerPositions } from "@/lib/ingestion/primaryDealerPositions";
import { ingestPrimaryDealerTransactions } from "@/lib/ingestion/primaryDealerTransactions";
import { ingestRepoFinancing } from "@/lib/ingestion/repoFinancing";
import { ingestSec13f } from "@/lib/ingestion/sec13f";
import { ingestSettlementFails } from "@/lib/ingestion/settlementFails";
import { ingestSomaHoldings } from "@/lib/ingestion/somaHoldings";
import { serializeError, type MarketIngestionResult } from "@/lib/ingestion/common";

const JOBS: Array<{ source: string; run: () => Promise<MarketIngestionResult> }> = [
  { source: "ON RRP / SRP Facility Usage", run: ingestFacilityUsage },
  { source: "SOMA Holdings", run: ingestSomaHoldings },
  { source: "Primary Dealer Positions", run: ingestPrimaryDealerPositions },
  { source: "Primary Dealer Transactions", run: ingestPrimaryDealerTransactions },
  { source: "Repo Financing", run: ingestRepoFinancing },
  { source: "Settlement Fails", run: ingestSettlementFails },
  { source: "Auction Calendar and Results", run: ingestAuctionResults },
  { source: "Market Share", run: ingestMarketShare },
  { source: "SME / Policy Expectations", run: ingestPolicyExpectations },
  { source: "SEC 13F Holdings", run: ingestSec13f },
];

export type BatchIngestionSummary = {
  ok: boolean;
  results: MarketIngestionResult[];
  success_count: number;
  failed_count: number;
  partial_count: number;
  empty_count: number;
};

export async function runBatchMarketIngestion(): Promise<BatchIngestionSummary> {
  const results: MarketIngestionResult[] = [];
  for (const job of JOBS) {
    try {
      results.push(await job.run());
    } catch (error) {
      const serialized = serializeError(error);
      results.push({
        ok: false,
        source: job.source,
        status: "failed",
        rows_written: 0,
        latest_observation_date: null,
        message: serialized.message,
      });
    }
  }

  const successCount = results.filter(
    (result) => result.status === "success" || result.status === "stale"
  ).length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const partialCount = results.filter((result) => result.status === "partial").length;
  const emptyCount = results.filter((result) => result.status === "empty").length;

  return {
    ok: failedCount === 0,
    results,
    success_count: successCount,
    failed_count: failedCount,
    partial_count: partialCount,
    empty_count: emptyCount,
  };
}
