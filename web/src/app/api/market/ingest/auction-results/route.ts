import { auctionResultsSourceName, ingestAuctionResults } from "@/lib/ingestion/auctionResults";
import { runIngestionRoute } from "@/lib/ingestion/routes";

export const dynamic = "force-dynamic";

export function POST(): Promise<Response> {
  return runIngestionRoute(auctionResultsSourceName, ingestAuctionResults);
}
