import { latestObservationsResponse } from "@/lib/ingestion/readRoutes";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return latestObservationsResponse({
    sourceName: "Primary Dealer Transactions",
    seriesCodes: ["PD_TRANSACTIONS_TOTAL"],
  });
}
