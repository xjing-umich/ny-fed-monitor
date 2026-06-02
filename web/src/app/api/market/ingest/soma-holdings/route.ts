import { ingestSomaHoldings, somaHoldingsSourceName } from "@/lib/ingestion/somaHoldings";
import { runIngestionRoute } from "@/lib/ingestion/routes";

export const dynamic = "force-dynamic";

export function POST(): Promise<Response> {
  return runIngestionRoute(somaHoldingsSourceName, ingestSomaHoldings);
}
