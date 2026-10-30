import { VALUATION_MODEL_VERSION } from "../../src/lib/valuation/modelVersion";
import { QUARANTINED_TICKERS_SQL } from "../../src/lib/securities/securityIdentity";
// 按报告季度 P 取数。与 computeAndStoreConsensus 同一套表、同一套分页与去重规则,
// 区别只是 period 锁定在 P,而不是“每户最新两季”。
import type { SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { isExpectedFiler } from "../../src/lib/freshness/derive";
import { isImplausibleBand } from "../../src/lib/valuation/deriveValuationVerdict";
import { readAll } from "./computeConsensus";
import { managerLabel } from "../../src/lib/managers/displayName";
import { isMissingTableError } from "../../src/lib/managers/db";
import { factorLookup, NO_SPLITS } from "../../src/lib/managers/splitAdjust";
import type { ReportHolding, ReportInput, ReportManagerInput } from "../../src/lib/reports/types";

type FilingRow = { id: number; period: string; filed_at: string | null };
type ManagerDbRow = { cik: string; slug: string; person: string };
type HoldingDbRow = { cusip: string; issuer: string; value: number | string; shares: number | string; weight: number | string | null; put_call: string | null };
type ValuationDbRow = {
  ticker: string; range_lo: number | string; range_hi: number | string; price: number | string; price_date: string | null;
  margin_pct: number | string | null; in_strike_zone: boolean | null; verdict_bucket: string | null;
};
/** 每位投资人的最近 16 份申报(足够覆盖同季修正件)与最新申报季。 */
export type ManagerFilings = { m: ManagerDbRow; latestPeriod: string | null; rows: FilingRow[] };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const newer = (a: FilingRow, b: FilingRow) => {
  const x = a.filed_at ?? "";
  const y = b.filed_at ?? "";
  return x > y || (x === y && a.id > b.id);
};

/** P 的申报(同季多份取最新)与早于 P 的最近一季申报。 */
export function pickFilingsForPeriod(rows: FilingRow[], period: string): { current: FilingRow | null; prior: FilingRow | null } {
  let current: FilingRow | null = null;
  let prior: FilingRow | null = null;
  for (const r of rows) {
    if (r.period === period) {
      if (!current || newer(r, current)) current = r;
    } else if (r.period < period) {
      if (!prior || r.period > prior.period || (r.period === prior.period && newer(r, prior))) prior = r;
    }
  }
  return { current, prior };
}

/** report-featured.json:[{ slug, zh? }](也兼容旧的纯 slug 字符串数组)。 */
export function parseFeaturedConfig(raw: unknown): { slugs: string[]; zhBySlug: Map<string, string> } {
  if (!Array.isArray(raw)) throw new Error("report-featured.json 必须是数组");
  const slugs: string[] = [];
  const zhBySlug = new Map<string, string>();
  for (const item of raw) {
    if (typeof item === "string") { slugs.push(item); continue; }
    if (!item || typeof item !== "object" || typeof (item as { slug?: unknown }).slug !== "string") throw new Error(`report-featured.json 条目无效: ${JSON.stringify(item)}`);
    const { slug, zh } = item as { slug: string; zh?: unknown };
    slugs.push(slug);
    if (typeof zh === "string" && zh.trim()) zhBySlug.set(slug, zh.trim());
  }
  return { slugs, zhBySlug };
}

const toHolding = (h: HoldingDbRow): ReportHolding => ({
  cusip: h.cusip, issuer: h.issuer, value: Number(h.value), shares: Number(h.shares),
  weight: Number(h.weight ?? 0), putCall: h.put_call ?? null,
});

/** 全部投资人及其最近申报。loadReportInput 与 report-consistency 共用(同一“应申报”与“最新季”口径)。 */
export async function loadManagerFilings(db: SupabaseClient): Promise<ManagerFilings[]> {
  const managers = (await readAll(db, "managers", "cik,slug,person", (q) => q.order("cik", { ascending: true }))) as ManagerDbRow[];
  const out: ManagerFilings[] = [];
  for (const m of managers) {
    const rows = (await readAll(db, "filings", "id,period,filed_at", (q) =>
      q.eq("cik", m.cik).order("period", { ascending: false }).order("id", { ascending: false }).limit(16),
    )) as FilingRow[];
    const latestPeriod = rows.reduce<string | null>((acc, r) => (!acc || r.period > acc ? r.period : acc), null);
    out.push({ m, latestPeriod, rows });
  }
  return out;
}

/** 报告分母 = 应申报 M(与首页申报进度、切季覆盖率同一口径):最新申报期 ≥ 报告季的上一季。 */
export function expectedOnly<T extends { latestPeriod: string | null }>(all: T[], period: string): T[] {
  return all.filter((r) => isExpectedFiler(r.latestPeriod, period));
}

export async function loadReportInput(db: SupabaseClient, period: string): Promise<{ input: ReportInput; valuationAsOf: string | null }> {
  const featured = parseFeaturedConfig(JSON.parse(fs.readFileSync(path.join(__dirname, "../../config/report-featured.json"), "utf8")));
  const featuredSlugs = featured.slugs;

  const cusipMap = new Map<string, { ticker: string | null; name: string | null }>();
  for (const r of await readAll(db, "security_cusips", "cusip,ticker,issuer", (q) => q.order("cusip", { ascending: true })))
    cusipMap.set(r.cusip, { ticker: r.ticker, name: r.issuer });

  const allFilings = await loadManagerFilings(db);
  const expected = expectedOnly(allFilings, period);
  const active = expected.map((r) => ({ ...r, ...pickFilingsForPeriod(r.rows, period) }));

  const holdingsOf = async (f: FilingRow | null) =>
    f
      ? ((await readAll(db, "holdings", "cusip,issuer,value,shares,weight,put_call", (q) => q.eq("filing_id", f.id).order("id", { ascending: true }))) as HoldingDbRow[]).map(toHolding)
      : null;

  // 拆股系数(共识步骤已写入;表未迁移 → 不换算)。
  let splits = NO_SPLITS;
  const { data: sa, error: saErr } = await db.from("split_adjustments").select("cusip,from_period,to_period,factor").eq("to_period", period);
  if (saErr && !isMissingTableError(saErr)) throw new Error(`split_adjustments read: ${saErr.message}`);
  if (sa?.length) splits = factorLookup(sa.map((r: { cusip: string; from_period: string; to_period: string; factor: number | string }) => ({ cusip: r.cusip, fromPeriod: r.from_period, toPeriod: r.to_period, factor: Number(r.factor) })));

  const out: ReportManagerInput[] = [];
  for (const r of active) {
    out.push({
      slug: r.m.slug,
      // 展示名与站内同源(displayName.ts):中文名取名家清单/managers.json;伯克希尔、Daily Journal 按现任掌管人写。
      person: managerLabel("en", r.m.slug, r.m.person),
      personZh: managerLabel("zh", r.m.slug, r.m.person) === r.m.person ? null : managerLabel("zh", r.m.slug, r.m.person),
      current: await holdingsOf(r.current),
      prior: await holdingsOf(r.prior),
      priorPeriod: r.prior?.period ?? null,
    });
  }

  const { data: vrows, error: verr } = await db
    .from("valuation_snapshot")
    .select("ticker,range_lo,range_hi,price,price_date,margin_pct,in_strike_zone,verdict_bucket")
    .eq("payload->>model_version", VALUATION_MODEL_VERSION)
    .eq("payload->>assessment_status", "valid")
    .not("ticker", "in", QUARANTINED_TICKERS_SQL)
    .eq("reliable", true)
    .or("in_strike_zone.eq.true,verdict_bucket.eq.below")
    .limit(500);
  if (verr) throw new Error(`valuation_snapshot read: ${verr.message}`);
  // 有没有任何可靠估值:区分“估值整体不可用”(no_valuation)与“有估值但没有便宜票”(no_qualifying)。
  // 顺带取最新价格日期:没有便宜票时 valuationAsOf 也要有值,否则页面会写“估值暂不可用”而与 no_qualifying 矛盾。
  const { data: latestRel, error: lerr } = await db
    .from("valuation_snapshot")
    .select("price_date")
    .eq("payload->>model_version", VALUATION_MODEL_VERSION)
    .eq("payload->>assessment_status", "valid")
    .not("ticker", "in", QUARANTINED_TICKERS_SQL)
    .eq("reliable", true)
    .order("price_date", { ascending: false, nullsFirst: false })
    .limit(1);
  if (lerr) throw new Error(`valuation_snapshot reliable check: ${lerr.message}`);
  const latestReliable = (latestRel ?? []) as Array<{ price_date: string | null }>;
  const bargains = new Map<string, { inStrikeZone: boolean; marginPct: number }>();
  let valuationAsOf: string | null = null;
  for (const v of (vrows ?? []) as ValuationDbRow[]) {
    const marginPct = v.margin_pct == null ? null : Number(v.margin_pct);
    if (marginPct == null || marginPct <= 0) continue;
    if (isImplausibleBand({ rangeLo: Number(v.range_lo), rangeHi: Number(v.range_hi), price: Number(v.price), marginPct })) continue;
    bargains.set(String(v.ticker).toUpperCase(), { inStrikeZone: !!v.in_strike_zone, marginPct });
    if (v.price_date && (!valuationAsOf || v.price_date > valuationAsOf)) valuationAsOf = v.price_date;
  }

  const valuationAvailable = latestReliable.length > 0;
  if (!valuationAsOf && valuationAvailable) valuationAsOf = latestReliable[0].price_date;
  return { input: { period, managers: out, cusipMap, bargains, featuredSlugs, valuationAvailable, excludedCount: allFilings.length - expected.length, splits }, valuationAsOf };
}
