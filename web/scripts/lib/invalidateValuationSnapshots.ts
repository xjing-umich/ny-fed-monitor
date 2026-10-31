import type { SupabaseClient } from "@supabase/supabase-js";
import { VALUATION_MODEL_VERSION } from "../../src/lib/valuation/modelVersion";

/** Non-destructive publication of confirmed suppressions; independent of delete safety gates. */
export async function invalidateValuationSnapshots(
  db: SupabaseClient,
  tickers: string[],
  computedAt: string,
  onProgress?: (count: number) => void,
): Promise<number> {
  let invalidated = 0;
  const keys = [...new Set(tickers)];
  for (let from = 0; from < keys.length; from += 100) {
    const { error, data } = await db.rpc("invalidate_valuation_publications", {
      p_tickers:keys.slice(from,from+100),p_observed_at:computedAt,p_model_version:VALUATION_MODEL_VERSION,
    });
    if (error) throw new Error(`Snapshot/publication invalidation failed: ${error.message}`);
    if (!Number.isSafeInteger(data) || data < 0) throw new Error("Invalid invalidation count returned");
    invalidated += data;
    onProgress?.(invalidated);
  }
  return invalidated;
}
