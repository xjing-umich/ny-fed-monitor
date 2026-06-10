import { isAuthorizedIngestRequest, unauthorizedResponse } from "@/lib/ingestion/auth";
import { databaseNotConfigured } from "@/lib/ingestion/routes";
import { hasSupabaseEnv } from "@/lib/managers/db";
import { ingestAllCompanies } from "@/lib/sec/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// SEC fundamentals are quarterly data — a weekly pull keeps any new 10-K/10-Q
// ≤7 days fresh. The 36-ticker universe runs ~1 min (sleep(300) between
// companies, 2 SEC calls each), well within the function timeout. Idempotent
// upserts make re-runs safe. Vercel cron injects `Authorization: Bearer
// ${CRON_SECRET}`; manual triggers use INGEST_SECRET (both accepted).
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedIngestRequest(request)) return unauthorizedResponse();
  if (!hasSupabaseEnv()) return databaseNotConfigured("sec-fundamentals");
  return Response.json(await ingestAllCompanies());
}
