import type { SourceRoute } from "./types";

// Audited 2026-10-31. These are operating issuers with alternate official channels,
// not exclusions from holdings, prices or the operating-company universe.
const ROUTES: Record<string, Omit<SourceRoute, "ticker" | "audited_at">> = {
  IBN: { cik: "0001103838", adapter: "sec_html", currency: "INR", accounting_basis: "Indian-GAAP",
    issuer_identifier: "0001103838", identifier_scheme: "CIK",
    landing_url: "https://data.sec.gov/submissions/CIK0001103838.json", source_description: "SEC 20-F primary Indian-GAAP consolidated HTML statements" },
  HMRZF: { cik: "0001396282", adapter: "esef_zip", currency: "SEK", accounting_basis: "IFRS",
    issuer_identifier: "529900O5RR7R39FRDM42", identifier_scheme: "LEI",
    landing_url: "https://hmgroup.com/investors/reports/", source_description: "H&M official annual ESEF, November fiscal year end" },
  HKHHF: { cik: "0001142231", adapter: "inline_viewer", currency: "EUR", accounting_basis: "IFRS",
    issuer_identifier: "724500M1WJLFM9TYBS04", identifier_scheme: "LEI",
    landing_url: "https://www.heinekenholding.com/investors/results-reports-webcasts-presentations", source_description: "Heineken Holding official inline XBRL viewer copy; not formal ESEF" },
  OZK: { cik: "0001569650", adapter: "pdf_pending", currency: "USD", accounting_basis: "US-GAAP",
    issuer_identifier: "110", identifier_scheme: "FDIC_CERT",
    landing_url: "https://securitiesfilings.fdicconnect.fdic.gov/api/instflng/cert/110", source_description: "Bank OZK consolidated FDIC corporate reports; official PDF adapter pending (bank Call Reports are a different scope)" },
  TRMLF: { cik: "0002071881", adapter: "pdf_pending", currency: "CAD", accounting_basis: "IFRS",
    issuer_identifier: "89156V106", identifier_scheme: "CUSIP",
    landing_url: "https://www.tourmalineoil.com/investors/financial-reports", source_description: "Tourmaline Oil ordinary-share consolidated reports; official PDF adapter pending (not TRMOY ADRs)" },
};
export function getOfficialSourceRoute(ticker: string, cik: string): SourceRoute | null {
  const route = ROUTES[ticker];
  if (!route) return null;
  if (route.cik !== cik) throw new Error(`Official financial source issuer identity mismatch (${ticker})`);
  return { ...route, ticker, audited_at: "2026-10-31" };
}
export class OfficialSourcePendingError extends Error {
  readonly code = "official_pdf_adapter_pending";
  constructor(readonly route: SourceRoute) {
    super(`${route.ticker}: official PDF financial adapter pending; ${route.source_description}. Source: ${route.landing_url} (audited ${route.audited_at})`);
    this.name = "OfficialSourcePendingError";
  }
}
