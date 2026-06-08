import { SEC_FACT_TAGS, SEC_NORMALIZED_FIELDS } from "./factTags";
import { SEC_COMPANYFACTS_SOURCE } from "./types";
import type {
  SecCompanyFactsJson,
  SecCompanyFactUnit,
  SecFactValue,
  SecNormalizedAnnualFinancials,
  SecNormalizedField,
} from "./types";

const ANNUAL_FORMS = new Set(["10-K", "10-K/A"]);
const UNIT_PRIORITY = ["USD", "shares", "USD/shares", "pure"];

function isAnnualFact(unit: SecCompanyFactUnit): unit is Required<Pick<SecCompanyFactUnit, "val" | "fy" | "fp" | "form" | "filed" | "end">> &
  SecCompanyFactUnit {
  return (
    typeof unit.val === "number" &&
    typeof unit.fy === "number" &&
    unit.fp === "FY" &&
    typeof unit.form === "string" &&
    ANNUAL_FORMS.has(unit.form) &&
    typeof unit.filed === "string" &&
    typeof unit.end === "string"
  );
}

function bestUnits(units: Record<string, SecCompanyFactUnit[]> | undefined): [string, SecCompanyFactUnit[]][] {
  if (!units) return [];
  return Object.entries(units).sort(([a], [b]) => {
    const ai = UNIT_PRIORITY.indexOf(a);
    const bi = UNIT_PRIORITY.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function dedupeByFiscalYear(values: SecFactValue[]): SecFactValue[] {
  const byYear = new Map<number, SecFactValue>();
  for (const value of values) {
    const existing = byYear.get(value.fiscal_year);
    if (
      !existing ||
      value.end_date > existing.end_date ||
      (value.end_date === existing.end_date && value.filed_date > existing.filed_date)
    ) {
      byYear.set(value.fiscal_year, value);
    }
  }
  return [...byYear.values()].sort((a, b) => a.fiscal_year - b.fiscal_year);
}

function fieldValues(
  field: SecNormalizedField,
  ticker: string,
  cik: string,
  facts: SecCompanyFactsJson,
): SecFactValue[] {
  const usGaap = facts.facts?.["us-gaap"];
  if (!usGaap) return [];
  const tagResults: SecFactValue[][] = [];
  for (const tag of SEC_FACT_TAGS[field]) {
    const concept = usGaap[tag];
    for (const [unit, rows] of bestUnits(concept?.units)) {
      const result: SecFactValue[] = [];
      for (const row of rows) {
        if (!isAnnualFact(row)) continue;
        result.push({
          ticker,
          cik,
          fiscal_year: row.fy,
          fiscal_period: row.fp,
          form: row.form,
          filed_date: row.filed,
          end_date: row.end,
          value: field === "capital_expenditure" ? Math.abs(row.val) : row.val,
          unit,
          source_tag: tag,
          source: SEC_COMPANYFACTS_SOURCE,
        });
      }
      if (result.length > 0) {
        tagResults.push(dedupeByFiscalYear(result));
        break;
      }
    }
  }
  return (
    tagResults.sort((a, b) => {
      const latestA = a.at(-1)?.fiscal_year ?? 0;
      const latestB = b.at(-1)?.fiscal_year ?? 0;
      if (latestA !== latestB) return latestB - latestA;
      return b.length - a.length;
    })[0] ?? []
  );
}

function derivedFact(base: SecFactValue, value: number, sourceTag: string): SecFactValue {
  return {
    ...base,
    value,
    source_tag: sourceTag,
  };
}

function addDerivedAnnualFacts(normalized: SecNormalizedAnnualFinancials) {
  const operatingCashFlow = normalized.facts.operating_cash_flow ?? [];
  const capex = normalized.facts.capital_expenditure ?? [];
  const shortDebt = normalized.facts.short_term_debt ?? [];
  const longDebt = normalized.facts.long_term_debt ?? [];
  const cash = normalized.facts.cash ?? [];

  const capexByYear = new Map(capex.map((fact) => [fact.fiscal_year, fact]));
  normalized.facts.free_cash_flow = operatingCashFlow
    .filter((fact) => capexByYear.has(fact.fiscal_year))
    .map((fact) => derivedFact(fact, fact.value - (capexByYear.get(fact.fiscal_year)?.value ?? 0), "derived:operating_cash_flow-capital_expenditure"));

  const longDebtByYear = new Map(longDebt.map((fact) => [fact.fiscal_year, fact]));
  normalized.facts.total_debt = shortDebt
    .filter((fact) => longDebtByYear.has(fact.fiscal_year))
    .map((fact) => derivedFact(fact, fact.value + (longDebtByYear.get(fact.fiscal_year)?.value ?? 0), "derived:short_term_debt+long_term_debt"));

  const cashByYear = new Map(cash.map((fact) => [fact.fiscal_year, fact]));
  normalized.facts.net_debt = (normalized.facts.total_debt ?? [])
    .filter((fact) => cashByYear.has(fact.fiscal_year))
    .map((fact) => derivedFact(fact, fact.value - (cashByYear.get(fact.fiscal_year)?.value ?? 0), "derived:total_debt-cash"));
}

export function normalizeAnnualCompanyFacts(
  ticker: string,
  cik: string,
  facts: SecCompanyFactsJson,
): SecNormalizedAnnualFinancials {
  const normalized: SecNormalizedAnnualFinancials = {
    ticker: ticker.toUpperCase(),
    cik,
    company_name: facts.entityName,
    fiscal_years: [],
    facts: {},
    missing_fields: [],
  };

  for (const field of SEC_NORMALIZED_FIELDS) {
    if (field === "free_cash_flow" || field === "total_debt" || field === "net_debt") continue;
    normalized.facts[field] = fieldValues(field, normalized.ticker, cik, facts);
  }

  addDerivedAnnualFacts(normalized);

  const years = new Set<number>();
  for (const values of Object.values(normalized.facts)) {
    for (const fact of values ?? []) years.add(fact.fiscal_year);
  }
  normalized.fiscal_years = [...years].sort((a, b) => a - b);
  normalized.latest_fiscal_year = normalized.fiscal_years.at(-1);
  normalized.missing_fields = SEC_NORMALIZED_FIELDS.filter((field) => (normalized.facts[field]?.length ?? 0) === 0);

  return normalized;
}

export function latestFact(normalized: SecNormalizedAnnualFinancials, field: SecNormalizedField): SecFactValue | undefined {
  const latestYear = normalized.latest_fiscal_year;
  if (!latestYear) return undefined;
  return normalized.facts[field]?.find((fact) => fact.fiscal_year === latestYear) ?? normalized.facts[field]?.at(-1);
}

export function factForYear(
  normalized: SecNormalizedAnnualFinancials,
  field: SecNormalizedField,
  fiscalYear: number,
): SecFactValue | undefined {
  return normalized.facts[field]?.find((fact) => fact.fiscal_year === fiscalYear);
}
