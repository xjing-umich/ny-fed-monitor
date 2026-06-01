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
    const warning =
      error instanceof Error
        ? error.message
        : "Market freshness status is unavailable. Confirm the market schema has been applied.";
    return Response.json({
      freshness_status: [],
      warning,
    });
  }
}
