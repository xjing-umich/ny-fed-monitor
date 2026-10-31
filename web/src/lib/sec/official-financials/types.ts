export type SourceAdapter = "sec_html" | "esef_zip" | "inline_viewer" | "pdf_pending";
export type SourceRoute = {
  ticker: string; cik: string; adapter: SourceAdapter; currency: "INR" | "SEK" | "EUR" | "USD" | "CAD";
  accounting_basis: "Indian-GAAP" | "IFRS" | "US-GAAP";
  issuer_identifier: string; identifier_scheme: "CIK" | "LEI" | "FDIC_CERT" | "CUSIP";
  landing_url: string; source_description: string; audited_at: string;
};
export type FieldEvidence = {
  value: number; unit: string; raw_value: string; scale: number;
  source_label: string; source_locator: string;
  context_id?: string; concept?: string; transformation?: string;
};
export type AnnualSourcePeriod = {
  period_start: string; period_end: string; fiscal_period: "FY"; is_comparative: boolean;
  metrics: Record<string, number>; raw_facts: Record<string, FieldEvidence>;
};
export type OfficialFinancialPeriod = AnnualSourcePeriod & {
  ticker: string; cik: string; issuer_identifier: string; identifier_scheme: SourceRoute["identifier_scheme"];
  reporting_currency: SourceRoute["currency"]; accounting_basis: SourceRoute["accounting_basis"];
  source_kind: "sec_20f_html" | "official_esef" | "official_inline_viewer_copy";
  source_document_id: string; source_url: string; source_landing_url: string;
  source_accession: string | null; source_published_at: string; source_report_period_end: string;
  source_sha256: string; source_retrieved_at: string;
  consolidation_scope: "consolidated"; share_basis: "issuer_ordinary";
  valuation_eligible: false; valuation_blockers: string[];
};
