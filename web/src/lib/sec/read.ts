import { isIdentityQuarantined } from "../securities/securityIdentity";
import { getDb, withRetry } from "@/lib/managers/db";
import { CFP_SELECT } from "./columns";

export type SecLatestSummary = {
  ticker: string;
  cik: string;
  company_name: string | null;
  latest_10k_period_end: string | null;
  latest_10q_period_end: string | null;
  latest_filing_date: string | null;
  latest_revenue: number | null;
  latest_net_income: number | null;
  latest_fcf: number | null;
  latest_cash: number | null;
  latest_debt: number | null;
  latest_equity: number | null;
  latest_revenue_yoy: number | null;
  latest_net_margin: number | null;
  latest_roe: number | null;
  latest_fcf_margin: number | null;
  quality_status: string | null;
};

export async function getSecCompanyData(ticker: string) {
  if (isIdentityQuarantined(ticker)) return { company: null, filings: [], annual: [], quarterly: [], latest: null };
  let db;
  try {
    db = getDb();
  } catch {
    return {
      company: null,
      filings: [],
      annual: [],
      quarterly: [],
      latest: null,
    };
  }
  const upper = ticker.toUpperCase();
  const [companyResult, periodsResult, latestResult] = await Promise.all([
    withRetry(() => db.from("sec_companies").select("*").eq("ticker", upper).maybeSingle()),
    withRetry(() => db.from("company_fundamentals_periods").select(CFP_SELECT).eq("ticker", upper).order("period_end", { ascending: false }).limit(32)),
    withRetry(() => db.from("company_fundamentals_latest").select("*").eq("ticker", upper).maybeSingle()),
  ]);
  for (const result of [companyResult, periodsResult, latestResult]) {
    if (result.error) throw new Error(`SEC company read failed (${upper}): ${result.error.message}`);
  }
  const company = companyResult.data;
  // An accession belongs to the issuer, not to one share-class ticker.
  const filingResult = company?.cik
    ? await withRetry(() => db.from("sec_filings").select("*").eq("cik", company.cik)
        .order("filing_date", { ascending: false }).order("accession_number", { ascending: false }).limit(24))
    : { data: [], error: null };
  if (filingResult.error) throw new Error(`SEC filings read failed (${upper}): ${filingResult.error.message}`);
  const rows = periodsResult.data ?? [];
  return {
    company,
    filings: filingResult.data ?? [],
    annual: rows.filter((row) => row.fiscal_period === "FY"),
    quarterly: rows.filter((row) => row.fiscal_period !== "FY").slice(0, 12),
    latest: latestResult.data,
  };
}
