import { getSecCompanyData } from "@/lib/sec/read";
import type { NormalizedResearchData } from "../schemas/researchSchemas";
import { annualResearchHistory, latestFinancialMetrics, latestGrowthMetrics, latestNormalizedFinancials } from "./derivedMetrics";
import { latestFact } from "./normalizeCompanyFacts";
import { SEC_NORMALIZED_FIELDS } from "./factTags";
import type { SecFactValue, SecNormalizedAnnualFinancials, SecNormalizedField, SecResearchDataResult } from "./types";

// Maps the research engine's normalized fields to columns on our stored
// `company_fundamentals_periods` table. Fields with no stored column (eps_basic,
// shares_basic, short/long-term debt split) are simply absent — the downstream
// derivation already treats them as optional.
const FIELD_TO_COLUMN: Partial<Record<SecNormalizedField, string>> = {
  revenue: "revenue",
  gross_profit: "gross_profit",
  operating_income: "operating_income",
  net_income: "net_income",
  eps_diluted: "eps_diluted",
  r_and_d: "rd_expense",
  sga: "sga_expense",
  operating_cash_flow: "operating_cash_flow",
  capital_expenditure: "capex",
  free_cash_flow: "free_cash_flow",
  buybacks: "share_repurchases",
  dividends: "dividends_paid",
  cash: "cash_and_equivalents",
  total_assets: "total_assets",
  total_liabilities: "total_liabilities",
  shareholders_equity: "shareholders_equity",
  total_debt: "total_debt",
  net_debt: "net_debt",
  shares_diluted: "shares_diluted",
  shares_outstanding: "shares_outstanding"
};

/**
 * Build the research engine's normalized intermediate from our hardened stored
 * fundamentals (company_fundamentals_periods) instead of live-fetching and
 * re-normalizing SEC companyfacts. Reuses the exact same derivedMetrics so the
 * downstream valuation/risk/workflow output shape is identical.
 *
 * Returns null when the store has no annual data for this ticker, so the caller
 * can fall back to the live SEC path (e.g. tickers outside our universe).
 */
export async function buildResearchDataFromStore(ticker: string): Promise<SecResearchDataResult | null> {
  const { company, annual } = await getSecCompanyData(ticker);
  if (!annual.length) return null;

  const upper = ticker.toUpperCase();
  const cik = (company as { cik?: string } | null)?.cik ?? "";
  const companyName = (company as { company_name?: string } | null)?.company_name ?? undefined;

  const facts: Partial<Record<SecNormalizedField, SecFactValue[]>> = {};
  const years = new Set<number>();
  for (const row of annual as Array<Record<string, unknown>>) {
    const fiscalYear = Number(row.fiscal_year);
    if (!Number.isFinite(fiscalYear)) continue;
    years.add(fiscalYear);
    for (const [field, column] of Object.entries(FIELD_TO_COLUMN) as [SecNormalizedField, string][]) {
      const raw = row[column];
      if (raw === null || raw === undefined) continue;
      (facts[field] ??= []).push({
        ticker: upper,
        cik,
        fiscal_year: fiscalYear,
        fiscal_period: "FY",
        form: (row.form as string) ?? "10-K",
        filed_date: (row.filing_date as string) ?? "",
        end_date: (row.period_end as string) ?? "",
        value: Number(raw),
        unit: field === "eps_diluted" ? "USD/shares" : field.startsWith("shares") ? "shares" : "USD",
        source_tag: `store:${column}`,
        source: "SEC_COMPANYFACTS"
      });
    }
  }
  // derivedMetrics expects each field's facts ascending by fiscal year.
  for (const field of Object.keys(facts) as SecNormalizedField[]) {
    facts[field]!.sort((a, b) => a.fiscal_year - b.fiscal_year);
  }

  const fiscalYears = [...years].sort((a, b) => a - b);
  const normalized: SecNormalizedAnnualFinancials = {
    ticker: upper,
    cik,
    company_name: companyName,
    fiscal_years: fiscalYears,
    facts,
    latest_fiscal_year: fiscalYears.at(-1),
    missing_fields: SEC_NORMALIZED_FIELDS.filter((field) => (facts[field]?.length ?? 0) === 0)
  };

  const latestYear = normalized.latest_fiscal_year;
  const latestRevenue = latestFact(normalized, "revenue");
  const normalizedData: NormalizedResearchData = {
    ticker: upper,
    company_name: companyName,
    period: latestYear ? `FY${latestYear}` : undefined,
    normalized_financials: latestNormalizedFinancials(normalized),
    financial_metrics: latestFinancialMetrics(normalized),
    growth_metrics: latestGrowthMetrics(normalized),
    annual_history: annualResearchHistory(normalized)
  };

  return {
    normalizedData,
    sec: {
      cik,
      source: "SEC_COMPANYFACTS",
      status: latestRevenue ? "available" : "partial",
      missing_fields: normalized.missing_fields,
      latest_fiscal_year: latestYear
    }
  };
}
