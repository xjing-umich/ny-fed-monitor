import { latestObservationsResponse } from "@/lib/ingestion/readRoutes";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return latestObservationsResponse({
    sourceName: "Primary Dealer Positions",
    seriesCodes: ["PD_POSITIONS_TOTAL"],
  });
}
