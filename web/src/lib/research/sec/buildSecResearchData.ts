import type { NormalizedResearchData } from "../schemas/researchSchemas";
import { latestFinancialMetrics, latestGrowthMetrics, latestNormalizedFinancials, secRiskSignals } from "./derivedMetrics";
import { fetchCompanyFactsByTicker } from "./companyFacts";
import { latestFact, normalizeAnnualCompanyFacts } from "./normalizeCompanyFacts";
import type { SecCompanyFactsJson, SecResearchDataResult } from "./types";

export function buildResearchDataFromCompanyFacts(
  ticker: string,
  cik: string,
  companyFacts: SecCompanyFactsJson,
): SecResearchDataResult {
  const normalized = normalizeAnnualCompanyFacts(ticker, cik, companyFacts);
  const latestYear = normalized.latest_fiscal_year;
  const latestRevenue = latestFact(normalized, "revenue");
  const normalizedData: NormalizedResearchData = {
    ticker: ticker.toUpperCase(),
    company_name: normalized.company_name,
    period: latestYear ? `FY${latestYear}` : undefined,
    normalized_financials: latestNormalizedFinancials(normalized),
    financial_metrics: latestFinancialMetrics(normalized),
    growth_metrics: latestGrowthMetrics(normalized),
    risk_signals: secRiskSignals(normalized),
  };

  return {
    normalizedData,
    sec: {
      cik,
      source: "SEC_COMPANYFACTS",
      status: latestRevenue ? "available" : "partial",
      missing_fields: normalized.missing_fields,
      latest_fiscal_year: latestYear,
    },
  };
}

export async function buildSecResearchDataForTicker(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SecResearchDataResult> {
  const { cik, facts } = await fetchCompanyFactsByTicker(ticker, fetchImpl);
  return buildResearchDataFromCompanyFacts(ticker, cik, facts);
}

export function emptySecResearchData(ticker: string, error: string): SecResearchDataResult {
  return {
    normalizedData: {
      ticker: ticker.toUpperCase(),
      company_name: `${ticker.toUpperCase()} SEC research profile`,
      risk_signals: {
        forward_looking_risk: [`SEC companyfacts data unavailable: ${error}`],
      },
    },
    sec: {
      source: "SEC_COMPANYFACTS",
      status: "unavailable",
      missing_fields: [
        "normalized_financials",
        "financial_metrics",
        "growth_metrics",
        "valuation_metrics",
        "peer_comparison",
        "external_evidence",
      ],
    },
  };
}
