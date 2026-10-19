import { fetchCompanyFacts, type CompanyFacts, type SecFactUnit } from "./company-facts";
import { fetchCompanySubmissions, normalizeRecentFilings, type NormalizedFiling } from "./company-submissions";
import { isOwnPeriod } from "./filing-backfill";
import { sleep } from "./sec-client";

/**
 * 继任注册人(控股重组 / 再注册)→ 把前身 CIK 的历史拼回来。
 *
 * 为什么:XOM 2026-07-01 重组为 ExxonMobil Holdings Corp(8-K12B),SEC company_tickers.json 把
 * XOM 改指新 CIK 0002115436。新 CIK 的 companyfacts 只有重组后那一份 10-Q(含去年同期比较数),
 * FY2025 10-K、2026Q1 等全部历史留在旧 CIK 0000034088 下 → 库里 annual 为空、quarterly 只剩
 * 两行(其中 2025-06-30 还是从比较期取的)。这不是 companyfacts 漏收,PR #204 的回填补不上。
 *
 * 识别:继任者自己的 10-Q/10-K 里,accession 前缀(提交者 CIK)≠ 本 CIK 的那几份 —— 重组过渡期
 * 由前身代为提交(XOM 的 0000034088-26-000093)。该申报会留在继任者 submissions 里多年,所以
 * 拼接不会在下一季自动失效。前缀也可能是申报代理(0001193125 等),代理没有 companyfacts 或对不上
 * 数,由下面的校验排除。
 *
 * 只在继任者「年轻」时尝试:companyfacts 里最早一份 10-Q/10-K 申报晚于今天 − 3 年(还攒不满
 * normalizer 的 12 季)。老公司零额外请求。
 *
 * 校验:只看继任者里「前身时期」(早于继任者第一份自有 10-Q/10-K 报告期)的非零美元事实 —— 同一
 * 家公司会把去年同期数原样重报,一致率接近 100%(XOM 111/112);分拆公司与母公司在同样的期末日
 * 也会碰上不少 0 值、每股数和个别交易额(GEV/GE、SOLV/MMM、KVUE/JNJ、VLTO/DHR 按条数计 45–94 条),
 * 但一致率很低。要求一致 ≥ MIN_OVERLAP 条且一致率 ≥ MIN_MATCH_RATIO。
 *
 * 拼接:以前身 companyfacts 为底,继任者只加入其 10-Q/10-K 自身报告期的事实(比较期数不加入,
 * 与 filing-backfill 同一规则:比较期数据不能覆盖历史;同期按最早申报取值由 normalizer 保证)。
 */

const FORMS = new Set(["10-Q", "10-K"]);
/** 继任者「年轻」的判定:最早一份 10-Q/10-K 申报距今不足 3 年。 */
export const YOUNG_REGISTRANT_DAYS = 3 * 365;
/** 判定为同一家公司所需的完全一致事实条数(前身时期的非零美元事实)。 */
export const MIN_OVERLAP = 10;
/** 判定为同一家公司所需的一致率(前身时期的非零美元事实里,与候选完全一致的占比)。 */
export const MIN_MATCH_RATIO = 0.8;

const factKey = (tag: string, unit: string, u: SecFactUnit) => `${tag}|${unit}|${u.start ?? ""}|${u.end ?? ""}|${u.val}`;

function earliestOwnFiled(facts: CompanyFacts): string | null {
  let earliest: string | null = null;
  for (const concept of Object.values(facts.facts?.["us-gaap"] ?? {}))
    for (const list of Object.values(concept.units ?? {}))
      for (const u of list) if (u.filed && u.form && FORMS.has(u.form) && (!earliest || u.filed < earliest)) earliest = u.filed;
  return earliest;
}

/** 候选前身 CIK:继任者年轻时,其 10-Q/10-K 中 accession 前缀 ≠ 本 CIK 的提交者。 */
export function predecessorCandidates(cik: string, facts: CompanyFacts, filings: NormalizedFiling[], today = new Date()): string[] {
  const earliest = earliestOwnFiled(facts);
  const youngSince = new Date(today.getTime() - YOUNG_REGISTRANT_DAYS * 86_400_000).toISOString().slice(0, 10);
  if (earliest && earliest < youngSince) return [];
  const own = cik.padStart(10, "0");
  const out = new Set<string>();
  for (const f of filings) {
    if (!FORMS.has(f.form)) continue;
    const prefix = f.accession_number.split("-")[0];
    if (/^\d{10}$/.test(prefix) && prefix !== own) out.add(prefix);
  }
  return [...out];
}

export type PredecessorMatch = { matched: number; total: number };

/**
 * 继任者 10-Q/10-K 里「前身时期」的非零美元事实中,与候选前身完全一致(概念、起止、数值)的条数与总数。
 * 前身时期 = end 早于继任者最早一份 10-Q/10-K 的报告期(减容差)—— 这些只能是比较数,继任者以后
 * 自己攒的历史不进分母,所以拼接不会随时间自动失效。
 */
export function predecessorMatch(successor: CompanyFacts, candidate: CompanyFacts, successorFilings: NormalizedFiling[]): PredecessorMatch {
  const firstReport = successorFilings
    .filter((f) => FORMS.has(f.form) && f.report_date)
    .reduce<string | null>((m, f) => (m == null || f.report_date! < m ? f.report_date! : m), null);
  if (!firstReport) return { matched: 0, total: 0 };
  const keys = new Set<string>();
  for (const [tag, concept] of Object.entries(candidate.facts?.["us-gaap"] ?? {}))
    for (const u of concept.units?.USD ?? []) if (u.val) keys.add(factKey(tag, "USD", u));
  let matched = 0;
  let total = 0;
  for (const [tag, concept] of Object.entries(successor.facts?.["us-gaap"] ?? {}))
    for (const u of concept.units?.USD ?? []) {
      if (!u.val || !u.end || !u.form || !FORMS.has(u.form) || u.end >= firstReport || isOwnPeriod(u.end, firstReport)) continue;
      total++;
      if (keys.has(factKey(tag, "USD", u))) matched++;
    }
  return { matched, total };
}

export const isPredecessorMatch = (m: PredecessorMatch) => m.matched >= MIN_OVERLAP && m.matched >= MIN_MATCH_RATIO * m.total;

/**
 * 前身 companyfacts 为底 + 继任者 10-Q/10-K 自身报告期的事实。返回新对象,不改入参。
 * 同一条事实(概念、单位、起止、数值、accession)两边都有时只留一份。
 */
export function mergePredecessorFacts(successor: CompanyFacts, predecessor: CompanyFacts, successorFilings: NormalizedFiling[]): CompanyFacts {
  const reportDate = new Map(successorFilings.filter((f) => FORMS.has(f.form) && f.report_date).map((f) => [f.accession_number, f.report_date!]));
  const ns: CompanyFacts["facts"][string] = {};
  const seen = new Set<string>();
  const add = (tag: string, unit: string, u: SecFactUnit) => {
    const key = `${factKey(tag, unit, u)}|${u.accn ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    const concept = (ns[tag] = ns[tag] ?? { units: {} });
    (concept.units[unit] = concept.units[unit] ?? []).push(u);
  };
  for (const [tag, concept] of Object.entries(predecessor.facts?.["us-gaap"] ?? {}))
    for (const [unit, list] of Object.entries(concept.units ?? {})) for (const u of list) add(tag, unit, u);
  for (const [tag, concept] of Object.entries(successor.facts?.["us-gaap"] ?? {}))
    for (const [unit, list] of Object.entries(concept.units ?? {}))
      for (const u of list) {
        const report = u.accn ? reportDate.get(u.accn) : undefined;
        if (report && u.end && isOwnPeriod(u.end, report)) add(tag, unit, u);
      }
  return { ...successor, facts: { ...successor.facts, "us-gaap": ns } };
}

export type PredecessorResult = { cik: string; match: PredecessorMatch; filings: NormalizedFiling[] };

/**
 * 找到并校验前身后,就地把 facts 换成拼接结果,返回前身 CIK 与其申报(供 sec_filings / normalizer
 * 对齐 period → accession)。找不到或拉取失败返回 null,绝不抛 —— 不打断主 ingest。
 */
export async function attachPredecessorHistory(
  ticker: string,
  cik: string,
  facts: CompanyFacts,
  filings: NormalizedFiling[],
): Promise<PredecessorResult | null> {
  for (const candidate of predecessorCandidates(cik, facts, filings)) {
    try {
      const predFacts = await fetchCompanyFacts(candidate);
      await sleep(150);
      const match = predecessorMatch(facts, predFacts, filings);
      if (!isPredecessorMatch(match)) continue;
      const predSubmission = await fetchCompanySubmissions(candidate);
      const merged = mergePredecessorFacts(facts, predFacts, filings);
      facts.facts = merged.facts;
      return { cik: candidate, match, filings: normalizeRecentFilings(ticker, predSubmission) };
    } catch {
      // 候选是申报代理(无 companyfacts)或 SEC 临时失败:跳过
    }
  }
  return null;
}
