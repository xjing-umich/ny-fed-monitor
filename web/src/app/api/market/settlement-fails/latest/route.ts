import { latestObservationsResponse } from "@/lib/ingestion/readRoutes";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return latestObservationsResponse({
    sourceName: "Settlement Fails",
    seriesCodes: ["PD_FAILS_TO_DELIVER", "PD_FAILS_TO_RECEIVE", "PD_FAILS_TOTAL"],
  });
}
