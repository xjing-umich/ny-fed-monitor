import type { SupabaseClient } from "@supabase/supabase-js";
import { VALUATION_MODEL_VERSION } from "../../src/lib/valuation/modelVersion";

export type PublicationSnapshot = {
  ticker: string;
  reliable: boolean;
  in_strike_zone: boolean;
  verdict_bucket: string;
  updated_at: string;
  payload: Record<string, unknown>;
};

/** Includes invalidated rows: their outstanding cache-publication intent must survive retries. */
export async function readSnapshotPublicationState(db: SupabaseClient): Promise<Map<string, PublicationSnapshot>> {
  const rows = new Map<string, PublicationSnapshot>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("valuation_snapshot")
      .select("ticker,reliable,in_strike_zone,verdict_bucket,updated_at,payload")
      .eq("payload->>model_version", VALUATION_MODEL_VERSION)
      .order("ticker").range(from, from + 999);
    if (error) throw new Error(`Snapshot publication state read failed: ${error.message}`);
    for (const row of data ?? []) rows.set(row.ticker, row as PublicationSnapshot);
    if (!data || data.length < 1000) return rows;
  }
}

/** Flag safety downgrades, while carrying forward any failed refresh across subsequent upserts. */
export function prepareSnapshotPublication<T extends { payload: Record<string, unknown> }>(
  row: T & { reliable: boolean; in_strike_zone: boolean; verdict_bucket: string },
  prior?: PublicationSnapshot,
): T {
  const wasCheap = prior?.in_strike_zone || prior?.verdict_bucket === "below";
  const isCheap = row.in_strike_zone || row.verdict_bucket === "below";
  const downgrade = prior?.payload.assessment_status === "valid" && prior.reliable &&
    (!row.reliable || (wasCheap && !isCheap));
  return { ...row, payload: { ...row.payload,
    revalidation_pending: prior?.payload.revalidation_pending === true ||
      prior?.payload.assessment_status !== "valid" || !!downgrade,
  } };
}

/** Acknowledge only the generations observed before the successful refresh, never concurrent writes. */
export async function refreshSnapshotPublication(
  db: SupabaseClient,
  refresh: () => Promise<void>,
): Promise<{ pending: number; acknowledged: number }> {
  const pending = [...(await readSnapshotPublicationState(db)).values()]
    .filter(row => row.payload.revalidation_pending === true);
  await refresh(); // Failure leaves every pending marker durable for the next workflow run.
  let acknowledged = 0;
  for (let from = 0; from < pending.length; from += 5) {
    const counts = await Promise.all(pending.slice(from, from + 5).map(async row => {
      const { error, count } = await db.from("valuation_snapshot")
        .update({ payload: { ...row.payload, revalidation_pending: false } }, { count: "exact" })
        .eq("ticker", row.ticker).eq("updated_at", row.updated_at)
        .eq("payload->>model_version", VALUATION_MODEL_VERSION)
        .eq("payload->>revalidation_pending", "true");
      if (error) throw new Error(`Snapshot publication acknowledgement failed: ${error.message}`);
      return count ?? 0;
    }));
    acknowledged += counts.reduce((sum, count) => sum + count, 0);
  }
  return { pending: pending.length, acknowledged };
}
