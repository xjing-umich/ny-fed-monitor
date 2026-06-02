import "server-only";
import { getDb } from "@/lib/managers/db";
import { listMarketDataSources, type MarketDataSource } from "@/lib/db/market";

export type MarketFreshnessStatusValue =
  | "fresh"
  | "stale"
  | "empty"
  | "partial"
  | "failed"
  | "manual_required"
  | "unknown";

export type MarketFreshnessStatus = {
  id: number;
  source_id: number;
  latest_observation_date: string | null;
  last_successful_fetch: string | null;
  freshness_status: MarketFreshnessStatusValue;
  days_since_latest: number | null;
  expected_frequency: string | null;
  checked_at: string;
  warning: string | null;
};

export type MarketFreshnessStatusInput = {
  source_id: number;
  latest_observation_date?: string | null;
  last_successful_fetch?: string | null;
  freshness_status: MarketFreshnessStatusValue;
  days_since_latest?: number | null;
  expected_frequency?: string | null;
  checked_at?: string;
  warning?: string | null;
};

export type MarketFreshnessStatusRow = MarketFreshnessStatus & {
  source: MarketDataSource | null;
};

export type MarketFreshnessReport = {
  data_status_summary: {
    total_modules: number;
    fresh: number;
    stale: number;
    failed: number;
    manual_required: number;
    unknown: number;
    partial: number;
    empty: number;
  };
  fresh_modules: MarketFreshnessStatusRow[];
  stale_modules: MarketFreshnessStatusRow[];
  failed_modules: MarketFreshnessStatusRow[];
  partial_modules: MarketFreshnessStatusRow[];
  empty_modules: MarketFreshnessStatusRow[];
  manual_required_modules: MarketFreshnessStatusRow[];
  unknown_modules: MarketFreshnessStatusRow[];
  safe_to_analyze: boolean;
  warnings: string[];
};

type FreshnessJoinRow = MarketFreshnessStatus & {
  market_data_sources: MarketDataSource | null;
};

export async function getFreshnessStatus(): Promise<MarketFreshnessStatusRow[]> {
  const [sources, statusResult] = await Promise.all([
    listMarketDataSources(),
    getDb()
      .from("market_freshness_status")
      .select("*, market_data_sources(*)")
      .order("checked_at", { ascending: false }),
  ]);

  if (statusResult.error) throw statusResult.error;

  const rowsBySource = new Map(
    ((statusResult.data ?? []) as FreshnessJoinRow[]).map((row) => [row.source_id, row])
  );

  return sources.map((source) => {
    const row = rowsBySource.get(source.id);
    if (!row) {
      return {
        id: 0,
        source_id: source.id,
        latest_observation_date: null,
        last_successful_fetch: null,
        freshness_status: "unknown",
        days_since_latest: null,
        expected_frequency: source.update_frequency,
        checked_at: new Date().toISOString(),
        warning: "No freshness record has been written for this source yet.",
        source,
      };
    }
    return {
      id: row.id,
      source_id: row.source_id,
      latest_observation_date: row.latest_observation_date,
      last_successful_fetch: row.last_successful_fetch,
      freshness_status: row.freshness_status,
      days_since_latest: row.days_since_latest,
      expected_frequency: row.expected_frequency,
      checked_at: row.checked_at,
      warning: row.warning,
      source: row.market_data_sources ?? source,
    };
  });
}

export async function updateFreshnessStatus(
  input: MarketFreshnessStatusInput
): Promise<MarketFreshnessStatus> {
  const { data, error } = await getDb()
    .from("market_freshness_status")
    .upsert(
      {
        source_id: input.source_id,
        latest_observation_date: input.latest_observation_date ?? null,
        last_successful_fetch: input.last_successful_fetch ?? null,
        freshness_status: input.freshness_status,
        days_since_latest: input.days_since_latest ?? null,
        expected_frequency: input.expected_frequency ?? null,
        checked_at: input.checked_at ?? new Date().toISOString(),
        warning: input.warning ?? null,
      },
      { onConflict: "source_id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as MarketFreshnessStatus;
}

export async function getFreshnessReport(): Promise<MarketFreshnessReport> {
  const rows = await getFreshnessStatus();

  const byStatus = (status: MarketFreshnessStatusValue) =>
    rows.filter((row) => row.freshness_status === status);

  const freshModules = byStatus("fresh");
  const staleModules = byStatus("stale");
  const failedModules = byStatus("failed");
  const manualRequiredModules = byStatus("manual_required");
  const unknownModules = byStatus("unknown");
  const partialModules = byStatus("partial");
  const emptyModules = byStatus("empty");

  const warnings = rows
    .filter((row) => row.warning)
    .map((row) => `${row.source?.name ?? `source:${row.source_id}`}: ${row.warning}`);

  return {
    data_status_summary: {
      total_modules: rows.length,
      fresh: freshModules.length,
      stale: staleModules.length,
      failed: failedModules.length,
      manual_required: manualRequiredModules.length,
      unknown: unknownModules.length,
      partial: partialModules.length,
      empty: emptyModules.length,
    },
    fresh_modules: freshModules,
    stale_modules: staleModules,
    failed_modules: failedModules,
    partial_modules: partialModules,
    empty_modules: emptyModules,
    manual_required_modules: manualRequiredModules,
    unknown_modules: unknownModules,
    safe_to_analyze:
      rows.length > 0 &&
      failedModules.length === 0 &&
      manualRequiredModules.length === 0 &&
      unknownModules.length === 0,
    warnings,
  };
}
