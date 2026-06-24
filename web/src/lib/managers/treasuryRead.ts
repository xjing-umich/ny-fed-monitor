import "server-only";
import { cache } from "react";
import { fetchFredSeries } from "@/lib/sources/fred";
import { pickLatestFredPoint } from "@/lib/valuation/ownerEarningsDcf";

/**
 * Latest FRED DGS10 (10-year treasury, percent) with its as-of date.
 * Live fetch (Next fetch-cache, 1h revalidate via fetchFredSeries). Any failure
 * → null, which the owner-earnings DCF treats as "not anchored to live treasury".
 */
export const getLatestDgs10 = cache(async (): Promise<{ value: number; date: string } | null> => {
  try {
    const series = await fetchFredSeries("DGS10");
    return pickLatestFredPoint(series.points);
  } catch (err) {
    console.error(`getLatestDgs10 failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
});
