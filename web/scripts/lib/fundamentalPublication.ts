import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAllPages } from "../../src/lib/managers/db";
export type FundamentalStamp = { ticker: string; content_fingerprint: string };
export type FundamentalPublication = {
  ticker: string;
  fingerprint: string;
  pending: boolean;
  generation: string;
};
const stampFingerprint = (r: FundamentalStamp) => r.content_fingerprint;
export function prepareFundamentalQueue(
  prior: FundamentalPublication[],
  current: FundamentalStamp[],
  successful: string[],
  generation: string,
  force = false,
): FundamentalPublication[] {
  const old = new Map(prior.map((r) => [r.ticker, r]));
  const ok = new Set(successful);
  return current
    .filter(
      (r) =>
        ok.has(r.ticker) &&
        (force || old.get(r.ticker)?.fingerprint !== stampFingerprint(r)),
    )
    .map((r) => ({
      ticker: r.ticker,
      fingerprint: stampFingerprint(r),
      pending: true,
      generation,
    }));
}
export async function readFundamentalQueue(
  db: SupabaseClient,
): Promise<FundamentalPublication[]> {
  const { data, error } = await selectAllPages<FundamentalPublication>(() =>
    db
      .from("fundamental_publications")
      .select("ticker,fingerprint,pending,generation")
      .order("ticker"),
  );
  if (error)
    throw new Error(
      `Fundamental queue read failed: ${error.message}; apply fundamental_publication migration`,
    );
  return data;
}
export async function refreshFundamentalQueue(
  db: SupabaseClient,
  refresh: (tickers: string[]) => Promise<void>,
): Promise<number> {
  const pending = (await readFundamentalQueue(db)).filter((r) => r.pending);
  if (!pending.length) return 0;
  await refresh(pending.map((r) => r.ticker));
  const byGeneration = new Map<string, string[]>();
  for (const r of pending)
    byGeneration.set(r.generation, [
      ...(byGeneration.get(r.generation) || []),
      r.ticker,
    ]);
  let acknowledged = 0;
  for (const [generation, tickers] of byGeneration)
    for (let from = 0; from < tickers.length; from += 100) {
      const { error, count } = await db
        .from("fundamental_publications")
        .update({ pending: false }, { count: "exact" })
        .in("ticker", tickers.slice(from, from + 100))
        .eq("generation", generation)
        .eq("pending", true);
      if (error)
        throw new Error(
          `Fundamental refresh acknowledgement failed: ${error.message}`,
        );
      acknowledged += count ?? 0;
    }
  return acknowledged;
}
