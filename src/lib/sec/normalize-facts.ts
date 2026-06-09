import { FUNDAMENTAL_TAGS, FundamentalField } from "./fundamental-tags";
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
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  eps_diluted: number | null;
  shares_diluted: number | null;
  operating_cash_flow: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  cash_and_equivalents: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  total_debt: number | null;
  shareholders_equity: number | null;
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
  data_quality: string;
  missing_fields: Record<string, boolean>;
  raw_facts: Record<string, unknown>;
};

const VALUE_FIELDS: FundamentalField[] = [
  "revenue",
  "gross_profit",
  "operating_income",
  "net_income",
  "eps_diluted",
  "shares_diluted",
  "operating_cash_flow",
  "capex",
  "cash_and_equivalents",
  "total_assets",
  "total_liabilities",
  "total_debt",
  "shareholders_equity"
];

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

function getUnits(facts: CompanyFacts, tag: string): SecFactUnit[] {
  const concept = facts.facts?.["us-gaap"]?.[tag];
  if (!concept) return [];
  return concept.units.USD ?? concept.units.shares ?? concept.units["USD/shares"] ?? [];
}

function periodKey(unit: SecFactUnit) {
  if (!unit.fy || !unit.fp || !unit.end) return null;
  return `${unit.fy}|${unit.fp}|${unit.end}|${unit.form ?? ""}`;
}

function scoreUnit(unit: SecFactUnit) {
  const formScore = unit.form === "10-K" || unit.form === "20-F" ? 4 : unit.form === "10-Q" || unit.form === "6-K" ? 3 : 1;
  const filed = unit.filed ?? "";
  return `${formScore}-${filed}`;
}

function isAnnual(unit: SecFactUnit) {
  return unit.fp === "FY" && (unit.form === "10-K" || unit.form === "20-F");
}

function isQuarter(unit: SecFactUnit) {
  return ["Q1", "Q2", "Q3", "Q4"].includes(unit.fp ?? "") && (unit.form === "10-Q" || unit.form === "6-K");
}

function chooseUnit(units: SecFactUnit[]) {
  return units.sort((a, b) => scoreUnit(b).localeCompare(scoreUnit(a)))[0] ?? null;
}

function collectDebtUnits(facts: CompanyFacts, predicate: (unit: SecFactUnit) => boolean) {
  const byKey = new Map<string, SecFactUnit[]>();
  for (const tag of FUNDAMENTAL_TAGS.total_debt) {
    for (const unit of getUnits(facts, tag).filter(predicate)) {
      const key = periodKey(unit);
      if (!key) continue;
      const existing = byKey.get(key) ?? [];
      existing.push({ ...unit, accn: `${unit.accn ?? ""}:${tag}` });
      byKey.set(key, existing);
    }
  }
  return byKey;
}

function buildRows(ticker: string, cik: string, facts: CompanyFacts, filings: NormalizedFiling[], predicate: (unit: SecFactUnit) => boolean, limit: number) {
  const periodMap = new Map<string, Partial<Record<FundamentalField, SecFactUnit>>>();
  const rawMap = new Map<string, Record<string, unknown>>();

  for (const field of VALUE_FIELDS.filter((field) => field !== "total_debt")) {
    for (const tag of FUNDAMENTAL_TAGS[field]) {
      for (const unit of getUnits(facts, tag).filter(predicate)) {
        const key = periodKey(unit);
        if (!key) continue;
        const current = periodMap.get(key)?.[field];
        const selected = chooseUnit([unit, ...(current ? [current] : [])]);
        periodMap.set(key, { ...(periodMap.get(key) ?? {}), [field]: selected });
        rawMap.set(key, { ...(rawMap.get(key) ?? {}), [field]: { tag, unit: selected } });
      }
    }
  }

  for (const [key, debtUnits] of collectDebtUnits(facts, predicate)) {
    const byTag = new Map<string, SecFactUnit>();
    for (const unit of debtUnits) {
      const tag = String(unit.accn ?? "").split(":").at(-1) ?? "debt";
      const current = byTag.get(tag);
      byTag.set(tag, chooseUnit([unit, ...(current ? [current] : [])])!);
    }
    const totalDebt = Array.from(byTag.values()).reduce((sum, unit) => sum + Number(unit.val ?? 0), 0);
    const representative = chooseUnit(Array.from(byTag.values()));
    if (representative) {
      periodMap.set(key, { ...(periodMap.get(key) ?? {}), total_debt: { ...representative, val: totalDebt } });
      rawMap.set(key, { ...(rawMap.get(key) ?? {}), total_debt: { tags: Array.from(byTag.keys()), totalDebt } });
    }
  }

  const rows = Array.from(periodMap.entries())
    .map(([key, units]) => {
      const [fy, fp, end, formFromKey] = key.split("|");
      const filing = filings.find((item) => item.accession_number === Object.values(units).find(Boolean)?.accn);
      const values = Object.fromEntries(VALUE_FIELDS.map((field) => [field, units[field]?.val ?? null])) as Record<FundamentalField, number | null>;
      const capex = values.capex === null ? null : -Math.abs(values.capex);
      const freeCashFlow = values.operating_cash_flow === null || capex === null ? null : values.operating_cash_flow + capex;
      const missing = Object.fromEntries(VALUE_FIELDS.filter((field) => field !== "total_debt" && values[field] === null).map((field) => [field, true]));
      const dataQuality = qualityStatus(ticker, values, missing);

      return {
        ticker,
        cik,
        form: filing?.form ?? formFromKey,
        fiscal_year: Number(fy),
        fiscal_period: fp,
        period_end: end,
        filing_date: filing?.filing_date ?? Object.values(units).find(Boolean)?.filed ?? null,
        accession_number: filing?.accession_number ?? Object.values(units).find(Boolean)?.accn ?? null,
        revenue: values.revenue,
        gross_profit: values.gross_profit,
        operating_income: values.operating_income,
        net_income: values.net_income,
        eps_diluted: values.eps_diluted,
        shares_diluted: values.shares_diluted,
        operating_cash_flow: values.operating_cash_flow,
        capex,
        free_cash_flow: freeCashFlow,
        cash_and_equivalents: values.cash_and_equivalents,
        total_assets: values.total_assets,
        total_liabilities: values.total_liabilities,
        total_debt: values.total_debt,
        shareholders_equity: values.shareholders_equity,
        revenue_yoy: null,
        net_income_yoy: null,
        fcf_yoy: null,
        gross_margin: safeDiv(values.gross_profit, values.revenue),
        operating_margin: safeDiv(values.operating_income, values.revenue),
        net_margin: safeDiv(values.net_income, values.revenue),
        fcf_margin: safeDiv(freeCashFlow, values.revenue),
        roe: safeDiv(values.net_income, values.shareholders_equity),
        debt_to_equity: safeDiv(values.total_debt, values.shareholders_equity),
        net_debt: values.total_debt !== null && values.cash_and_equivalents !== null ? values.total_debt - values.cash_and_equivalents : null,
        data_quality: dataQuality,
        missing_fields: missing,
        raw_facts: rawMap.get(key) ?? {}
      } satisfies FundamentalPeriod;
    })
    .sort((a, b) => b.period_end.localeCompare(a.period_end))
    .slice(0, limit);

  return withYearOverYear(rows.reverse()).reverse();
}

function qualityStatus(ticker: string, values: Record<FundamentalField, number | null>, missing: Record<string, boolean>) {
  if (KNOWN_FOREIGN_ISSUERS.has(ticker)) return "foreign";
  if (values.revenue === null || values.net_income === null) return "low";
  const hasHighFields = REQUIRED_HIGH.every((field) => values[field] !== null);
  if (hasHighFields) return "high";
  if (values.cash_and_equivalents !== null && values.shareholders_equity !== null) return "medium";
  return Object.keys(missing).length ? "low" : "unknown";
}

function withYearOverYear(rows: FundamentalPeriod[]) {
  return rows.map((row, index) => {
    const prior = rows
      .slice(0, index)
      .reverse()
      .find((candidate) => candidate.fiscal_period === row.fiscal_period);
    return {
      ...row,
      revenue_yoy: prior ? safeDiv(row.revenue !== null && prior.revenue !== null ? row.revenue - prior.revenue : null, prior.revenue) : null,
      net_income_yoy: prior ? safeDiv(row.net_income !== null && prior.net_income !== null ? row.net_income - prior.net_income : null, prior.net_income) : null,
      fcf_yoy: prior ? safeDiv(row.free_cash_flow !== null && prior.free_cash_flow !== null ? row.free_cash_flow - prior.free_cash_flow : null, prior.free_cash_flow) : null
    };
  });
}

export function normalizeCompanyFacts(tickerInput: string, cik: string, facts: CompanyFacts, filings: NormalizedFiling[]) {
  const ticker = tickerInput.toUpperCase();
  return {
    annual: buildRows(ticker, cik, facts, filings, isAnnual, 5),
    quarterly: buildRows(ticker, cik, facts, filings, isQuarter, 8)
  };
}
