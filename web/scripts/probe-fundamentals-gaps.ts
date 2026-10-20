/**
 * probe-fundamentals-gaps.ts — 基本面期数空洞扫描(只读,不写库)。
 *
 * 对每家非外国发行人公司:sec_filings 里已登记的 10-Q/10-K(报告期在最新一份申报前 ~2.5 年窗口内,
 * 即 normalizer 保留的 12 季 / 6 年范围),若 company_fundamentals_periods 里没有对应 period_end 的行
 * (10-K → FY 行,10-Q → 季度行;±7 天容差给 52/53 周制),记为缺期。按缺期位置分两类:
 *   - hole: 缺期早于库里最新一期 —— 历史空洞(PR #204 的「只补新一期」覆盖不到)
 *   - lag:  缺期晚于库里最新一期 —— 最新季滞后(#204 的领域)
 * 另标 cik_changed:sec_filings 里出现与 sec_companies.cik 不同的 CIK(继任注册人 / 控股重组,如 XOM)。
 * --sec:对有空洞的公司再拉 companyfacts(只读 SEC),把每个空洞分成
 *   not_in_facts(companyfacts 没收这份申报 → 可从原始申报回填)/ in_facts(收了但 normalizer 没归出这期)。
 *
 * 运行: cd web && npx tsx scripts/probe-fundamentals-gaps.ts [--sec] [--json out.json] [TICKER ...]
 */
import fs from "node:fs";

function loadEnvLocal() {
  if (!fs.existsSync(".env.local")) return;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    process.env[key] = process.env[key] ?? line.slice(index + 1).trim().replace(/^"(.*)"$/, "$1");
  }
}

const PAGE = 1000;
const WINDOW_DAYS = Math.round(2.5 * 365);
const TOLERANCE_DAYS = 7;
const day = (d: string) => Date.parse(d) / 86_400_000;

type Company = { ticker: string; cik: string; is_foreign_issuer: boolean | null };
type Filing = { ticker: string; cik: string; form: string; report_date: string | null; accession_number: string };
type Hole = { key: string; accession: string; cik: string; in_facts?: boolean };
type Period = { ticker: string; period_end: string; fiscal_period: string | null };

export type GapRow = {
  ticker: string;
  cik: string;
  latest_period: string | null;
  holes: string[];
  hole_detail: Hole[];
  lag: string[];
  cik_changed: string[];
};

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const jsonIdx = args.indexOf("--json");
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
  const withSec = args.includes("--sec");
  const only = new Set(args.filter((a, i) => !a.startsWith("--") && (jsonIdx < 0 || i !== jsonIdx + 1)).map((a) => a.toUpperCase()));

  const { createServiceSupabaseClient } = await import("../src/lib/supabase/server");
  const supabase = createServiceSupabaseClient();

  async function pageAll<T>(label: string, fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await fetchPage(from, from + PAGE - 1);
      if (error) throw new Error(`${label}: ${error.message}`);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  const companies = await pageAll<Company>("sec_companies", (from, to) =>
    supabase.from("sec_companies").select("ticker,cik,is_foreign_issuer").order("ticker").range(from, to),
  );
  const filings = await pageAll<Filing>("sec_filings", (from, to) =>
    supabase.from("sec_filings").select("ticker,cik,form,report_date,accession_number").in("form", ["10-Q", "10-K"])
      .order("ticker").order("accession_number").range(from, to),
  );
  const periods = await pageAll<Period>("company_fundamentals_periods", (from, to) =>
    supabase.from("company_fundamentals_periods").select("ticker,period_end,fiscal_period")
      .order("ticker").order("period_end").order("fiscal_period").range(from, to),
  );

  const filingsBy = new Map<string, Filing[]>();
  for (const f of filings) filingsBy.set(f.ticker, [...(filingsBy.get(f.ticker) ?? []), f]);
  const periodsBy = new Map<string, Period[]>();
  for (const p of periods) periodsBy.set(p.ticker, [...(periodsBy.get(p.ticker) ?? []), p]);

  const today = new Date().toISOString().slice(0, 10);
  const rows: GapRow[] = [];
  for (const c of companies) {
    if (c.is_foreign_issuer) continue;
    if (only.size && !only.has(c.ticker)) continue;
    const fs_ = (filingsBy.get(c.ticker) ?? []).filter((f) => f.report_date && f.report_date <= today);
    if (!fs_.length) continue;
    const ps = periodsBy.get(c.ticker) ?? [];
    const latestReport = fs_.reduce((m, f) => (f.report_date! > m ? f.report_date! : m), "");
    const latestPeriod = ps.reduce<string | null>((m, p) => (m == null || p.period_end > m ? p.period_end : m), null);
    const has = (end: string, annual: boolean) =>
      ps.some((p) => (p.fiscal_period === "FY") === annual && Math.abs(day(p.period_end) - day(end)) <= TOLERANCE_DAYS);

    const holes: string[] = [];
    const holeDetail: Hole[] = [];
    const lag: string[] = [];
    const seen = new Set<string>();
    for (const f of fs_) {
      if (day(latestReport) - day(f.report_date!) > WINDOW_DAYS) continue;
      const key = `${f.form} ${f.report_date}`;
      if (seen.has(key) || has(f.report_date!, f.form === "10-K")) continue;
      seen.add(key);
      if (latestPeriod != null && f.report_date! < latestPeriod) {
        holes.push(key);
        holeDetail.push({ key, accession: f.accession_number, cik: f.cik });
      } else lag.push(key);
    }
    const cikChanged = [...new Set(fs_.map((f) => f.cik).filter((k) => k && k !== c.cik))];
    if (holes.length || lag.length || cikChanged.length) {
      rows.push({ ticker: c.ticker, cik: c.cik, latest_period: latestPeriod, holes: holes.sort(), hole_detail: holeDetail, lag: lag.sort(), cik_changed: cikChanged });
    }
  }

  const withHoles = rows.filter((r) => r.holes.length);
  if (withSec) {
    const { fetchCompanyFacts } = await import("../src/lib/sec/company-facts");
    const { sleep } = await import("../src/lib/sec/sec-client");
    for (const r of withHoles) {
      try {
        const facts = await fetchCompanyFacts(r.cik);
        const accns = new Set<string>();
        for (const concept of Object.values(facts.facts?.["us-gaap"] ?? {}))
          for (const list of Object.values(concept.units ?? {})) for (const u of list) if (u.accn) accns.add(u.accn);
        for (const h of r.hole_detail) h.in_facts = accns.has(h.accession);
      } catch (e) {
        console.warn(`  ${r.ticker}: companyfacts 拉取失败 ${e instanceof Error ? e.message : e}`);
      }
      await sleep(150);
    }
  }
  const withLag = rows.filter((r) => r.lag.length);
  const cikChanged = rows.filter((r) => r.cik_changed.length);
  console.log(`扫描 ${companies.length} 家公司 / ${filings.length} 份 10-Q/10-K / ${periods.length} 行基本面 (${new Date().toISOString()})`);
  console.log(`  有历史空洞(hole): ${withHoles.length} 家,共 ${withHoles.reduce((s, r) => s + r.holes.length, 0)} 期`);
  console.log(`  有最新季滞后(lag): ${withLag.length} 家,共 ${withLag.reduce((s, r) => s + r.lag.length, 0)} 期`);
  console.log(`  CIK 变更(继任注册人): ${cikChanged.length} 家`);
  const holeCount = new Map<number, number>();
  for (const r of withHoles) holeCount.set(r.holes.length, (holeCount.get(r.holes.length) ?? 0) + 1);
  console.log(`  空洞期数分布: ${[...holeCount].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}期×${v}`).join(", ")}`);
  console.log("\n— CIK 变更 —");
  for (const r of cikChanged) console.log(`  ${r.ticker} cik=${r.cik} 旧=${r.cik_changed.join(",")} latest=${r.latest_period} holes=${r.holes.length} lag=${r.lag.length}`);
  console.log("\n— 历史空洞(按期数降序) —");
  for (const r of [...withHoles].sort((a, b) => b.holes.length - a.holes.length || a.ticker.localeCompare(b.ticker))) {
    const tag = (h: Hole) => (h.in_facts == null ? "" : h.in_facts ? " [in_facts]" : " [not_in_facts]");
    console.log(`  ${r.ticker.padEnd(6)} latest=${r.latest_period} holes=${r.hole_detail.map((h) => h.key + tag(h)).join("; ")}`);
  }
  if (withSec) {
    const all = withHoles.flatMap((r) => r.hole_detail);
    console.log(`\n  空洞里 companyfacts 未收: ${all.filter((h) => h.in_facts === false).length} 期 / 已收但未归一: ${all.filter((h) => h.in_facts).length} 期`);
  }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
