import "server-only";
import type { MarketTimeSeriesObservationInput } from "@/lib/db/market";
import { fetchPdHistory } from "@/lib/sources/nyfed";
import {
  persistIngestion,
  recordFailedIngestion,
  type MarketIngestionResult,
} from "@/lib/ingestion/common";

export async function ingestSinglePdSeries(params: {
  sourceName: string;
  keyid: string;
  seriesCode: string;
  metadata?: Record<string, unknown>;
}): Promise<MarketIngestionResult> {
  const startedAt = new Date().toISOString();
  try {
    const rows = await fetchPdHistory(params.keyid);
    const observations: MarketTimeSeriesObservationInput[] = rows
      .filter((row) => row.date && row.value !== null)
      .map((row) => ({
        source_id: 0,
        series_code: params.seriesCode,
        observation_date: row.date,
        value: row.value,
        unit: "millions_usd",
        metadata: {
          provider: "NY Fed",
          keyid: params.keyid,
          ...params.metadata,
        },
      }));
    return persistIngestion({
      sourceName: params.sourceName,
      observations,
      cadence: "weekly",
      startedAt,
      series: [params.seriesCode],
    });
  } catch (error) {
    return recordFailedIngestion({ sourceName: params.sourceName, startedAt, error });
  }
}
