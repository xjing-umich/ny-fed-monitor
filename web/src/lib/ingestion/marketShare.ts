import "server-only";
import type { MarketTimeSeriesObservationInput } from "@/lib/db/market";
import { fetchJsonWithRetry } from "@/lib/sources/nyfed";
import { persistIngestion, recordFailedIngestion, toDate, toFloat } from "@/lib/ingestion/common";

export const marketShareSourceName = "Market Share";
const MALFORMED_MARKET_SHARE_MESSAGE = "Market Share source returned non-JSON or malformed payload.";

function recordsFromPayload(payload: unknown, frequency: "qtrly" | "ytd"): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const container = (((payload as Record<string, unknown>).pd as Record<string, unknown>)?.marketshare as Record<string, unknown>)?.[frequency];
  if (!container || typeof container !== "object") return [];
  const rows: Record<string, unknown>[] = [];
  for (const [channel, value] of Object.entries(container as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const row of value) {
        if (row && typeof row === "object") {
          rows.push({ ...(row as Record<string, unknown>), trade_channel: channel });
        }
      }
    }
  }
  return rows;
}

function releaseDate(payload: unknown, frequency: "qtrly" | "ytd"): string | null {
  const marketshare = ((payload as Record<string, unknown>)?.pd as Record<string, unknown>)?.marketshare as Record<string, unknown>;
  const container = marketshare?.[frequency] as Record<string, unknown> | undefined;
  return toDate(container?.releaseDate ?? marketshare?.releaseDate);
}

export async function ingestMarketShare() {
  const startedAt = new Date().toISOString();
  try {
    const [qtrly, ytd] = await Promise.all([
      fetchJsonWithRetry("https://markets.newyorkfed.org/api/marketshare/qtrly/latest.json", {
        tag: "market-share-qtrly",
        revalidate: 3600,
      }),
      fetchJsonWithRetry("https://markets.newyorkfed.org/api/marketshare/ytd/latest.json", {
        tag: "market-share-ytd",
        revalidate: 3600,
      }),
    ]);
    const payloads = [
      { raw: qtrly, frequency: "qtrly" as const, date: releaseDate(qtrly, "qtrly") },
      { raw: ytd, frequency: "ytd" as const, date: releaseDate(ytd, "ytd") },
    ];
    const observations: MarketTimeSeriesObservationInput[] = [];
    for (const payload of payloads) {
      for (const row of recordsFromPayload(payload.raw, payload.frequency)) {
        const value = toFloat(
          row.dailyAvgVolInMillions ??
            row.daily_avg_volume_millions ??
            row.dailyAvgVolMillions ??
            row.dailyAvgVol ??
            row.percentFirstQuintMktShare
        );
        if (!payload.date || value === null) continue;
        observations.push({
          source_id: 0,
          series_code: "PD_MARKET_SHARE_TOTAL",
          observation_date: payload.date,
          value,
          unit: row.dailyAvgVolInMillions || row.dailyAvgVol ? "millions_usd" : "percent",
          metadata: {
            provider: "NY Fed",
            frequency: payload.frequency === "qtrly" ? "quarterly" : "ytd",
            product: row.securityType ?? row.product ?? row.security,
            trade_channel: row.trade_channel,
            first_quintile_market_share: toFloat(row.percentFirstQuintMktShare),
            second_quintile_market_share: toFloat(row.percentSecondQuintMktShare),
            third_quintile_market_share: toFloat(row.percentThirdQuintMktShare),
            fourth_quintile_market_share: toFloat(row.percentFourthQuintMktShare),
            fifth_quintile_market_share: toFloat(row.percentFifthQuintMktShare),
          },
        });
      }
    }
    return persistIngestion({
      sourceName: marketShareSourceName,
      observations,
      cadence: "quarterly",
      startedAt,
      partial: payloads.some((payload) => !payload.date),
      series: ["PD_MARKET_SHARE_TOTAL"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const normalizedError =
      message.includes("Unexpected token") ||
      message.includes("not valid JSON") ||
      message.includes("JSON")
        ? new Error(MALFORMED_MARKET_SHARE_MESSAGE)
        : error;
    return recordFailedIngestion({ sourceName: marketShareSourceName, startedAt, error: normalizedError });
  }
}
