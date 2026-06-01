/**
 * common.ts — pure numeric helpers ported from backend/app/analyzers/pd_common.py
 * All formulas match the Python implementation exactly.
 */

import type { Section } from "@/lib/types";

export type SeriesRow = { date: string; value: number | null };

/**
 * Find the record in `series` whose date is closest to `targetDate`.
 * On tie, prefers the earlier date (matches Python sort by (distance, date)).
 */
export function closestRecord(
  series: SeriesRow[],
  targetDate: Date
): SeriesRow | null {
  const dated: Array<[number, string, SeriesRow]> = [];
  for (const row of series) {
    try {
      const rowDate = new Date(row.date + "T00:00:00Z");
      if (isNaN(rowDate.getTime())) continue;
      const distance = Math.abs(
        (rowDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      dated.push([distance, row.date, row]);
    } catch {
      continue;
    }
  }
  if (dated.length === 0) return null;
  dated.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return dated[0][2];
}

/**
 * Compute the change in `value` from `weeks` weeks prior to the latest record.
 * Mirrors Python _change_from_weeks exactly.
 */
export function changeFromWeeks(
  series: SeriesRow[],
  weeks: number
): { change: number | null; warning?: string } {
  if (!series.length) {
    return { change: null, warning: "No observations available." };
  }
  const latest = series[series.length - 1];
  const latestDate = new Date(latest.date + "T00:00:00Z");
  if (isNaN(latestDate.getTime())) {
    return { change: null, warning: "Latest date is invalid." };
  }
  const targetMs = latestDate.getTime() - weeks * 7 * 24 * 60 * 60 * 1000;
  const targetDate = new Date(targetMs);
  // Use series[:-1] or series if only one element (matches Python logic)
  const searchIn = series.length > 1 ? series.slice(0, -1) : series;
  const prior = closestRecord(searchIn, targetDate);
  if (prior === null || prior.value === null || latest.value === null) {
    return {
      change: null,
      warning: `No nearby observation found for ${weeks}-week change.`,
    };
  }
  return { change: latest.value - prior.value };
}

/**
 * Compute rolling z-score over the last `window` non-null values.
 * Uses population std (divide by N), matches Python _rolling_zscore.
 */
export function rollingZScore(
  series: SeriesRow[],
  window = 52
): number | null {
  const values = series
    .map((r) => r.value)
    .filter((v): v is number => v !== null);
  if (values.length < 2) return null;
  const sample =
    values.length >= window ? values.slice(-window) : values;
  const mean = sample.reduce((s, v) => s + v, 0) / sample.length;
  const variance =
    sample.reduce((s, v) => s + (v - mean) ** 2, 0) / sample.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (sample[sample.length - 1] - mean) / std;
}

/**
 * Compute historical percentile for the latest value in the series.
 * Returns "Limited sample" when fewer than 52 non-null values are present.
 * Uses <= comparison (matches Python _historical_percentile).
 */
export function historicalPercentile(series: SeriesRow[]): string {
  const values = series
    .map((r) => r.value)
    .filter((v): v is number => v !== null);
  if (values.length < 52) return "Limited sample";
  const latest = values[values.length - 1];
  const lessOrEqual = values.filter((v) => v <= latest).length;
  const pct = (lessOrEqual / values.length) * 100;
  return `${pct.toFixed(1)}%`;
}

/**
 * Determine data freshness.
 * ≤8 days → "Fresh", ≤14 days → "Stale", else "Old", no date → "Missing".
 * Matches Python _freshness_status in pd_common.py.
 */
export function freshnessStatus(dataDate: string | null | undefined): string {
  if (!dataDate) return "Missing";
  const as_of = new Date(dataDate + "T00:00:00Z");
  if (isNaN(as_of.getTime())) return "Missing";
  const today = new Date();
  // Compare calendar days (ignore time)
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const asOfUTC = Date.UTC(
    as_of.getUTCFullYear(),
    as_of.getUTCMonth(),
    as_of.getUTCDate()
  );
  const age = Math.round((todayUTC - asOfUTC) / (1000 * 60 * 60 * 24));
  if (age <= 8) return "Fresh";
  if (age <= 14) return "Stale";
  return "Old";
}

/**
 * Downgrade a "live" section to "unavailable" if data_date is null or
 * freshness_status is "Missing". Matches Python finalize_live_mode logic.
 */
export function finalizeLiveMode(section: Section): Section {
  if (section.mode === "live") {
    if (!section.data_date || section.freshness_status === "Missing") {
      return { ...section, mode: "unavailable" };
    }
  }
  return section;
}

/**
 * Format a value in millions to a human-readable string.
 * ≥1e6 → "$X.X trillion", ≥1e3 → "$X.X billion", else "$X.X million"
 * Matches Python format_millions_to_readable.
 */
export function formatMillions(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)} trillion`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)} billion`;
  return `${sign}$${abs.toFixed(1)} million`;
}

/**
 * Format a change value with a leading "+" when positive.
 * Matches Python format_change_millions.
 */
export function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatMillions(value)}`;
}
