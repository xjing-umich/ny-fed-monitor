import "server-only";
import { cache } from "react";
import { fetchFredSeries } from "@/lib/sources/fred";
import { pickLatestFredPoint } from "@/lib/valuation/ownerEarningsDcf";

/** Hard cap on the live FRED fetch so a hung connection can never stall a page
 * render / static export (a hang, unlike a fast failure, isn't otherwise caught). */
const DGS10_TIMEOUT_MS = 6000;

/**
 * Latest FRED DGS10 (10-year treasury, percent) with its as-of date.
 * Live fetch (Next fetch-cache, 1h revalidate via fetchFredSeries). Any failure
 * OR timeout → null, which the owner-earnings DCF treats as "not anchored to live
 * treasury" (graceful fallback band) — never a thrown/hanging render.
 */
export const getLatestDgs10 = cache(async (): Promise<{ value: number; date: string } | null> => {
  try {
    const series = await Promise.race([
      fetchFredSeries("DGS10"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`DGS10 fetch timed out after ${DGS10_TIMEOUT_MS}ms`)), DGS10_TIMEOUT_MS),
      ),
    ]);
    return pickLatestFredPoint(series.points);
  } catch (err) {
    console.error(`getLatestDgs10 failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
});
