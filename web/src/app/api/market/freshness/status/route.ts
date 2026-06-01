import { getFreshnessStatus } from "@/lib/db/freshness";
import { hasSupabaseEnv } from "@/lib/managers/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!hasSupabaseEnv()) {
    return Response.json({
      freshness_status: [],
      warning: "Supabase env not configured; market freshness status is unknown.",
    });
  }

  try {
    const freshness_status = await getFreshnessStatus();
    return Response.json({ freshness_status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
