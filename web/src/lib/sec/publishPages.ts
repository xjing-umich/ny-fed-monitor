import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshFundamentalQueue } from "./fundamentalPublication";
import { targetedPaths } from "../revalidate/targets";

/** Server ingestion routes share the same durable intent as the holdings CLI. */
export async function publishFinancialPages(
  db: SupabaseClient,
  invalidate: (path: string, type?: "page") => void = revalidatePath,
): Promise<number> {
  return refreshFundamentalQueue(db, async (tickers) => {
    for (const path of targetedPaths(tickers, false)) invalidate(path);
  });
}
