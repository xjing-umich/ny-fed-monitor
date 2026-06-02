import { ingestSettlementFails, settlementFailsSourceName } from "@/lib/ingestion/settlementFails";
import { runIngestionRoute } from "@/lib/ingestion/routes";

export const dynamic = "force-dynamic";

export function POST(): Promise<Response> {
  return runIngestionRoute(settlementFailsSourceName, ingestSettlementFails);
}
