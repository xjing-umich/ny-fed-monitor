import { ingestPrimaryDealerPositions, primaryDealerPositionsSourceName } from "@/lib/ingestion/primaryDealerPositions";
import { runIngestionRoute } from "@/lib/ingestion/routes";

export const dynamic = "force-dynamic";

export function POST(): Promise<Response> {
  return runIngestionRoute(primaryDealerPositionsSourceName, ingestPrimaryDealerPositions);
}
