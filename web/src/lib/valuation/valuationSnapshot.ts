import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb, withRetry } from "@/lib/managers/db";
import type { VerdictBucket, VerdictCoverage } from "./deriveValuationVerdict";
import { isImplausibleBand } from "./deriveValuationVerdict";
import type { ExpectationsAssessment, MoatCapAssessment } from "./types";

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
  reliable: boolean;
  computedAt: string;
  expectations?: ExpectationsAssessment;
  moatCap?: MoatCapAssessment;
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
  reliable: boolean;
  computed_at: string;
  payload?: { expectations?: ExpectationsAssessment; moatCap?: MoatCapAssessment } | null;
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
        const v: SnapshotVerdict = {
          ticker: r.ticker.toUpperCase(),
          bucket: r.verdict_bucket as VerdictBucket,
          inStrikeZone: r.in_strike_zone,
          rangeLo: Number(r.range_lo),
          rangeHi: Number(r.range_hi),
          price: Number(r.price),
          priceDate: r.price_date ?? "",
          marginPct: r.margin_pct == null ? null : Number(r.margin_pct),
          coverage: r.coverage as VerdictCoverage,
          reliable: r.reliable ?? true,
          computedAt: r.computed_at,
          expectations: r.payload?.expectations,
          moatCap: r.payload?.moatCap,
        };
        // 读层防御:坏数据行(价值带与现价严重脱节 / >80% 假安全边际)不发徽章 → 该行降级 "—"
        // (覆盖诚实),与 screener 各视图统一过 isImplausibleBand 同口径(即便快照尚有旧脏行)。
        // single_lamp / reliable=false 非脏数据,保留 —— 徽章分别以 * 与 ⚠ 诚实标注。
        if (isImplausibleBand(v)) continue;
        out.set(v.ticker, v);
      }
      return out;
    } catch (err) {
      console.error(`readValuationVerdicts 异常: ${err instanceof Error ? err.message : String(err)}`);
      return out;
    }
  },
);

export type StrikeLeader = {
  ticker: string;
  rangeLo: number;
  rangeHi: number;
  marginPct: number | null;
  computedAt: string;
};

/**
 * 取"现在落在 strike zone"的全表总数 + 安全边际最高的 Top N(首页值不值腿用)。
 * 同样优雅降级:无 env / 表未迁移(42P01 / PGRST205)/ 出错 → { total:0, leaders:[] },绝不抛。
 */
export const readStrikeZoneLeaders = cache(
  async (limit: number): Promise<{ total: number; leaders: StrikeLeader[] }> => {
    const empty = { total: 0, leaders: [] as StrikeLeader[] };
    if (!hasSupabaseEnv()) return empty;
    const isMissingTable = (e: unknown) => {
      const code = (e as { code?: string }).code;
      return code === "42P01" || code === "PGRST205";
    };
    try {
      // 计数与 leaders 只认可靠(reliable)的 —— 与 /stocks/screener strike_zone 视图同一信心闸:
      // 带红旗(周期峰值/高杠杆/模型不稳/per-share 疑错)不据此标"落在 strike zone"。single_lamp
      // 单法但无红旗仍算数(OE-DCF 对多数深折价名算不出值,若强求两法夹逼会把 tab 架空成几乎为空;
      // 见 [[valuation-broad-universe-guardrails]] 的口径修订)。(head 计数无法过 isImplausibleBand,
      // 可能仍含极少脏行;重跑 valuation:ingest 清表后彻底干净。)
      const { count, error: cErr } = await withRetry(() =>
        getDb()
          .from("valuation_snapshot")
          .select("ticker", { count: "exact", head: true })
          .eq("in_strike_zone", true)
          .eq("reliable", true),
      );
      if (cErr) {
        if (!isMissingTable(cErr))
          console.error(`readStrikeZoneLeaders count 失败: ${(cErr as Error).message}`);
        return empty;
      }
      // 多取一些再过滤:坏数据行(假高边际)按 margin DESC 恰会浮到榜首,故 limit 行可能全是脏行;
      // 取 limit 的数倍、读层过 isImplausibleBand 后再截断,保证首页榜呈现干净的 Top N。
      const overscan = Math.max(limit * 5, 20);
      const { data, error } = await withRetry(() =>
        getDb()
          .from("valuation_snapshot")
          .select("ticker,range_lo,range_hi,price,margin_pct,computed_at")
          .eq("in_strike_zone", true)
          .eq("reliable", true)
          .order("margin_pct", { ascending: false })
          .limit(overscan),
      );
      if (error) {
        if (!isMissingTable(error))
          console.error(`readStrikeZoneLeaders 失败: ${(error as Error).message}`);
        return empty;
      }
      const leaders: StrikeLeader[] = (data ?? [])
        .filter(
          (r: Record<string, unknown>) =>
            !isImplausibleBand({
              rangeLo: Number(r.range_lo),
              rangeHi: Number(r.range_hi),
              price: Number(r.price),
              marginPct: r.margin_pct == null ? null : Number(r.margin_pct),
            }),
        )
        .slice(0, limit)
        .map((r: Record<string, unknown>) => ({
          ticker: String(r.ticker).toUpperCase(),
          rangeLo: Number(r.range_lo),
          rangeHi: Number(r.range_hi),
          marginPct: r.margin_pct == null ? null : Number(r.margin_pct),
          computedAt: String(r.computed_at),
        }));
      return { total: count ?? leaders.length, leaders };
    } catch (err) {
      console.error(`readStrikeZoneLeaders 异常: ${err instanceof Error ? err.message : String(err)}`);
      return empty;
    }
  },
);

export type ScreenView = "strike_zone" | "below" | "all";

export type ScreenerRow = {
  ticker: string;
  issuer: string;
  bucket: VerdictBucket;
  inStrikeZone: boolean;
  rangeLo: number;
  rangeHi: number;
  price: number;
  priceDate: string;
  marginPct: number | null;
  coverage: VerdictCoverage;
  reliable: boolean;
  computedAt: string;
  holderCount: number;
};

/**
 * 估值 screener 数据(/stocks/screener 用)。两查询 join:
 *   ① valuation_snapshot 按 view 过滤 + margin_pct DESC(NULLS LAST)
 *   ② consensus_holdings 批量补 issuer + holder_count(单查询, 零 per-ticker 扇出)
 * strikeTotal = 全表 in_strike_zone 计数(与 view 无关, 供顶部句)。
 * 优雅降级:无 env / 表缺(42P01/PGRST205)/ 出错 → 空结果, 绝不抛。
 */
export const readValuationScreen = cache(
  async (
    view: ScreenView,
    limit: number,
  ): Promise<{ rows: ScreenerRow[]; strikeTotal: number; computedAt: string | null }> => {
    const empty = { rows: [] as ScreenerRow[], strikeTotal: 0, computedAt: null as string | null };
    if (!hasSupabaseEnv()) return empty;
    const isMissingTable = (e: unknown) => {
      const code = (e as { code?: string }).code;
      return code === "42P01" || code === "PGRST205";
    };
    try {
      // ① strike-zone 全表计数(顶部句)。只数可靠(reliable)的 —— 与下方视图口径一致:
      // 带红旗(周期峰值/高杠杆/模型不稳/per-share疑错)不足以认定"落在 strike zone"。
      // single_lamp 单法但无红旗仍计入(不强求两法夹逼,见下 ②)。
      const { count, error: cErr } = await withRetry(() =>
        getDb()
          .from("valuation_snapshot")
          .select("ticker", { count: "exact", head: true })
          .eq("in_strike_zone", true)
          .eq("reliable", true),
      );
      if (cErr && !isMissingTable(cErr)) console.error(`readValuationScreen count 失败: ${(cErr as Error).message}`);
      const strikeTotal = cErr ? 0 : count ?? 0;

      // ② 主查询(thunk 内重建 builder)。strike_zone/below 视图的信心闸 = reliable=true:
      // 位置可算但带红旗(周期峰值/高杠杆/模型不稳/per-share疑错)的不标便宜。不强求两法夹逼
      // (coverage=full)—— OE-DCF 对多数深折价名算不出值,强求会把这两个视图架空成几乎为空;
      // single_lamp 单法但无红旗的深折价名应当出现在这里(口径修订见 [[valuation-broad-universe-guardrails]])。
      const runMain = () => {
        let q = getDb()
          .from("valuation_snapshot")
          .select("ticker,verdict_bucket,in_strike_zone,range_lo,range_hi,price,price_date,margin_pct,coverage,reliable,computed_at")
          .order("margin_pct", { ascending: false, nullsFirst: false })
          .limit(limit);
        // "便宜"视图(strike_zone/below)只要求 reliable=true:带红旗的不据此标便宜。
        if (view === "strike_zone") q = q.eq("in_strike_zone", true).eq("reliable", true);
        else if (view === "below") q = q.eq("verdict_bucket", "below").eq("reliable", true);
        return q;
      };
      const { data, error } = await withRetry(runMain);
      if (error) {
        if (!isMissingTable(error)) console.error(`readValuationScreen 失败: ${(error as Error).message}`);
        return { ...empty, strikeTotal };
      }
      const snapRows = (data ?? []) as Row[];
      if (snapRows.length === 0) return { rows: [], strikeTotal, computedAt: null };

      // ③ join consensus_holdings 取 issuer + holder_count
      const tickers = snapRows.map((r) => r.ticker.toUpperCase());
      const holders = new Map<string, { issuer: string; holderCount: number }>();
      const { data: hData, error: hErr } = await withRetry(() =>
        getDb().from("consensus_holdings").select("ticker,issuer,holder_count").in("ticker", tickers),
      );
      if (hErr) {
        if (!isMissingTable(hErr)) console.error(`readValuationScreen holders 失败: ${(hErr as Error).message}`);
      } else {
        for (const h of (hData ?? []) as { ticker: string; issuer: string | null; holder_count: number | null }[])
          holders.set(h.ticker.toUpperCase(), { issuer: h.issuer ?? "", holderCount: h.holder_count ?? 0 });
      }

      const rows: ScreenerRow[] = snapRows.map((r) => {
        const tk = r.ticker.toUpperCase();
        const h = holders.get(tk);
        return {
          ticker: tk,
          issuer: h?.issuer || tk,
          bucket: r.verdict_bucket as VerdictBucket,
          inStrikeZone: r.in_strike_zone,
          rangeLo: Number(r.range_lo),
          rangeHi: Number(r.range_hi),
          price: Number(r.price),
          priceDate: r.price_date ?? "",
          marginPct: r.margin_pct == null ? null : Number(r.margin_pct),
          coverage: r.coverage as VerdictCoverage,
          reliable: r.reliable ?? true,
          computedAt: r.computed_at,
          holderCount: h?.holderCount ?? 0,
        };
      })
        // 读层防御:坏数据行(价值带与现价严重脱节)不进面 —— 即便快照尚有旧脏行(重跑 ingest 前)。
        .filter((r) => !isImplausibleBand(r));
      const computedAt = rows.reduce<string | null>(
        (mx, r) => (mx == null || r.computedAt > mx ? r.computedAt : mx),
        null,
      );
      return { rows, strikeTotal, computedAt };
    } catch (err) {
      console.error(`readValuationScreen 异常: ${err instanceof Error ? err.message : String(err)}`);
      return empty;
    }
  },
);
