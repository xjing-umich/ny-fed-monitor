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
 * 校验:候选 CIK 的 companyfacts 与继任者的比较期事实必须有 ≥ MIN_OVERLAP 条(概念、单位、起止、
 * 数值)完全一致 —— 同一家公司的去年同期数原样重报;无关公司或代理不可能对上。
 *
 * 拼接:以前身 companyfacts 为底,继任者只加入其 10-Q/10-K 自身报告期的事实(比较期数不加入,
 * 与 filing-backfill 同一规则:比较期数据不能覆盖历史;同期按最早申报取值由 normalizer 保证)。
 */

const FORMS = new Set(["10-Q", "10-K"]);
/** 继任者「年轻」的判定:最早一份 10-Q/10-K 申报距今不足 3 年。 */
export const YOUNG_REGISTRANT_DAYS = 3 * 365;
/** 判定为同一家公司所需的完全一致事实条数(XOM 实测 138/142)。 */
export const MIN_OVERLAP = 10;

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

/** 继任者与候选前身完全一致的事实条数(概念、单位、起止、数值)。 */
export function overlapCount(successor: CompanyFacts, candidate: CompanyFacts): number {
  const keys = new Set<string>();
  for (const [tag, concept] of Object.entries(candidate.facts?.["us-gaap"] ?? {}))
    for (const [unit, list] of Object.entries(concept.units ?? {})) for (const u of list) keys.add(factKey(tag, unit, u));
  let n = 0;
  for (const [tag, concept] of Object.entries(successor.facts?.["us-gaap"] ?? {}))
    for (const [unit, list] of Object.entries(concept.units ?? {})) for (const u of list) if (keys.has(factKey(tag, unit, u))) n++;
  return n;
}

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

export type PredecessorResult = { cik: string; overlap: number; filings: NormalizedFiling[] };

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
      const overlap = overlapCount(facts, predFacts);
      if (overlap < MIN_OVERLAP) continue;
      const predSubmission = await fetchCompanySubmissions(candidate);
      const merged = mergePredecessorFacts(facts, predFacts, filings);
      facts.facts = merged.facts;
      return { cik: candidate, overlap, filings: normalizeRecentFilings(ticker, predSubmission) };
    } catch {
      // 候选是申报代理(无 companyfacts)或 SEC 临时失败:跳过
    }
  }
  return null;
}
