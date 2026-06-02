import "server-only";
import { hasSupabaseEnv } from "@/lib/managers/db";
import { serializeError, type MarketIngestionResult } from "@/lib/ingestion/common";

export function databaseNotConfigured(source?: string): Response {
  return Response.json({
    ok: false,
    ...(source ? { source } : {}),
    status: "unknown",
    warning: "Market database is not configured.",
  });
}

export async function runIngestionRoute(
  source: string,
  ingest: () => Promise<MarketIngestionResult>
): Promise<Response> {
  if (!hasSupabaseEnv()) return databaseNotConfigured(source);
  try {
    return Response.json(await ingest());
  } catch (error) {
    const details = serializeError(error);
    return Response.json({
      ok: false,
      source,
      status: "failed",
      message: details.message,
      details,
    });
  }
}
