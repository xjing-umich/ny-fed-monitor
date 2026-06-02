import "server-only";
import {
  getMarketDataSourceByName,
  listLatestObservationsBySeries,
  type MarketTimeSeriesObservation,
} from "@/lib/db/market";
import { hasSupabaseEnv } from "@/lib/managers/db";

export async function latestObservationsResponse(params: {
  sourceName: string;
  seriesCodes: string[];
}): Promise<Response> {
  if (!hasSupabaseEnv()) {
    return Response.json({
      source: params.sourceName,
      observations: [] as MarketTimeSeriesObservation[],
      warning: "Market database is not configured.",
    });
  }

  try {
    const source = await getMarketDataSourceByName(params.sourceName);
    if (!source) {
      return Response.json({
        source: params.sourceName,
        observations: [],
        warning: `${params.sourceName} source is not seeded. Apply web/supabase/schema.sql first.`,
      });
    }
    const observations = await listLatestObservationsBySeries(source.id, params.seriesCodes);
    return Response.json({
      source: params.sourceName,
      observations,
    });
  } catch (error) {
    const warning = error instanceof Error ? error.message : `${params.sourceName} observations are unavailable.`;
    return Response.json({
      source: params.sourceName,
      observations: [],
      warning,
    });
  }
}
