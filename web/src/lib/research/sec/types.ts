import type { NormalizedResearchData } from "../schemas/researchSchemas";

export const SEC_COMPANYFACTS_SOURCE = "SEC_COMPANYFACTS" as const;

export type SecFactSource = typeof SEC_COMPANYFACTS_SOURCE;

export type SecFactValue = {
  ticker: string;
  cik: string;
  fiscal_year: number;
  fiscal_period: string;
  form: string;
  filed_date: string;
  end_date: string;
  value: number;
  unit: string;
  source_tag: string;
  source: SecFactSource;
};

export type SecNormalizedAnnualFinancials = {
  ticker: string;
  cik: string;
  company_name?: string;
  fiscal_years: number[];
  facts: Partial<Record<SecNormalizedField, SecFactValue[]>>;
  latest_fiscal_year?: number;
  missing_fields: SecNormalizedField[];
};

export type SecResearchDataResult = {
  normalizedData: NormalizedResearchData;
  sec: {
    cik?: string;
    source: SecFactSource;
    status: "available" | "partial" | "unavailable";
    missing_fields: string[];
    latest_fiscal_year?: number;
  };
};

export type SecNormalizedField =
  | "revenue"
  | "gross_profit"
  | "operating_income"
  | "net_income"
  | "eps_basic"
  | "eps_diluted"
  | "r_and_d"
  | "sga"
  | "operating_cash_flow"
  | "capital_expenditure"
  | "free_cash_flow"
  | "buybacks"
  | "dividends"
  | "cash"
  | "total_assets"
  | "total_liabilities"
  | "shareholders_equity"
  | "short_term_debt"
  | "long_term_debt"
  | "total_debt"
  | "net_debt"
  | "shares_basic"
  | "shares_diluted"
  | "shares_outstanding";

export type SecCompanyTickerRecord = {
  cik_str: number;
  ticker: string;
  title: string;
};

export type SecCompanyTickersResponse = Record<string, SecCompanyTickerRecord>;

export type SecCompanyFactUnit = {
  val?: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  end?: string;
  frame?: string;
};

export type SecCompanyFactsJson = {
  cik: number;
  entityName?: string;
  facts?: {
    "us-gaap"?: Record<
      string,
      {
        label?: string;
        description?: string;
        units?: Record<string, SecCompanyFactUnit[]>;
      }
    >;
  };
};
