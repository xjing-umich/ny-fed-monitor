import { latestObservationsResponse } from "@/lib/ingestion/readRoutes";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return latestObservationsResponse({
    sourceName: "SOMA Holdings",
    seriesCodes: ["SOMA_TOTAL_HOLDINGS", "SOMA_TREASURY_HOLDINGS", "SOMA_MBS_HOLDINGS"],
  });
}
