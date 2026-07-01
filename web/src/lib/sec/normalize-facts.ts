import { FUNDAMENTAL_TAGS, FundamentalField, INSTANT_FIELDS } from "./fundamental-tags";
import { CompanyFacts, SecFactUnit } from "./company-facts";
import { NormalizedFiling } from "./company-submissions";
import { KNOWN_FOREIGN_ISSUERS } from "./company-universe";

export type FundamentalPeriod = {
  ticker: string;
  cik: string;
  form: string;
  fiscal_year: number | null;
  fiscal_period: string | null;
  period_end: string;
  filing_date: string | null;
  accession_number: string | null;
  // flow
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  eps_diluted: number | null;
  shares_diluted: number | null;
  operating_cash_flow: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  d_and_a: number | null;
  stock_based_comp: number | null;
  rd_expense: number | null;
  sga_expense: number | null;
  interest_expense: number | null;
  pretax_income: number | null;
  income_tax_expense: number | null;
  dividends_paid: number | null;
  share_repurchases: number | null;
  // instant
  cash_and_equivalents: number | null;
  short_term_investments: number | null;
  current_assets: number | null;
  current_liabilities: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  total_debt: number | null;
  ppe_net: number | null;
  goodwill: number | null;
  intangibles: number | null;
  shareholders_equity: number | null;
  minority_interest: number | null;
  preferred_equity: number | null;
  shares_outstanding: number | null;
  // derived
  ebitda: number | null;
  working_capital: number | null;
  effective_tax_rate: number | null;
  revenue_yoy: number | null;
  net_income_yoy: number | null;
  fcf_yoy: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  fcf_margin: number | null;
  roe: number | null;
  debt_to_equity: number | null;
  net_debt: number | null;
  // provenance / quality
  is_derived: boolean;
  data_quality: string;
  missing_fields: Record<string, boolean>;
  raw_facts: Record<string, unknown>;
};

// Flow facts report over a duration: a single quarter (~90d), a half-year YTD
// (~180d), a three-quarter YTD (~270d), or a full year (~365d).
type FlowBucket = "Q" | "H1" | "TQ" | "FY";
type PickedFact = { val: number; end: string; filed: string; accn: string | null; tag: string; days: number | null; derived?: boolean };

const ALL_FIELDS = Object.keys(FUNDAMENTAL_TAGS) as FundamentalField[];
const FLOW_FIELDS = ALL_FIELDS.filter((field) => !INSTANT_FIELDS.has(field));
const INSTANT_FIELD_LIST = ALL_FIELDS.filter((field) => INSTANT_FIELDS.has(field));

// Some filers tag weighted-average share counts in millions/thousands (e.g. MCD
// reports diluted shares as 716.4, not 716,400,000) — SEC companyfacts returns
// that raw value, and the unit decl is just "shares" with no scale. Reconcile
// against net income / diluted EPS (both filer-scale-independent): if the tagged
// count is smaller by a clean power of 10 (≥100×), rescale it to absolute shares.
// Returns the value unchanged when there is no reliable EPS cross-check.
export function normalizeDilutedShares(
  shares: number | null,
  netIncome: number | null,
  epsDiluted: number | null
): number | null {
  if (shares == null || !(shares > 0)) return shares;
  if (netIncome == null || epsDiluted == null || epsDiluted === 0) return shares;
  const implied = Math.abs(netIncome / epsDiluted);
  if (!(implied > 0)) return shares;
  const ratio = implied / shares;
  if (ratio < 100) return shares; // already absolute (EPS-rounding noise stays ~1×)
  const scale = Math.pow(10, Math.round(Math.log10(ratio)));
  return shares * scale;
}

// Fields that, when absent, mark a period as not "high" quality. Enrichment
// fields (d_and_a, sga, etc.) intentionally do NOT gate quality — a period is
// still trustworthy without them; they just enable richer valuation.
const REQUIRED_HIGH: FundamentalField[] = [
  "revenue",
  "net_income",
  "operating_cash_flow",
  "capex",
  "cash_and_equivalents",
  "total_assets",
  "total_liabilities",
  "shareholders_equity"
];

function safeDiv(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function dayCount(start?: string, end?: string) {
  if (!start || !end) return null;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

// Classify a flow fact by its reporting duration. This is the fix for the
// "same end date, different duration" trap: a 10-Q reports a ~90-day single
// quarter AND a ~180/270-day year-to-date figure for the same `end`; only the
// duration distinguishes them. Capturing all four buckets lets us derive the
// single quarters that 10-Qs only report cumulatively (e.g. cash-flow lines).
function flowBucket(unit: SecFactUnit): FlowBucket | null {
  const d = dayCount(unit.start, unit.end);
  if (d === null) return null;
  if (d >= 80 && d <= 100) return "Q";
  if (d >= 172 && d <= 190) return "H1";
  if (d >= 260 && d <= 285) return "TQ";
  if (d >= 350 && d <= 380) return "FY";
  return null;
}

function getUnits(facts: CompanyFacts, tag: string): SecFactUnit[] {
  const concept = facts.facts?.["us-gaap"]?.[tag];
  if (!concept) return [];
  return concept.units.USD ?? concept.units.shares ?? concept.units["USD/shares"] ?? [];
}

// As-originally-reported: when the same period appears in multiple filings
// (original + later comparatives/restatements), keep the value from the
// earliest filing. Comparatives in later filings carry the later filing's
// fy/fp — which is exactly why we never key on fy/fp.
function earlier(a: PickedFact, b: PickedFact) {
  return a.filed <= b.filed ? a : b;
}

function toPicked(unit: SecFactUnit, tag: string): PickedFact {
  return {
    val: Number(unit.val),
    end: unit.end!,
    filed: unit.filed ?? "9999-99-99",
    accn: unit.accn ?? null,
    tag,
    days: dayCount(unit.start, unit.end)
  };
}

// Fiscal year named for the calendar year in which the fiscal year ENDS. A
// period whose end month is past the FYE month rolls into next year's fiscal
// year (e.g. Apple FYE=Sep: a Dec quarter belongs to the next FY).
function fyOfEnd(end: string, fyeMonth: number) {
  const [year, month] = end.split("-").map(Number);
  return month > fyeMonth ? year + 1 : year;
}

// Quarter index (1..4) of a period-end relative to the fiscal-year-end month.
function quarterOfEnd(end: string, fyeMonth: number) {
  const month = Number(end.split("-")[1]);
  const offset = (month - fyeMonth + 12) % 12; // months since fiscal-year start
  return offset === 0 ? 4 : Math.min(4, Math.max(1, Math.round(offset / 3)));
}

// Collect the as-reported value per (period_end, bucket) for one flow field.
function collectFlow(facts: CompanyFacts, field: FundamentalField) {
  const byKey = new Map<string, PickedFact>();
  for (const tag of FUNDAMENTAL_TAGS[field]) {
    for (const unit of getUnits(facts, tag)) {
      const bucket = flowBucket(unit);
      if (!bucket || !unit.end || unit.val === undefined || unit.val === null) continue;
      const key = `${unit.end}|${bucket}`;
      const picked = toPicked(unit, tag);
      const existing = byKey.get(key);
      // first concept in the fallback list wins per period; same concept ->
      // earliest-filed (as-reported) wins.
      if (!existing) byKey.set(key, picked);
      else if (existing.tag === picked.tag) byKey.set(key, earlier(existing, picked));
    }
  }
  return byKey;
}

// Turn one field's bucketed facts into single-quarter values (Q1..Q4) and an
// annual value per fiscal year. Single quarters are taken directly when the
// filer reports a 90-day fact; otherwise derived from the YTD chain
// (Qk = cumulative_k − cumulative_{k-1}). Q4 is always derived (never filed).
function deriveFlowSeries(byKey: Map<string, PickedFact>, fyeMonth: number) {
  const direct = new Map<string, PickedFact>(); // `${fy}|${q}` -> 90-day single
  const cum = new Map<string, PickedFact>(); // `${fy}|${k}` -> cumulative-through-k
  for (const [key, p] of byKey) {
    const [end, bucket] = key.split("|") as [string, FlowBucket];
    const fy = fyOfEnd(end, fyeMonth);
    const q = quarterOfEnd(end, fyeMonth);
    // A cumulative fact only counts if its end lands on the expected fiscal
    // quarter; otherwise it's a rolling/trailing-twelve-month period (a 365-day
    // fact ending mid-year is a TTM, NOT the fiscal year) and is ignored.
    if (bucket === "Q") {
      direct.set(`${fy}|${q}`, p);
      if (q === 1) cum.set(`${fy}|1`, p); // 3-month YTD == Q1
    } else if (bucket === "H1" && q === 2) cum.set(`${fy}|2`, p);
    else if (bucket === "TQ" && q === 3) cum.set(`${fy}|3`, p);
    else if (bucket === "FY" && q === 4) cum.set(`${fy}|4`, p);
  }

  const quarters = new Map<string, PickedFact>();
  const annual = new Map<number, PickedFact>();
  const fiscalYears = new Set<number>();
  for (const k of [...direct.keys(), ...cum.keys()]) fiscalYears.add(Number(k.split("|")[0]));

  for (const fy of fiscalYears) {
    for (let q = 1; q <= 4; q += 1) {
      const directQ = direct.get(`${fy}|${q}`);
      if (directQ) {
        quarters.set(`${fy}|${q}`, directQ);
        continue;
      }
      const ck = cum.get(`${fy}|${q}`);
      const cprev = q === 1 ? null : cum.get(`${fy}|${q - 1}`);
      if (ck && (q === 1 || cprev)) {
        quarters.set(`${fy}|${q}`, {
          val: ck.val - (cprev?.val ?? 0),
          end: ck.end,
          filed: ck.filed,
          accn: null,
          tag: `derived(cum${q}-cum${q - 1})`,
          days: 90,
          derived: true
        });
      }
    }
    const c4 = cum.get(`${fy}|4`);
    if (c4) annual.set(fy, c4);
  }
  return { quarters, annual };
}

// Collect the as-reported instant value per period_end for one field.
function collectInstant(facts: CompanyFacts, field: FundamentalField) {
  const byEnd = new Map<string, PickedFact>();
  for (const tag of FUNDAMENTAL_TAGS[field]) {
    for (const unit of getUnits(facts, tag)) {
      // instant facts have an `end` and no `start`
      if (!unit.end || unit.start || unit.val === undefined || unit.val === null) continue;
      const picked = toPicked(unit, tag);
      const existing = byEnd.get(unit.end);
      if (!existing) byEnd.set(unit.end, picked);
      else if (existing.tag === picked.tag) byEnd.set(unit.end, earlier(existing, picked));
    }
  }
  return byEnd;
}

// total_debt is the sum of several debt concepts at a given period_end.
function collectTotalDebt(facts: CompanyFacts) {
  const byEnd = new Map<string, Map<string, PickedFact>>();
  for (const tag of FUNDAMENTAL_TAGS.total_debt) {
    for (const unit of getUnits(facts, tag)) {
      if (!unit.end || unit.start || unit.val === undefined || unit.val === null) continue;
      const picked = toPicked(unit, tag);
      const tagMap = byEnd.get(unit.end) ?? new Map<string, PickedFact>();
      const existing = tagMap.get(tag);
      tagMap.set(tag, existing ? earlier(existing, picked) : picked);
      byEnd.set(unit.end, tagMap);
    }
  }
  const summed = new Map<string, PickedFact>();
  for (const [end, tagMap] of byEnd) {
    const total = Array.from(tagMap.values()).reduce((sum, p) => sum + p.val, 0);
    const earliestFiled = Array.from(tagMap.values()).reduce((min, p) => (p.filed < min ? p.filed : min), "9999-99-99");
    summed.set(end, { val: total, end, filed: earliestFiled, accn: null, tag: Array.from(tagMap.keys()).join("+"), days: null });
  }
  return summed;
}

function qualityStatus(ticker: string, values: Record<FundamentalField, number | null>, missing: Record<string, boolean>) {
  if (KNOWN_FOREIGN_ISSUERS.has(ticker)) return "foreign";
  if (values.revenue === null || values.net_income === null) return "low";
  if (REQUIRED_HIGH.every((field) => values[field] !== null)) return "high";
  if (values.cash_and_equivalents !== null && values.shareholders_equity !== null) return "medium";
  return Object.keys(missing).length ? "low" : "unknown";
}

type RowDraft = {
  period_end: string;
  isAnnual: boolean;
  fiscal_year: number;
  fiscal_period: string;
  is_derived: boolean;
  values: Record<FundamentalField, number | null>;
  picks: Record<string, PickedFact>;
};

function emptyValues(): Record<FundamentalField, number | null> {
  return Object.fromEntries(ALL_FIELDS.map((field) => [field, null])) as Record<FundamentalField, number | null>;
}

function finalizeRow(ticker: string, cik: string, draft: RowDraft, filings: NormalizedFiling[]): FundamentalPeriod {
  const v = draft.values;
  // Many filers (e.g. Amazon) never tag a `Liabilities` total, only its
  // components. Fall back to the accounting identity: liabilities = assets −
  // total equity (parent equity + any non-controlling interest).
  if (v.total_liabilities === null && v.total_assets !== null && v.shareholders_equity !== null) {
    v.total_liabilities = v.total_assets - v.shareholders_equity - (v.minority_interest ?? 0);
  }
  const capex = v.capex === null ? null : -Math.abs(v.capex);
  const freeCashFlow = v.operating_cash_flow === null || capex === null ? null : v.operating_cash_flow + capex;
  const ebitda = v.operating_income !== null && v.d_and_a !== null ? v.operating_income + v.d_and_a : null;
  const workingCapital =
    v.current_assets !== null && v.current_liabilities !== null ? v.current_assets - v.current_liabilities : null;
  const sharesDiluted = normalizeDilutedShares(v.shares_diluted, v.net_income, v.eps_diluted);

  const filedDates = Object.values(draft.picks)
    .map((p) => p.filed)
    .filter((f) => f !== "9999-99-99");
  const firstFiled = filedDates.length ? filedDates.reduce((min, f) => (f < min ? f : min)) : null;
  const matchedFiling = filings.find((f) => f.report_date === draft.period_end);

  const missing = Object.fromEntries(
    [...FLOW_FIELDS, ...INSTANT_FIELD_LIST]
      .filter((field) => field !== "total_debt" && v[field] === null)
      .map((field) => [field, true])
  );
  const dataQuality = qualityStatus(ticker, v, missing);

  return {
    ticker,
    cik,
    form: matchedFiling?.form ?? (draft.isAnnual ? "10-K" : "10-Q"),
    fiscal_year: draft.fiscal_year,
    fiscal_period: draft.fiscal_period,
    period_end: draft.period_end,
    filing_date: matchedFiling?.filing_date ?? firstFiled,
    accession_number: matchedFiling?.accession_number ?? Object.values(draft.picks).find((p) => p.accn)?.accn ?? null,
    revenue: v.revenue,
    gross_profit: v.gross_profit,
    operating_income: v.operating_income,
    net_income: v.net_income,
    eps_diluted: v.eps_diluted,
    shares_diluted: sharesDiluted,
    operating_cash_flow: v.operating_cash_flow,
    capex,
    free_cash_flow: freeCashFlow,
    d_and_a: v.d_and_a,
    stock_based_comp: v.stock_based_comp,
    rd_expense: v.rd_expense,
    sga_expense: v.sga_expense,
    interest_expense: v.interest_expense,
    pretax_income: v.pretax_income,
    income_tax_expense: v.income_tax_expense,
    dividends_paid: v.dividends_paid,
    share_repurchases: v.share_repurchases,
    cash_and_equivalents: v.cash_and_equivalents,
    short_term_investments: v.short_term_investments,
    current_assets: v.current_assets,
    current_liabilities: v.current_liabilities,
    total_assets: v.total_assets,
    total_liabilities: v.total_liabilities,
    total_debt: v.total_debt,
    ppe_net: v.ppe_net,
    goodwill: v.goodwill,
    intangibles: v.intangibles,
    shareholders_equity: v.shareholders_equity,
    minority_interest: v.minority_interest,
    preferred_equity: v.preferred_equity,
    shares_outstanding: v.shares_outstanding,
    ebitda,
    working_capital: workingCapital,
    effective_tax_rate: safeDiv(v.income_tax_expense, v.pretax_income),
    revenue_yoy: null,
    net_income_yoy: null,
    fcf_yoy: null,
    gross_margin: safeDiv(v.gross_profit, v.revenue),
    operating_margin: safeDiv(v.operating_income, v.revenue),
    net_margin: safeDiv(v.net_income, v.revenue),
    fcf_margin: safeDiv(freeCashFlow, v.revenue),
    roe: safeDiv(v.net_income, v.shareholders_equity),
    debt_to_equity: safeDiv(v.total_debt, v.shareholders_equity),
    net_debt: v.total_debt !== null && v.cash_and_equivalents !== null ? v.total_debt - v.cash_and_equivalents : null,
    is_derived: draft.is_derived,
    data_quality: dataQuality,
    missing_fields: missing,
    raw_facts: Object.fromEntries(
      Object.entries(draft.picks).map(([k, p]) => [k, { tag: p.tag, val: p.val, filed: p.filed, days: p.days, derived: p.derived ?? false }])
    )
  };
}

function withYearOverYear(rows: FundamentalPeriod[]) {
  // rows ascending by period_end; compare to the most recent prior row sharing
  // the same fiscal_period (prior FY for annual, same quarter a year ago).
  return rows.map((row, index) => {
    const prior = rows
      .slice(0, index)
      .reverse()
      .find((c) => c.fiscal_period === row.fiscal_period);
    if (!prior) return row;
    return {
      ...row,
      revenue_yoy: safeDiv(row.revenue !== null && prior.revenue !== null ? row.revenue - prior.revenue : null, prior.revenue),
      net_income_yoy: safeDiv(
        row.net_income !== null && prior.net_income !== null ? row.net_income - prior.net_income : null,
        prior.net_income
      ),
      fcf_yoy: safeDiv(
        row.free_cash_flow !== null && prior.free_cash_flow !== null ? row.free_cash_flow - prior.free_cash_flow : null,
        prior.free_cash_flow
      )
    };
  });
}

export function normalizeCompanyFacts(
  tickerInput: string,
  cik: string,
  facts: CompanyFacts,
  filings: NormalizedFiling[],
  fiscalYearEnd?: string
) {
  const ticker = tickerInput.toUpperCase();
  const fyeMonth = fiscalYearEnd && fiscalYearEnd.length >= 2 ? Number(fiscalYearEnd.slice(0, 2)) || 12 : 12;

  // 1. Per flow field: bucket facts, then resolve single-quarter + annual series.
  const flowSeries = new Map<FundamentalField, ReturnType<typeof deriveFlowSeries>>();
  for (const field of FLOW_FIELDS) flowSeries.set(field, deriveFlowSeries(collectFlow(facts, field), fyeMonth));

  // 2. Instant fields keyed by period_end.
  const instant = new Map<FundamentalField, Map<string, PickedFact>>();
  for (const field of INSTANT_FIELD_LIST) {
    instant.set(field, field === "total_debt" ? collectTotalDebt(facts) : collectInstant(facts, field));
  }

  // 3. Calendar of real periods (union across fields), with their end dates.
  const quarterEnd = new Map<string, string>(); // `${fy}|${q}` -> end
  const annualEnd = new Map<number, string>(); // fy -> end
  for (const { quarters, annual } of flowSeries.values()) {
    for (const [k, p] of quarters) if (!quarterEnd.has(k)) quarterEnd.set(k, p.end);
    for (const [fy, p] of annual) if (!annualEnd.has(fy)) annualEnd.set(fy, p.end);
  }

  // 4. Build quarterly + annual drafts; attach balance-sheet values by end date.
  const drafts: RowDraft[] = [];
  const attachInstant = (draft: RowDraft) => {
    for (const field of INSTANT_FIELD_LIST) {
      const picked = instant.get(field)?.get(draft.period_end);
      if (picked) {
        draft.values[field] = picked.val;
        draft.picks[field] = picked;
      }
    }
  };

  for (const [key, end] of quarterEnd) {
    const [fy, q] = key.split("|").map(Number);
    const draft: RowDraft = {
      period_end: end,
      isAnnual: false,
      fiscal_year: fy,
      fiscal_period: `Q${q}`,
      is_derived: q === 4, // Q4 has no standalone filing; income-stmt Q2/Q3 are direct
      values: emptyValues(),
      picks: {}
    };
    for (const field of FLOW_FIELDS) {
      const p = flowSeries.get(field)?.quarters.get(key);
      if (p) {
        draft.values[field] = p.val;
        draft.picks[field] = p;
      }
    }
    attachInstant(draft);
    drafts.push(draft);
  }

  for (const [fy, end] of annualEnd) {
    const draft: RowDraft = {
      period_end: end,
      isAnnual: true,
      fiscal_year: fy,
      fiscal_period: "FY",
      is_derived: false,
      values: emptyValues(),
      picks: {}
    };
    for (const field of FLOW_FIELDS) {
      const p = flowSeries.get(field)?.annual.get(fy);
      if (p) {
        draft.values[field] = p.val;
        draft.picks[field] = p;
      }
    }
    attachInstant(draft);
    drafts.push(draft);
  }

  // 5. Finalize, split, sort, limit, then compute YoY within each series.
  const finalized = drafts.map((d) => finalizeRow(ticker, cik, d, filings));
  // 数据准确性护栏: 丢弃 period_end 落在未来 90 天之后的行。XBRL 偶有公司自报错标年份
  // (如 LEGH 把 2024-Q1 标成 2033-03-31), 这种行会污染"最新期"物化(latest 按 period_end
  // 倒序选最新 → 2033>2026 被当最新, 盖住真最新季)。90 天容差留给正常的提前申报。
  const futureCutoff = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const finalizedSane = finalized.filter((r) => {
    if (r.period_end > futureCutoff) {
      console.warn(`[normalize-facts] 丢弃未来日期行 ${ticker} ${r.fiscal_period} FY${r.fiscal_year} period_end=${r.period_end}`);
      return false;
    }
    // 派生季度(Q4 = FY − 前三季)若得出负营收, 必是 FY/YTD 口径不齐的派生假数据(如 UHAL.B
    // 单季营收 −38.6 亿)。合法的负营收——保险股投资亏损季——走 is_derived=false 直报路径,
    // 不受此闸影响。丢弃整行而非仅清营收: 同源派生的净利/FCF 同样不可信。
    if (r.is_derived && r.revenue !== null && r.revenue < 0) {
      console.warn(`[normalize-facts] 丢弃派生负营收行 ${ticker} ${r.fiscal_period} FY${r.fiscal_year} revenue=${r.revenue}`);
      return false;
    }
    return true;
  });
  const annual = finalizedSane
    .filter((r) => r.fiscal_period === "FY")
    .sort((a, b) => b.period_end.localeCompare(a.period_end))
    .slice(0, 6);
  const quarterly = finalizedSane
    .filter((r) => r.fiscal_period !== "FY")
    .sort((a, b) => b.period_end.localeCompare(a.period_end))
    .slice(0, 12);

  return {
    annual: withYearOverYear([...annual].reverse()).reverse(),
    quarterly: withYearOverYear([...quarterly].reverse()).reverse()
  };
}
