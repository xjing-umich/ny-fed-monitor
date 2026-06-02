import { latestObservationsResponse } from "@/lib/ingestion/readRoutes";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return latestObservationsResponse({
    sourceName: "Market Share",
    seriesCodes: ["PD_MARKET_SHARE_TOTAL"],
  });
}
