import { SEC_DATA_BASE, filingIndexUrl, filingUrl, secFetchJson } from "./sec-client";

export type SecSubmission = {
  cik: string;
  name?: string;
  tickers?: string[];
  exchanges?: string[];
  sic?: string;
  sicDescription?: string;
  fiscalYearEnd?: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
};

export type NormalizedFiling = {
  cik: string;
  ticker: string;
  accession_number: string;
  form: string;
  filing_date: string | null;
  report_date: string | null;
  fiscal_year: number | null;
  fiscal_period: string | null;
  primary_document: string | null;
  filing_url: string;
  sec_index_url: string;
};

const SUPPORTED_FORMS = new Set(["10-K", "10-Q", "20-F", "6-K"]);

export async function fetchCompanySubmissions(cik: string) {
  return secFetchJson<SecSubmission>(`${SEC_DATA_BASE}/submissions/CIK${cik}.json`);
}

export function normalizeRecentFilings(ticker: string, submission: SecSubmission, limit = 24): NormalizedFiling[] {
  const recent = submission.filings.recent;
  const filings: NormalizedFiling[] = [];

  for (let index = 0; index < recent.form.length; index += 1) {
    const form = recent.form[index];
    if (!SUPPORTED_FORMS.has(form)) continue;
    const accessionNumber = recent.accessionNumber[index];
    const primaryDocument = recent.primaryDocument[index] || null;
    const reportDate = recent.reportDate[index] || null;
    const fiscalYear = reportDate ? Number(reportDate.slice(0, 4)) : null;

    filings.push({
      cik: submission.cik.padStart(10, "0"),
      ticker,
      accession_number: accessionNumber,
      form,
      filing_date: recent.filingDate[index] || null,
      report_date: reportDate,
      fiscal_year: fiscalYear,
      fiscal_period: form === "10-K" || form === "20-F" ? "FY" : null,
      primary_document: primaryDocument,
      filing_url: filingUrl(submission.cik, accessionNumber, primaryDocument),
      sec_index_url: filingIndexUrl(submission.cik, accessionNumber)
    });
    if (filings.length >= limit) break;
  }

  return filings;
}
