export const SEC_TICKER_CIK_URL = "https://www.sec.gov/files/company_tickers.json";
export const SEC_COMPANYFACTS_BASE_URL = "https://data.sec.gov/api/xbrl/companyfacts";

export function secUserAgent(): string {
  return (
    process.env.SEC_USER_AGENT ||
    process.env.NEXT_PUBLIC_SEC_USER_AGENT ||
    "ny-fed-monitor/1.0 research-contact@example.com"
  );
}
