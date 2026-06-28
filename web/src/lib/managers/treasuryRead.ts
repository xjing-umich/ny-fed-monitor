import "server-only";
import { cache } from "react";
import { fetchFredSeries } from "@/lib/sources/fred";
import { pickLatestFredPoint } from "@/lib/valuation/ownerEarningsDcf";
import { hasSupabaseEnv, getDb, withRetry } from "@/lib/managers/db";

/** Hard cap on the live FRED fetch so a hung connection can never stall a page
 * render / static export (a hang, unlike a fast failure, isn't otherwise caught). */
const DGS10_TIMEOUT_MS = 6000;

/** 批量 ingest 的耐心抓取上限(graph-CSV 慢, 6s 在 CI 也常超时)。仅用于 persistDgs10。 */
const DGS10_PERSIST_TIMEOUT_MS = 20000;
const DGS10_PERSIST_RETRIES = 2;

type Dgs10 = { value: number; date: string };

/**
 * 读 DB 持久化的 last-good DGS10(market_rates 表)。live FRED 失败时的回退锚。
 * 表缺 / 无 env / 出错 → null(维持诚实降级)。
 */
async function readLastGoodDgs10(): Promise<Dgs10 | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const { data, error } = await withRetry(() =>
      getDb().from("market_rates").select("value,as_of").eq("series_id", "DGS10").maybeSingle(),
    );
    if (error || !data) return null;
    const value = Number((data as { value: number }).value);
    const date = (data as { as_of: string }).as_of;
    return Number.isFinite(value) && date ? { value, date } : null;
  } catch {
    return null;
  }
}

/**
 * 耐心抓取 FRED DGS10 并 upsert 到 market_rates(供 getLatestDgs10 在 live 失败时回退)。
 * 批量上下文(valuation-ingest / cron)循环前调一次。更长超时 + 重试, 因 graph-CSV 端点慢、
 * 6s 硬超时在生产 CI 也常失败。任何失败都不抛、不污染既有 last-good。返回是否刷新成功。
 */
export async function persistDgs10(): Promise<boolean> {
  if (!hasSupabaseEnv()) return false;
  for (let attempt = 0; attempt <= DGS10_PERSIST_RETRIES; attempt++) {
    try {
      const series = await fetchFredSeries("DGS10", DGS10_PERSIST_TIMEOUT_MS);
      const latest = pickLatestFredPoint(series.points);
      if (!latest) throw new Error("no usable DGS10 point");
      const { error } = await withRetry(() =>
        getDb()
          .from("market_rates")
          .upsert(
            { series_id: "DGS10", value: latest.value, as_of: latest.date, updated_at: new Date().toISOString() },
            { onConflict: "series_id" },
          ),
      );
      if (error) throw new Error((error as { message?: string }).message ?? "upsert error");
      console.log(`persistDgs10: market_rates 已更新 DGS10=${latest.value} as_of ${latest.date}`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < DGS10_PERSIST_RETRIES) continue;
      console.warn(`persistDgs10 失败(${DGS10_PERSIST_RETRIES + 1} 次尝试): ${msg} — 保留既有 last-good`);
      return false;
    }
  }
  return false;
}

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

export const getLatestDgs10 = cache(async (): Promise<Dgs10 | null> => {
  // 熔断后不再付 live 代价, 但仍回退到 DB 持久化的 last-good(persistDgs10 在 ingest/cron 写入)。
  if (dgs10Unreachable) return readLastGoodDgs10();
  try {
    const series = await Promise.race([
      fetchFredSeries("DGS10"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`DGS10 fetch timed out after ${DGS10_TIMEOUT_MS}ms`)), DGS10_TIMEOUT_MS),
      ),
    ]);
    const live = pickLatestFredPoint(series.points);
    if (live) return live;
    // live 返回但无可用点 → 回退 last-good。
    return readLastGoodDgs10();
  } catch (err) {
    dgs10Unreachable = true;
    console.error(`getLatestDgs10 failed: ${err instanceof Error ? err.message : String(err)} — 回退 DB last-good`);
    // live 失败/超时 → 回退到 DB 持久化的 last-good(带 as-of 日期, 远优于未锚定回退带)。
    return readLastGoodDgs10();
  }
});
