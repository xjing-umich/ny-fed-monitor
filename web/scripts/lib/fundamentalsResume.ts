import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAllPages } from "../../src/lib/managers/db";

// Recovery is intentionally limited to a recent batch of the same ingestion code.
export function parseResumeSince(value: string | undefined, now = Date.now()): string | undefined {
  const input = value?.trim();
  if (!input) return undefined;
  const timestamp = Date.parse(input);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input)
      || !Number.isFinite(timestamp)
      || new Date(timestamp).toISOString() !== input.replace(/Z$/, input.includes(".") ? "Z" : ".000Z")
      || timestamp > now || now - timestamp > 24 * 60 * 60 * 1000) {
    throw new Error("Fundamentals resume requires a UTC ISO timestamp within the past 24 hours");
  }
  return new Date(timestamp).toISOString();
}

type Attempt = { id: string; ticker: string | null; status: string; started_at: string };

export async function readCompletedFundamentals(db: SupabaseClient, since: string | undefined): Promise<Set<string>> {
  if (!since) return new Set();
  const { data, error } = await selectAllPages<Attempt>(() => db.from("sec_ingest_runs")
    .select("id,ticker,status,started_at")
    .eq("run_type", "company").gte("started_at", since)
    .order("ticker").order("started_at", { ascending: false }).order("id", { ascending: false }));
  if (error) throw new Error(`Fundamentals resume journal unavailable: ${error.message}`);
  const latest = new Map<string, Attempt>();
  for (const attempt of data) {
    const ticker = attempt.ticker?.trim().toUpperCase();
    if (!ticker) continue;
    const prior = latest.get(ticker);
    if (!prior || Date.parse(attempt.started_at) > Date.parse(prior.started_at)
        || (attempt.started_at === prior.started_at && attempt.id > prior.id)) latest.set(ticker, attempt);
  }
  return new Set([...latest].filter(([, attempt]) => attempt.status === "success").map(([ticker]) => ticker));
}

export function remainingFundamentals(targets: string[], completed: Set<string>): string[] {
  return targets.filter(ticker => !completed.has(ticker.trim().toUpperCase()));
}
