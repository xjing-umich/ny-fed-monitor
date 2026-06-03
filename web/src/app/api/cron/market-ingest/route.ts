import { isAuthorizedIngestRequest, unauthorizedResponse } from "@/lib/ingestion/auth";
import { runBatchMarketIngestion } from "@/lib/ingestion/batch";
import { databaseNotConfigured } from "@/lib/ingestion/routes";
import { hasSupabaseEnv } from "@/lib/managers/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedIngestRequest(request)) return unauthorizedResponse();
  if (!hasSupabaseEnv()) return databaseNotConfigured();
  return Response.json(await runBatchMarketIngestion());
}
