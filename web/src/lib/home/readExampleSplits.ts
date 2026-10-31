import "server-only";
import { getDb, hasSupabaseEnv } from "@/lib/managers/db";
import { isRealSplit } from "@/lib/managers/splitAdjust";

/** One projected, bounded read for the three fixed examples. If the response is
 * truncated or unavailable, callers withhold comparisons rather than assume no split. */
export async function readExampleSplits(
  tickers: readonly string[],
): Promise<Map<string, string | null> | null> {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("stock_splits")
    .select("ticker,split_date,ratio")
    .in("ticker", [...tickers])
    .order("split_date", { ascending: false })
    .limit(61);
  if (error || !data || data.length > 60) return null;
  const dates = new Map<string, string | null>(tickers.map((t) => [t, null]));
  for (const row of data) {
    if (
      isRealSplit(Number(row.ratio)) &&
      dates.has(row.ticker) &&
      dates.get(row.ticker) === null
    )
      dates.set(row.ticker, row.split_date);
  }
  return dates;
}
