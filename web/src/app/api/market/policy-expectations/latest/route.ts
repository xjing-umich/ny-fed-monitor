import { latestObservationsResponse } from "@/lib/ingestion/readRoutes";

export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return latestObservationsResponse({
    sourceName: "SME / Policy Expectations",
    seriesCodes: [
      "SME_FED_FUNDS_MEDIAN_LATEST",
      "SME_FED_FUNDS_MEDIAN_YEAR_END_2026",
      "SME_RECESSION_PROBABILITY_NOW",
      "SME_RECESSION_PROBABILITY_6M",
      "SME_CORE_PCE_2026_MEDIAN",
    ],
  });
}
