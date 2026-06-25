import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb, withRetry } from "@/lib/managers/db";
import type { VerdictBucket, VerdictCoverage } from "./deriveValuationVerdict";

export type SnapshotVerdict = {
  ticker: string;
  bucket: VerdictBucket;
  inStrikeZone: boolean;
  rangeLo: number;
  rangeHi: number;
  price: number;
  priceDate: string;
  marginPct: number | null;
  coverage: VerdictCoverage;
  computedAt: string;
};

type Row = {
  ticker: string;
  verdict_bucket: string;
  in_strike_zone: boolean;
  range_lo: number;
  range_hi: number;
  price: number;
  price_date: string | null;
  margin_pct: number | null;
  coverage: string;
  computed_at: string;
};

/**
 * 批量读估值快照(投资人页持仓表用)。key=ticker 大写。
 * 关键:任何异常都**优雅返回空 Map,绝不抛**——投资人页是核心 SEO 页,
 * 估值叠加是增益而非命脉。无 env / 表未迁移(42P01)/ 查询出错 / 空入参 → 空 Map,
 * 页面降级为无徽章无精选条。新鲜快照由 scripts/valuation-ingest.ts 周期写入。
 */
export const readValuationVerdicts = cache(
  async (tickers: string[]): Promise<Map<string, SnapshotVerdict>> => {
    const out = new Map<string, SnapshotVerdict>();
    const keys = Array.from(new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean)));
    if (keys.length === 0 || !hasSupabaseEnv()) return out;
    try {
      const { data, error } = await withRetry(() =>
        getDb().from("valuation_snapshot").select("*").in("ticker", keys),
      );
      if (error) {
        // 42P01 = 原生 postgres "undefined table"；PGRST205 = PostgREST 在 schema cache 找不到表。
        // 二者都意味"表未迁移"，属预期降级态(部署后、跑 migration 前)，静默；其余错误才上报。
        const code = (error as { code?: string }).code;
        if (code !== "42P01" && code !== "PGRST205")
          console.error(`readValuationVerdicts 失败: ${(error as Error).message}`);
        return out;
      }
      for (const r of (data ?? []) as Row[]) {
        out.set(r.ticker.toUpperCase(), {
          ticker: r.ticker.toUpperCase(),
          bucket: r.verdict_bucket as VerdictBucket,
          inStrikeZone: r.in_strike_zone,
          rangeLo: Number(r.range_lo),
          rangeHi: Number(r.range_hi),
          price: Number(r.price),
          priceDate: r.price_date ?? "",
          marginPct: r.margin_pct == null ? null : Number(r.margin_pct),
          coverage: r.coverage as VerdictCoverage,
          computedAt: r.computed_at,
        });
      }
      return out;
    } catch (err) {
      console.error(`readValuationVerdicts 异常: ${err instanceof Error ? err.message : String(err)}`);
      return out;
    }
  },
);
