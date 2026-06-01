import "server-only";
import { createHash } from "node:crypto";
import {
  getMarketDataSourceByName,
  recordIngestionRun,
  upsertTimeSeriesObservations,
  type MarketIngestionStatus,
  type MarketTimeSeriesObservationInput,
} from "@/lib/db/market";
import { updateFreshnessStatus, type MarketFreshnessStatusValue } from "@/lib/db/freshness";
import { fetchReferenceRates } from "@/lib/sources/nyfed";

const SOURCE_NAME = "Reference Rates";
const SERIES_CODES = ["SOFR", "EFFR", "OBFR", "TGCR", "BGCR"] as const;

type ReferenceRateSeriesCode = (typeof SERIES_CODES)[number];

export type ReferenceRatesIngestionResult = {
  ok: boolean;
  source: typeof SOURCE_NAME;
  series: ReferenceRateSeriesCode[];
  rows_written: number;
  latest_observation_date: string | null;
  status: MarketIngestionStatus;
  warning?: string;
};

export type SerializedError = {
  name?: string;
  message: string;
  stack?: string;
};

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

function businessDaysSince(dateText: string, now = new Date()): number {
  const start = new Date(`${dateText}T00:00:00Z`);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (Number.isNaN(start.getTime()) || start > end) return 0;

  let days = 0;
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function statusForLatestDate(
  latestObservationDate: string | null,
  rowsWritten: number,
  completeSeriesCount: number
): {
  ingestionStatus: MarketIngestionStatus;
  freshnessStatus: MarketFreshnessStatusValue;
  daysSinceLatest: number | null;
  warning: string | null;
} {
  if (!latestObservationDate || rowsWritten === 0) {
    return {
      ingestionStatus: "empty",
      freshnessStatus: "empty",
      daysSinceLatest: null,
      warning: "NY Fed reference rates fetch returned no valid observations.",
    };
  }

  const daysSinceLatest = businessDaysSince(latestObservationDate);
  const isStale = daysSinceLatest > 2;
  const isPartial = completeSeriesCount < SERIES_CODES.length;
  return {
    ingestionStatus: isStale ? "stale" : isPartial ? "partial" : "success",
    freshnessStatus: isStale ? "stale" : isPartial ? "partial" : "fresh",
    daysSinceLatest,
    warning: isPartial
      ? `Only ${completeSeriesCount} of ${SERIES_CODES.length} reference-rate series were fetched.`
      : isStale
        ? "Latest Reference Rates observation is older than 2 business days."
        : null,
  };
}

function hashRows(rows: MarketTimeSeriesObservationInput[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export async function ingestReferenceRates(): Promise<ReferenceRatesIngestionResult> {
  const startedAt = new Date().toISOString();
  const source = await getMarketDataSourceByName(SOURCE_NAME);
  if (!source) {
    throw new Error(`Market data source not found: ${SOURCE_NAME}. Apply web/supabase/schema.sql first.`);
  }

  try {
    const rows = await fetchReferenceRates();
    const validRows = rows.filter(
      (row) =>
        SERIES_CODES.includes(row.rate_name as ReferenceRateSeriesCode) &&
        Boolean(row.date) &&
        row.rate_percent !== null
    );

    const observations: MarketTimeSeriesObservationInput[] = validRows.map((row) => ({
      source_id: source.id,
      series_code: row.rate_name,
      observation_date: row.date,
      value: row.rate_percent,
      unit: "percent",
      metadata: {
        provider: "NY Fed",
        volume_in_billions: row.volume,
      },
    }));

    const rowsWritten = await upsertTimeSeriesObservations(observations);
    const latestObservationDate =
      observations
        .map((row) => row.observation_date)
        .sort((a, b) => b.localeCompare(a))[0] ?? null;
    const completeSeriesCount = new Set(observations.map((row) => row.series_code)).size;
    const status = statusForLatestDate(latestObservationDate, rowsWritten, completeSeriesCount);
    const finishedAt = new Date().toISOString();

    await recordIngestionRun({
      source_id: source.id,
      started_at: startedAt,
      finished_at: finishedAt,
      status: status.ingestionStatus,
      rows_fetched: validRows.length,
      latest_observation_date: latestObservationDate,
      raw_response_hash: hashRows(observations),
      error_message: status.warning,
    });

    await updateFreshnessStatus({
      source_id: source.id,
      latest_observation_date: latestObservationDate,
      last_successful_fetch: status.ingestionStatus === "empty" ? null : finishedAt,
      freshness_status: status.freshnessStatus,
      days_since_latest: status.daysSinceLatest,
      expected_frequency: source.update_frequency,
      checked_at: finishedAt,
      warning: status.warning,
    });

    return {
      ok: status.ingestionStatus !== "empty",
      source: SOURCE_NAME,
      series: [...SERIES_CODES],
      rows_written: rowsWritten,
      latest_observation_date: latestObservationDate,
      status: status.ingestionStatus,
      ...(status.warning ? { warning: status.warning } : {}),
    };
  } catch (error) {
    const serialized = serializeError(error);
    const finishedAt = new Date().toISOString();
    await recordIngestionRun({
      source_id: source.id,
      started_at: startedAt,
      finished_at: finishedAt,
      status: "failed",
      rows_fetched: 0,
      latest_observation_date: null,
      error_message: serialized.message,
    });
    await updateFreshnessStatus({
      source_id: source.id,
      latest_observation_date: null,
      last_successful_fetch: null,
      freshness_status: "failed",
      days_since_latest: null,
      expected_frequency: source.update_frequency,
      checked_at: finishedAt,
      warning: serialized.message,
    });
    throw error;
  }
}

export const referenceRateSeries = [...SERIES_CODES];
export const referenceRatesSourceName = SOURCE_NAME;
