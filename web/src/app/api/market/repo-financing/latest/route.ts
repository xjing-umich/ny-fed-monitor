import { latestObservationsResponse } from "@/lib/ingestion/readRoutes";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return latestObservationsResponse({
    sourceName: "Repo Financing",
    seriesCodes: ["PD_REPO_FINANCING_TOTAL"],
  });
}
