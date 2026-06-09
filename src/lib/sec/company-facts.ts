import { SEC_DATA_BASE, secFetchJson } from "./sec-client";

export type CompanyFacts = {
  cik: number;
  entityName: string;
  facts: Record<
    string,
    Record<
      string,
      {
        label?: string;
        description?: string;
        units: Record<string, SecFactUnit[]>;
      }
    >
  >;
};

export type SecFactUnit = {
  start?: string;
  end?: string;
  val: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
};

export async function fetchCompanyFacts(cik: string) {
  return secFetchJson<CompanyFacts>(`${SEC_DATA_BASE}/api/xbrl/companyfacts/CIK${cik}.json`);
}
