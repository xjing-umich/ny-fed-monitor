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
// 进程级熔断:一旦本次构建中 FRED 失败一次(出网受限/超时),后续所有个股页直接返回 null,
// 不再每页重付 8s 超时 → 即使 FRED 全程不可达,构建也只在首个落地页等一次,绝不累积超 60s/页。
// 下次构建/ISR 在新进程里 flag 自动重置、重新尝试。
let dgs10Unreachable = false;

export const getLatestDgs10 = cache(async (): Promise<{ value: number; date: string } | null> => {
  if (dgs10Unreachable) return null;
  try {
    const series = await Promise.race([
      fetchFredSeries("DGS10"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`DGS10 fetch timed out after ${DGS10_TIMEOUT_MS}ms`)), DGS10_TIMEOUT_MS),
      ),
    ]);
    return pickLatestFredPoint(series.points);
  } catch (err) {
    dgs10Unreachable = true;
    console.error(`getLatestDgs10 failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
});
