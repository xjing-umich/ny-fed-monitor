import { ingestMarketShare, marketShareSourceName } from "@/lib/ingestion/marketShare";
import { runIngestionRoute } from "@/lib/ingestion/routes";

export const dynamic = "force-dynamic";

export function POST(): Promise<Response> {
  return runIngestionRoute(marketShareSourceName, ingestMarketShare);
}
