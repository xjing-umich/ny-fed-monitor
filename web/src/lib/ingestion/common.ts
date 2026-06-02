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

export type SerializedError = {
  name?: string;
  message: string;
  code?: string;
  details?: unknown;
  hint?: string | null;
};

export type MarketIngestionResult = {
  ok: boolean;
  source: string;
  status: MarketIngestionStatus | "unknown";
  rows_written: number;
  latest_observation_date: string | null;
  message: string | null;
  series?: string[];
};

export type FreshnessCadence = "business_daily" | "weekly" | "quarterly" | "manual";

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (error && typeof error === "object") {
    const rec = error as Record<string, unknown>;
    return {
      message: typeof rec.message === "string" ? rec.message : JSON.stringify(rec),
      code: typeof rec.code === "string" ? rec.code : undefined,
      details: rec.details,
      hint: typeof rec.hint === "string" || rec.hint === null ? rec.hint : undefined,
    };
  }
  return { message: String(error) };
}

function hashRows(rows: MarketTimeSeriesObservationInput[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function dedupeObservations(
  rows: MarketTimeSeriesObservationInput[]
): MarketTimeSeriesObservationInput[] {
  const deduped = new Map<string, MarketTimeSeriesObservationInput>();
  for (const row of rows) {
    const key = `${row.source_id}|${row.series_code}|${row.observation_date}`;
    deduped.set(key, row);
  }
  return [...deduped.values()];
}

export function latestObservationDate(rows: MarketTimeSeriesObservationInput[]): string | null {
  return rows
    .map((row) => row.observation_date)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

export function calendarDaysSince(dateText: string, now = new Date()): number {
  const start = new Date(`${dateText}T00:00:00Z`);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (Number.isNaN(start.getTime()) || start > end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

export function businessDaysSince(dateText: string, now = new Date()): number {
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

function freshnessForCadence(
  latestDate: string | null,
  rowsWritten: number,
  cadence: FreshnessCadence,
  partial = false
): {
  ingestionStatus: MarketIngestionStatus;
  freshnessStatus: MarketFreshnessStatusValue;
  daysSinceLatest: number | null;
  warning: string | null;
} {
  if (!latestDate || rowsWritten === 0) {
    return {
      ingestionStatus: "empty",
      freshnessStatus: "empty",
      daysSinceLatest: null,
      warning: "No valid observations were produced.",
    };
  }

  const days =
    cadence === "business_daily" ? businessDaysSince(latestDate) : calendarDaysSince(latestDate);
  const threshold =
    cadence === "business_daily" ? 2 : cadence === "weekly" ? 8 : cadence === "quarterly" ? 100 : 0;
  const stale = cadence !== "manual" && days > threshold;
  return {
    ingestionStatus: stale ? "stale" : partial ? "partial" : "success",
    freshnessStatus: stale ? "stale" : partial ? "partial" : "fresh",
    daysSinceLatest: days,
    warning: stale
      ? `Latest observation is older than expected for ${cadence}.`
      : partial
        ? "Ingestion completed with partial source coverage."
        : null,
  };
}

export async function persistIngestion(params: {
  sourceName: string;
  observations: MarketTimeSeriesObservationInput[];
  cadence: FreshnessCadence;
  startedAt: string;
  partial?: boolean;
  message?: string | null;
  series?: string[];
}): Promise<MarketIngestionResult> {
  const source = await getMarketDataSourceByName(params.sourceName);
  if (!source) {
    throw new Error(`Market data source not found: ${params.sourceName}. Apply web/supabase/schema.sql first.`);
  }

  const rowsWithSource = dedupeObservations(
    params.observations.map((row) => ({
      ...row,
      source_id: source.id,
    }))
  );
  const rowsWritten = await upsertTimeSeriesObservations(rowsWithSource);
  const latestDate = latestObservationDate(rowsWithSource);
  const status = freshnessForCadence(latestDate, rowsWritten, params.cadence, params.partial);
  const finishedAt = new Date().toISOString();
  const message = params.message ?? status.warning;

  await recordIngestionRun({
    source_id: source.id,
    started_at: params.startedAt,
    finished_at: finishedAt,
    status: status.ingestionStatus,
    rows_fetched: params.observations.length,
    latest_observation_date: latestDate,
    raw_response_hash: hashRows(rowsWithSource),
    error_message: message,
  });

  await updateFreshnessStatus({
    source_id: source.id,
    latest_observation_date: latestDate,
    last_successful_fetch: status.ingestionStatus === "empty" ? null : finishedAt,
    freshness_status: status.freshnessStatus,
    days_since_latest: status.daysSinceLatest,
    expected_frequency: source.update_frequency,
    checked_at: finishedAt,
    warning: message,
  });

  return {
    ok: status.ingestionStatus !== "empty",
    source: params.sourceName,
    status: status.ingestionStatus,
    rows_written: rowsWritten,
    latest_observation_date: latestDate,
    message,
    ...(params.series ? { series: params.series } : {}),
  };
}

export async function recordFailedIngestion(params: {
  sourceName: string;
  startedAt: string;
  error: unknown;
}): Promise<MarketIngestionResult> {
  const serialized = serializeError(params.error);
  const source = await getMarketDataSourceByName(params.sourceName);
  if (source) {
    const finishedAt = new Date().toISOString();
    await recordIngestionRun({
      source_id: source.id,
      started_at: params.startedAt,
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
  }
  return {
    ok: false,
    source: params.sourceName,
    status: "failed",
    rows_written: 0,
    latest_observation_date: null,
    message: serialized.message,
  };
}

export function toFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "*" || value === "null") {
    return null;
  }
  const parsed = Number(String(value).replace(",", "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDate(value: unknown): string | null {
  if (!value || value === "null") return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, 10);
}
