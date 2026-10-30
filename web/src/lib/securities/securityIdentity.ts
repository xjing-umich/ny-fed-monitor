/**
 * Reviewed conflicts between historical holdings identity and current ticker identity.
 * Keep historical positions, but never join the reused ticker to today's financials/price.
 * Source checked 2026-10-30: SEC company_tickers + issuer submissions; Yahoo chart metadata.
 * Removal requires verification of the historical CUSIP's current security, not a name change.
 */
export const IDENTITY_QUARANTINES: Readonly<
  Record<
    string,
    {
      historicalCik: string;
      currentCik: string;
      cusip: string;
      checkedAt: string;
      source: string;
    }
  >
> = {
  SATS: {
    historicalCik: "0001415404",
    currentCik: "0001920406",
    cusip: "278768106",
    checkedAt: "2026-10-30",
    source: "https://www.sec.gov/files/company_tickers.json",
  },
};
export const QUARANTINED_TICKERS_SQL = `(${Object.keys(IDENTITY_QUARANTINES).join(",")})`;
export function isIdentityQuarantined(ticker: string): boolean {
  return Object.hasOwn(IDENTITY_QUARANTINES, ticker.trim().toUpperCase());
}
export function assertSecurityIdentity(ticker: string): void {
  if (isIdentityQuarantined(ticker))
    throw new Error(
      `Security identity quarantined: ${ticker.toUpperCase()} now identifies a different issuer`,
    );
}
