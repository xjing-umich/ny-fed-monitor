/**
 * marketShare.pure.ts — pure parse/transform logic for the NY Fed Market Share
 * feed. No `server-only`, no I/O — so it can be unit-checked with tsx
 * (see marketShare.check.ts). Server orchestration lives in marketShare.ts.
 */
import type { MarketTimeSeriesObservationInput } from "@/lib/db/market";
import { toDate, toFloat } from "./coerce";

export const marketShareSourceName = "Market Share";

// NY Fed feeds. `containerKey` is the actual JSON key nested under
// `pd.marketshare` — the qtrly endpoint nests under "quarterly" (NOT "qtrly"),
// which is why the old code silently parsed zero quarterly rows.
export const MARKET_SHARE_FEEDS = [
  {
    url: "https://markets.newyorkfed.org/api/marketshare/qtrly/latest.json",
    tag: "market-share-qtrly",
    containerKey: "quarterly",
    frequencyLabel: "quarterly" as const,
  },
  {
    url: "https://markets.newyorkfed.org/api/marketshare/ytd/latest.json",
    tag: "market-share-ytd",
    containerKey: "ytd",
    frequencyLabel: "ytd" as const,
  },
];

export type MarketShareFeed = (typeof MARKET_SHARE_FEEDS)[number];

/**
 * Repair NY Fed's malformed JSON. They use `*` as a "not disclosed" sentinel
 * but occasionally emit it UNQUOTED as a value (`"dailyAvgVolInMillions": *`),
 * which is invalid JSON and makes strict parsing throw — taking down the whole
 * source. Rewrite bare `*` value positions to `null` (semantically identical:
 * `toFloat("*")` already yields null). Only matches `*` immediately followed by
 * a JSON value terminator (`,` `}` `]`), so quoted strings are untouched.
 */
export function sanitizeNyFedSentinels(raw: string): string {
  return raw.replace(/:\s*\*\s*(?=[,}\]])/g, ": null");
}

function recordsFromPayload(payload: unknown, containerKey: string): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const container = (((payload as Record<string, unknown>).pd as Record<string, unknown>)?.marketshare as Record<string, unknown>)?.[containerKey];
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

export function marketShareReleaseDate(payload: unknown, containerKey: string): string | null {
  const marketshare = ((payload as Record<string, unknown>)?.pd as Record<string, unknown>)?.marketshare as Record<string, unknown>;
  const container = marketshare?.[containerKey] as Record<string, unknown> | undefined;
  return toDate(container?.releaseDate ?? marketshare?.releaseDate);
}

/**
 * Pure transform: parsed feed payloads → time-series observations.
 */
export function buildMarketShareObservations(
  payloads: Array<{ raw: unknown; feed: MarketShareFeed; date: string | null }>
): MarketTimeSeriesObservationInput[] {
  const observations: MarketTimeSeriesObservationInput[] = [];
  for (const payload of payloads) {
    for (const row of recordsFromPayload(payload.raw, payload.feed.containerKey)) {
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
          frequency: payload.feed.frequencyLabel,
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
  return observations;
}
