/** Native reporting currency only. These values must not be stored as USD fundamentals. */
export type InterimIncomePeriod = {
  start: string;
  end: string;
  revenue: number;
  /** Consolidated GAAP net income, not adjusted or attributable-to-parent income. */
  netIncome: number;
};
export type InterimDisclosureInput = {
  ticker: string;
  html: string;
  accessionNumber: string;
  exhibitUrl: string;
  /** Official source availability date (SEC filing date for ingestion), distinct from financial report period. */
  publishedAt: string;
};
export type InterimIncomeEvidence = {
  ticker: string;
  /** null means the selected statement proves a shared '$' unit but no ISO code. Ratios only. */
  currency: "CNY" | "USD" | "EUR" | "TWD" | null;
  presentationUnit?: "$";
  sharedUnitVerified?: boolean;
  accountingBasis: "US-GAAP" | "IFRS" | "TIFRS" | "GAAP-unspecified";
  comparisonBasis: "quarter" | "ytd" | "half_year";
  current: InterimIncomePeriod;
  prior: InterimIncomePeriod;
  fiscalYearStart: string;
  source: {
    accessionNumber: string;
    exhibitUrl: string;
    publishedAt: string;
    parserVersion: string;
    documentSha256?: string;
    netIncomeSource?: "consolidated_cash_flow";
    priorDerivation?: {
      method: "sum_reported_quarters";
      fiscalYear: number;
      quarters: ("Q1" | "Q2" | "Q3")[];
      revenue: number[];
      netIncome: number[];
    };
  };
};
export type InterimDisclosureResult =
  | { status: "supported"; evidence: InterimIncomeEvidence }
  | { status: "unsupported" | "no_evidence"; reason: string };
