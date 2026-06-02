import { ingestFacilityUsage, facilityUsageSourceName } from "@/lib/ingestion/facilityUsage";
import { runIngestionRoute } from "@/lib/ingestion/routes";

export const dynamic = "force-dynamic";

export function POST(): Promise<Response> {
  return runIngestionRoute(facilityUsageSourceName, ingestFacilityUsage);
}
