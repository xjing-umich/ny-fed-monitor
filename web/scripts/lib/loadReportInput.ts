// 按报告季度 P 取数。与 computeAndStoreConsensus 同一套表、同一套分页与去重规则,
// 区别只是 period 锁定在 P,而不是“每户最新两季”。
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { freshness13F, globalLatestPeriod } from "../../src/lib/freshness/derive";
import { isImplausibleBand } from "../../src/lib/valuation/deriveValuationVerdict";
import { readAll } from "./computeConsensus";
import type { ReportHolding, ReportInput, ReportManagerInput } from "../../src/lib/reports/types";

type FilingRow = { id: number; period: string; filed_at: string | null };
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

const toHolding = (h: any): ReportHolding => ({
  cusip: h.cusip, issuer: h.issuer, value: Number(h.value), shares: Number(h.shares),
  weight: Number(h.weight ?? 0), putCall: h.put_call ?? null,
});

export async function loadReportInput(db: any, period: string): Promise<{ input: ReportInput; valuationAsOf: string | null }> {
  const seeds = JSON.parse(fs.readFileSync(path.join(__dirname, "../../config/managers.json"), "utf8")) as Array<{ slug: string; people?: Array<{ name: string; zh?: string }> }>;
  const zhBySlug = new Map(seeds.map((s) => [s.slug, s.people?.[0]?.zh ?? null]));
  const featuredSlugs = JSON.parse(fs.readFileSync(path.join(__dirname, "../../config/report-featured.json"), "utf8")) as string[];

  const cusipMap = new Map<string, { ticker: string | null; name: string | null }>();
  for (const r of await readAll(db, "security_cusips", "cusip,ticker,issuer", (q) => q.order("cusip", { ascending: true })))
    cusipMap.set(r.cusip, { ticker: r.ticker, name: r.issuer });

  const managers = await readAll(db, "managers", "cik,slug,person", (q) => q.order("cik", { ascending: true }));
  const raw: Array<{ m: any; latestPeriod: string | null; current: FilingRow | null; prior: FilingRow | null }> = [];
  for (const m of managers) {
    const rows = (await readAll(db, "filings", "id,period,filed_at", (q) =>
      q.eq("cik", m.cik).order("period", { ascending: false }).order("id", { ascending: false }).limit(16),
    )) as FilingRow[];
    const latestPeriod = rows.reduce<string | null>((acc, r) => (!acc || r.period > acc ? r.period : acc), null);
    raw.push({ m, latestPeriod, ...pickFilingsForPeriod(rows, period) });
  }

  // 活跃口径与全站一致:相对全库最新季落后 ≥4 季的视为停报,整户剔除。
  const gl = globalLatestPeriod(raw.map((r) => r.latestPeriod));
  const active = raw.filter((r) => freshness13F(r.latestPeriod, gl) !== "inactive");

  const holdingsOf = async (f: FilingRow | null) =>
    f
      ? (await readAll(db, "holdings", "cusip,issuer,value,shares,weight,put_call", (q) => q.eq("filing_id", f.id).order("id", { ascending: true }))).map(toHolding)
      : null;

  const out: ReportManagerInput[] = [];
  for (const r of active) {
    out.push({
      slug: r.m.slug,
      person: r.m.person,
      personZh: zhBySlug.get(r.m.slug) ?? null,
      current: await holdingsOf(r.current),
      prior: await holdingsOf(r.prior),
    });
  }

  const { data: vrows, error: verr } = await db
    .from("valuation_snapshot")
    .select("ticker,range_lo,range_hi,price,price_date,margin_pct,in_strike_zone,verdict_bucket")
    .eq("reliable", true)
    .or("in_strike_zone.eq.true,verdict_bucket.eq.below")
    .limit(500);
  if (verr) throw new Error(`valuation_snapshot read: ${verr.message}`);
  const bargains = new Map<string, { inStrikeZone: boolean; marginPct: number }>();
  let valuationAsOf: string | null = null;
  for (const v of vrows ?? []) {
    const marginPct = v.margin_pct == null ? null : Number(v.margin_pct);
    if (marginPct == null || marginPct <= 0) continue;
    if (isImplausibleBand({ rangeLo: Number(v.range_lo), rangeHi: Number(v.range_hi), price: Number(v.price), marginPct })) continue;
    bargains.set(String(v.ticker).toUpperCase(), { inStrikeZone: !!v.in_strike_zone, marginPct });
    if (v.price_date && (!valuationAsOf || v.price_date > valuationAsOf)) valuationAsOf = v.price_date;
  }

  return { input: { period, managers: out, cusipMap, bargains, featuredSlugs }, valuationAsOf };
}
