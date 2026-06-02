import { latestObservationsResponse } from "@/lib/ingestion/readRoutes";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return latestObservationsResponse({
    sourceName: "Auction Calendar and Results",
    seriesCodes: [
      "TREASURY_AUCTION_SIZE",
      "TREASURY_AUCTION_BID_TO_COVER",
      "TREASURY_AUCTION_HIGH_YIELD",
      "TREASURY_AUCTION_TAIL",
    ],
  });
}
