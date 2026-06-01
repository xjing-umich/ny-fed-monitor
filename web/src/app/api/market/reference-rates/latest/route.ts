import {
  getMarketDataSourceByName,
  listLatestObservationsBySeries,
} from "@/lib/db/market";
import { hasSupabaseEnv } from "@/lib/managers/db";
import { referenceRateSeries, referenceRatesSourceName } from "@/lib/ingestion/referenceRates";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!hasSupabaseEnv()) {
    return Response.json({
      source: referenceRatesSourceName,
      observations: [],
      warning: "Market database is not configured.",
    });
  }

  try {
    const source = await getMarketDataSourceByName(referenceRatesSourceName);
    if (!source) {
      return Response.json({
        source: referenceRatesSourceName,
        observations: [],
        warning: "Reference Rates source is not seeded. Apply web/supabase/schema.sql first.",
      });
    }
    const observations = await listLatestObservationsBySeries(source.id, referenceRateSeries);
    return Response.json({
      source: referenceRatesSourceName,
      observations,
    });
  } catch (error: unknown) {
    const warning =
      error instanceof Error
        ? error.message
        : "Reference Rates observations are unavailable.";
    return Response.json({
      source: referenceRatesSourceName,
      observations: [],
      warning,
    });
  }
}
