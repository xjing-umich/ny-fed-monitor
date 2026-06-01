import { getMarketDataSourceByName, listTimeSeriesObservations } from "@/lib/db/market";
import { hasSupabaseEnv } from "@/lib/managers/db";
import { referenceRateSeries, referenceRatesSourceName } from "@/lib/ingestion/referenceRates";

export const dynamic = "force-dynamic";

function isReferenceRateSeries(series: string): boolean {
  return referenceRateSeries.includes(series as (typeof referenceRateSeries)[number]);
}

export async function GET(request: Request): Promise<Response> {
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

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 500), 2000);
    const seriesParam = searchParams.get("series");
    const requestedSeries = seriesParam
      ? seriesParam
          .split(",")
          .map((series) => series.trim().toUpperCase())
          .filter(isReferenceRateSeries)
      : referenceRateSeries;

    const observations = await listTimeSeriesObservations(source.id, {
      seriesCodes: requestedSeries,
      limit,
    });
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
