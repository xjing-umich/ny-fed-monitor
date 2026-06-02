import { latestObservationsResponse } from "@/lib/ingestion/readRoutes";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return latestObservationsResponse({
    sourceName: "ON RRP / SRP Facility Usage",
    seriesCodes: ["ON_RRP_USAGE", "SRP_USAGE", "ON_RRP_AWARD_RATE", "SRP_AWARD_RATE"],
  });
}
