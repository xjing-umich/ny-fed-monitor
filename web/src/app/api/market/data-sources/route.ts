import { listMarketDataSources } from "@/lib/db/market";
import { hasSupabaseEnv } from "@/lib/managers/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!hasSupabaseEnv()) {
    return Response.json({
      data_sources: [],
      warning: "Supabase env not configured; market database foundation is inactive.",
    });
  }

  try {
    const data_sources = await listMarketDataSources();
    return Response.json({ data_sources });
  } catch (error: unknown) {
    const warning =
      error instanceof Error
        ? error.message
        : "Market data sources are unavailable. Confirm the market schema has been applied.";
    return Response.json({
      data_sources: [],
      warning,
    });
  }
}
