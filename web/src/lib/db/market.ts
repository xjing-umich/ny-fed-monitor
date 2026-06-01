import "server-only";
import { getDb } from "@/lib/managers/db";

export type MarketIngestionStatus = "success" | "partial" | "failed" | "empty" | "stale";

export type MarketDataSource = {
  id: number;
  name: string;
  provider: string;
  official_url: string;
  api_endpoint: string | null;
  update_frequency: string;
  expected_lag_days: number;
  is_manual: boolean;
  limitation_note: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketTimeSeriesObservationInput = {
  source_id: number;
  series_code: string;
  observation_date: string;
  value: number | null;
  unit?: string | null;
  metadata?: Record<string, unknown>;
};

export type MarketIngestionRunInput = {
  source_id: number;
  started_at?: string;
  finished_at?: string | null;
  status: MarketIngestionStatus;
  rows_fetched?: number;
  latest_observation_date?: string | null;
  error_message?: string | null;
  raw_response_hash?: string | null;
};

export async function listMarketDataSources(): Promise<MarketDataSource[]> {
  const { data, error } = await getDb()
    .from("market_data_sources")
    .select("*")
    .order("provider", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as MarketDataSource[];
}

export async function upsertTimeSeriesObservations(
  observations: MarketTimeSeriesObservationInput[]
): Promise<number> {
  if (observations.length === 0) return 0;

  const rows = observations.map((observation) => ({
    source_id: observation.source_id,
    series_code: observation.series_code,
    observation_date: observation.observation_date,
    value: observation.value,
    unit: observation.unit ?? null,
    metadata: observation.metadata ?? {},
  }));

  const { error } = await getDb()
    .from("market_time_series_observations")
    .upsert(rows, {
      onConflict: "source_id,series_code,observation_date",
      ignoreDuplicates: false,
    });

  if (error) throw error;
  return rows.length;
}

export async function recordIngestionRun(input: MarketIngestionRunInput): Promise<number> {
  const { data, error } = await getDb()
    .from("market_ingestion_runs")
    .insert({
      source_id: input.source_id,
      started_at: input.started_at ?? new Date().toISOString(),
      finished_at: input.finished_at ?? null,
      status: input.status,
      rows_fetched: input.rows_fetched ?? 0,
      latest_observation_date: input.latest_observation_date ?? null,
      error_message: input.error_message ?? null,
      raw_response_hash: input.raw_response_hash ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return Number(data.id);
}
