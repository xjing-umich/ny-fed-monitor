import "server-only";
import type { MarketTimeSeriesObservationInput } from "@/lib/db/market";
import { fetchPdHistory } from "@/lib/sources/nyfed";
import { persistIngestion, recordFailedIngestion } from "@/lib/ingestion/common";

export const settlementFailsSourceName = "Settlement Fails";

export async function ingestSettlementFails() {
  const startedAt = new Date().toISOString();
  try {
    const [deliverRows, receiveRows] = await Promise.all([
      fetchPdHistory("PDFTD-USTET"),
      fetchPdHistory("PDFTR-USTET"),
    ]);
    const observations: MarketTimeSeriesObservationInput[] = [];
    const receiveByDate = new Map(receiveRows.map((row) => [row.date, row.value]));

    for (const row of deliverRows) {
      if (row.date && row.value !== null) {
        observations.push({
          source_id: 0,
          series_code: "PD_FAILS_TO_DELIVER",
          observation_date: row.date,
          value: row.value,
          unit: "millions_usd",
          metadata: { provider: "NY Fed", keyid: "PDFTD-USTET" },
        });
      }
      const receiveValue = receiveByDate.get(row.date);
      if (row.date && row.value !== null && receiveValue !== null && receiveValue !== undefined) {
        observations.push({
          source_id: 0,
          series_code: "PD_FAILS_TOTAL",
          observation_date: row.date,
          value: row.value + receiveValue,
          unit: "millions_usd",
          metadata: { provider: "NY Fed", components: ["PDFTD-USTET", "PDFTR-USTET"] },
        });
      }
    }

    for (const row of receiveRows) {
      if (row.date && row.value !== null) {
        observations.push({
          source_id: 0,
          series_code: "PD_FAILS_TO_RECEIVE",
          observation_date: row.date,
          value: row.value,
          unit: "millions_usd",
          metadata: { provider: "NY Fed", keyid: "PDFTR-USTET" },
        });
      }
    }

    return persistIngestion({
      sourceName: settlementFailsSourceName,
      observations,
      cadence: "weekly",
      startedAt,
      partial: deliverRows.length === 0 || receiveRows.length === 0,
      series: ["PD_FAILS_TO_DELIVER", "PD_FAILS_TO_RECEIVE", "PD_FAILS_TOTAL"],
    });
  } catch (error) {
    return recordFailedIngestion({ sourceName: settlementFailsSourceName, startedAt, error });
  }
}
