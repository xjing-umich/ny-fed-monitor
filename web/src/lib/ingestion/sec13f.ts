import "server-only";
import type { MarketTimeSeriesObservationInput } from "@/lib/db/market";
import { getManagerIndex } from "@/lib/managers/source";
import { persistIngestion, recordFailedIngestion } from "@/lib/ingestion/common";

export const sec13fSourceName = "SEC 13F Holdings";

export async function ingestSec13f() {
  const startedAt = new Date().toISOString();
  try {
    const index = await getManagerIndex();
    const observations: MarketTimeSeriesObservationInput[] = index.managers
      .filter((manager) => manager.period && Number.isFinite(manager.totalValue))
      .map((manager) => ({
        source_id: 0,
        series_code: "SEC_13F_PORTFOLIO_VALUE",
        observation_date: manager.period,
        value: manager.totalValue,
        unit: "usd",
        metadata: {
          provider: "SEC EDGAR",
          cik: manager.cik,
          manager: manager.name,
          person: manager.person,
          holding_count: manager.holdingCount,
          top_holding: manager.topHolding,
          limitation: "13F filings are delayed regulatory disclosures and do not represent current holdings.",
        },
      }));

    return persistIngestion({
      sourceName: sec13fSourceName,
      observations,
      cadence: "quarterly",
      startedAt,
      message: "13F ingestion stores summary-level manager portfolio values only.",
      series: ["SEC_13F_PORTFOLIO_VALUE"],
    });
  } catch (error) {
    return recordFailedIngestion({ sourceName: sec13fSourceName, startedAt, error });
  }
}
