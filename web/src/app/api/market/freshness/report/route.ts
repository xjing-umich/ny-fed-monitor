import { getFreshnessReport } from "@/lib/db/freshness";
import { hasSupabaseEnv } from "@/lib/managers/db";

export const dynamic = "force-dynamic";

function unavailableReport(warning: string) {
  return {
    data_status_summary: {
      total_modules: 0,
      fresh: 0,
      stale: 0,
      failed: 0,
      manual_required: 0,
      unknown: 0,
      partial: 0,
      empty: 0,
    },
    fresh_modules: [],
    stale_modules: [],
    failed_modules: [],
    partial_modules: [],
    empty_modules: [],
    manual_required_modules: [],
    unknown_modules: [],
    safe_to_analyze: false,
    warnings: [warning],
  };
}

export async function GET(): Promise<Response> {
  if (!hasSupabaseEnv()) {
    return Response.json(
      unavailableReport("Supabase env not configured; market freshness report is unavailable.")
    );
  }

  try {
    const report = await getFreshnessReport();
    return Response.json(report);
  } catch (error: unknown) {
    const warning =
      error instanceof Error
        ? error.message
        : "Market freshness report is unavailable. Confirm the market schema has been applied.";
    return Response.json(unavailableReport(warning));
  }
}
