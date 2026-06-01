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
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
