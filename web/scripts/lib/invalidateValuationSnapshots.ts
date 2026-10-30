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
    const { error, count } = await db
      .from("valuation_snapshot")
      .update(
        {
          reliable: false,
          in_strike_zone: false,
          payload: {
            model_version: VALUATION_MODEL_VERSION,
            assessment_status: "invalidated",
            revalidation_pending: true,
            suppressed_reason: "valuation_suppressed",
            invalidated_at: computedAt,
          },
          updated_at: computedAt,
        },
        { count: "exact" },
      )
      .in("ticker", keys.slice(from, from + 100))
      .eq("payload->>model_version", VALUATION_MODEL_VERSION)
      .eq("payload->>assessment_status", "valid");
    if (error)
      throw new Error(`Snapshot invalidation failed: ${error.message}`);
    invalidated += count ?? 0;
    onProgress?.(invalidated);
  }
  return invalidated;
}
