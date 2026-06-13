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

type FlowClass = "Q" | "FY";
type PickedFact = { val: number; filed: string; accn: string | null; tag: string; days: number | null };

const ALL_FIELDS = Object.keys(FUNDAMENTAL_TAGS) as FundamentalField[];
const FLOW_FIELDS = ALL_FIELDS.filter((field) => !INSTANT_FIELDS.has(field));
const INSTANT_FIELD_LIST = ALL_FIELDS.filter((field) => INSTANT_FIELDS.has(field));

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
// "same end date, different duration" trap: a 10-Q reports both a ~90-day
// single quarter and a ~180/270-day year-to-date figure for the same `end`;
// only the duration distinguishes them.
function flowClass(unit: SecFactUnit): FlowClass | null {
  const d = dayCount(unit.start, unit.end);
  if (d === null) return null;
  if (d >= 80 && d <= 100) return "Q";
  if (d >= 350 && d <= 380) return "FY";
  return null; // 6-/9-month YTD, or otherwise non-standard — ignored
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
    filed: unit.filed ?? "9999-99-99",
    accn: unit.accn ?? null,
    tag,
    days: dayCount(unit.start, unit.end)
  };
}

// Derive (fiscal_year, fiscal_period) from the period-end date and the
// company's fiscal-year-end month — NOT from the XBRL fy/fp fields, which
// reflect the filing context rather than the period the value describes.
function fiscalLabels(end: string, fyeMonth: number, durClass: FlowClass) {
  const [year, month] = end.split("-").map(Number);
  // The fiscal year is named for the calendar year in which the fiscal year
  // ENDS. A period whose end month is past the FYE month rolls into next year's
  // fiscal year (e.g. Apple FYE=Sep: a Dec quarter belongs to the next FY).
  const fiscalYear = month > fyeMonth ? year + 1 : year;
  if (durClass === "FY") return { fiscal_year: fiscalYear, fiscal_period: "FY" };
  const offset = (month - fyeMonth + 12) % 12; // months since fiscal-year start
  const q = offset === 0 ? 4 : Math.min(4, Math.max(1, Math.round(offset / 3)));
  return { fiscal_year: fiscalYear, fiscal_period: `Q${q}` };
}

// Collect the as-reported flow value per (period_end, FlowClass) for one field.
function collectFlow(facts: CompanyFacts, field: FundamentalField) {
  const byKey = new Map<string, PickedFact>();
  for (const tag of FUNDAMENTAL_TAGS[field]) {
    for (const unit of getUnits(facts, tag)) {
      const cls = flowClass(unit);
      if (!cls || !unit.end || unit.val === undefined || unit.val === null) continue;
      const key = `${unit.end}|${cls}`;
      const picked = toPicked(unit, tag);
      const existing = byKey.get(key);
      // The first concept in the fallback list wins for a period; for the same
      // concept, the earliest-filed (as-reported) value wins.
      if (!existing) byKey.set(key, picked);
      else if (existing.tag === picked.tag) byKey.set(key, earlier(existing, picked));
    }
  }
  return byKey; // key: `${end}|${cls}`
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
    summed.set(end, { val: total, filed: earliestFiled, accn: null, tag: Array.from(tagMap.keys()).join("+"), days: null });
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
  durClass: FlowClass;
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
  const capex = v.capex === null ? null : -Math.abs(v.capex);
  const freeCashFlow = v.operating_cash_flow === null || capex === null ? null : v.operating_cash_flow + capex;
  const ebitda = v.operating_income !== null && v.d_and_a !== null ? v.operating_income + v.d_and_a : null;
  const workingCapital =
    v.current_assets !== null && v.current_liabilities !== null ? v.current_assets - v.current_liabilities : null;

  // earliest filing among this period's picks ≈ when the period was first reported
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
    form: matchedFiling?.form ?? (draft.durClass === "FY" ? "10-K" : "10-Q"),
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
    shares_diluted: v.shares_diluted,
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
      Object.entries(draft.picks).map(([k, p]) => [k, { tag: p.tag, val: p.val, filed: p.filed, days: p.days }])
    )
  };
}

function withYearOverYear(rows: FundamentalPeriod[]) {
  // rows must be ascending by period_end; compare to the most recent prior row
  // sharing the same fiscal_period (prior FY for annual, same quarter a year ago).
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

  // 1. Collect flow values keyed by `${end}|${class}` and instant values by end.
  const flow = new Map<FundamentalField, Map<string, PickedFact>>();
  for (const field of FLOW_FIELDS) flow.set(field, collectFlow(facts, field));
  const instant = new Map<FundamentalField, Map<string, PickedFact>>();
  for (const field of INSTANT_FIELD_LIST) {
    instant.set(field, field === "total_debt" ? collectTotalDebt(facts) : collectInstant(facts, field));
  }

  // 2. Every (period_end, class) that has at least one flow fact becomes a row.
  const drafts = new Map<string, RowDraft>();
  for (const [field, byKey] of flow) {
    for (const [key, picked] of byKey) {
      const [end, cls] = key.split("|") as [string, FlowClass];
      const { fiscal_year, fiscal_period } = fiscalLabels(end, fyeMonth, cls);
      const draft =
        drafts.get(key) ??
        ({
          period_end: end,
          durClass: cls,
          fiscal_year,
          fiscal_period,
          is_derived: false,
          values: emptyValues(),
          picks: {}
        } satisfies RowDraft);
      draft.values[field] = picked.val;
      draft.picks[field] = picked;
      drafts.set(key, draft);
    }
  }

  // 3. Attach instant (balance-sheet) values to every row sharing that end date.
  for (const draft of drafts.values()) {
    for (const field of INSTANT_FIELD_LIST) {
      const picked = instant.get(field)?.get(draft.period_end);
      if (picked) {
        draft.values[field] = picked.val;
        draft.picks[field] = picked;
      }
    }
  }

  // 4. Derive each fiscal year's Q4 = FY − (Q1+Q2+Q3). Q4 is never filed in a 10-Q.
  const byFiscalYear = new Map<number, { fy?: RowDraft; quarters: Map<string, RowDraft> }>();
  for (const draft of drafts.values()) {
    const bucket = byFiscalYear.get(draft.fiscal_year) ?? { quarters: new Map<string, RowDraft>() };
    if (draft.durClass === "FY") bucket.fy = draft;
    else bucket.quarters.set(draft.fiscal_period, draft);
    byFiscalYear.set(draft.fiscal_year, bucket);
  }
  for (const [, bucket] of byFiscalYear) {
    const { fy } = bucket;
    const q1 = bucket.quarters.get("Q1");
    const q2 = bucket.quarters.get("Q2");
    const q3 = bucket.quarters.get("Q3");
    if (!fy || !q1 || !q2 || !q3 || bucket.quarters.has("Q4")) continue;
    const values = emptyValues();
    for (const field of FLOW_FIELDS) {
      const a = fy.values[field];
      const b = q1.values[field];
      const c = q2.values[field];
      const d = q3.values[field];
      values[field] = a !== null && b !== null && c !== null && d !== null ? a - b - c - d : null;
    }
    // balance sheet at fiscal-year end == Q4 end
    for (const field of INSTANT_FIELD_LIST) values[field] = fy.values[field];
    drafts.set(`${fy.period_end}|Q4`, {
      period_end: fy.period_end,
      durClass: "Q",
      fiscal_year: fy.fiscal_year,
      fiscal_period: "Q4",
      is_derived: true,
      values,
      picks: {}
    });
  }

  // 5. Finalize, split, sort, limit, then compute YoY within each series.
  const finalized = Array.from(drafts.values()).map((d) => finalizeRow(ticker, cik, d, filings));
  const annual = finalized
    .filter((r) => r.fiscal_period === "FY")
    .sort((a, b) => b.period_end.localeCompare(a.period_end))
    .slice(0, 6);
  const quarterly = finalized
    .filter((r) => r.fiscal_period !== "FY")
    .sort((a, b) => b.period_end.localeCompare(a.period_end))
    .slice(0, 12);

  return {
    annual: withYearOverYear([...annual].reverse()).reverse(),
    quarterly: withYearOverYear([...quarterly].reverse()).reverse()
  };
}
