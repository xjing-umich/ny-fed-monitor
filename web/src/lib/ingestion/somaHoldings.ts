import "server-only";
import type { MarketTimeSeriesObservationInput } from "@/lib/db/market";
import { fetchSomaSummary } from "@/lib/sources/nyfed";
import { persistIngestion, recordFailedIngestion } from "@/lib/ingestion/common";

export const somaHoldingsSourceName = "SOMA Holdings";

const SERIES_BY_CATEGORY: Record<string, string> = {
  Total: "SOMA_TOTAL_HOLDINGS",
  Treasury: "SOMA_TREASURY_HOLDINGS",
  MBS: "SOMA_MBS_HOLDINGS",
};

export async function ingestSomaHoldings() {
  const startedAt = new Date().toISOString();
  try {
    const rows = await fetchSomaSummary();
    const observations: MarketTimeSeriesObservationInput[] = rows
      .filter((row) => row.date && row.par_value !== null && SERIES_BY_CATEGORY[row.category])
      .map((row) => ({
        source_id: 0,
        series_code: SERIES_BY_CATEGORY[row.category],
        observation_date: row.date,
        value: row.par_value,
        unit: "usd",
        metadata: {
          provider: "NY Fed",
          category: row.category,
        },
      }));
    return persistIngestion({
      sourceName: somaHoldingsSourceName,
      observations,
      cadence: "weekly",
      startedAt,
      series: Object.values(SERIES_BY_CATEGORY),
    });
  } catch (error) {
    return recordFailedIngestion({ sourceName: somaHoldingsSourceName, startedAt, error });
  }
}
