import { ingestRepoFinancing, repoFinancingSourceName } from "@/lib/ingestion/repoFinancing";
import { runIngestionRoute } from "@/lib/ingestion/routes";

export const dynamic = "force-dynamic";

export function POST(): Promise<Response> {
  return runIngestionRoute(repoFinancingSourceName, ingestRepoFinancing);
}
