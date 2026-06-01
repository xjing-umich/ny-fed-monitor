import { getFreshnessReport } from "@/lib/db/freshness";
import { hasSupabaseEnv } from "@/lib/managers/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!hasSupabaseEnv()) {
    return Response.json({
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
      manual_required_modules: [],
      unknown_modules: [],
      safe_to_analyze: false,
      warnings: ["Supabase env not configured; market freshness report is unavailable."],
    });
  }

  try {
    const report = await getFreshnessReport();
    return Response.json(report);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
