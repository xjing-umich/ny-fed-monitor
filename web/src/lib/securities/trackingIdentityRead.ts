import { getDb, withRetry } from "../managers/db";
import { resolveTickerCik } from "../sec/ticker-cik";
import { normalizeTicker } from "./openfigi";
import { isIdentityQuarantined } from "./securityIdentity";
import { resolveTrackingIdentity, type SecurityIdentity } from "./trackingIdentity";

/** Server-only public metadata read. Reuses the SEC reader's cached issuer map; never guesses from a company name. */
export async function readTrackingIdentity(ticker: string): Promise<SecurityIdentity | null> {
  const upper = normalizeTicker(ticker.trim().toUpperCase());
  if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(upper) || isIdentityQuarantined(upper)) return null;
  const db = getDb();
  const [security, company, mappings, current] = await Promise.all([
    withRetry(() => db.from("securities").select("ticker,figi,primary_cusip,security_type,source,as_of").eq("ticker", upper).maybeSingle()),
    withRetry(() => db.from("sec_companies").select("cik,source,updated_at").eq("ticker", upper).maybeSingle()),
    withRetry(() => db.from("security_cusips").select("cusip,ticker,resolved,updated_at").eq("ticker", upper).eq("resolved", true)),
    resolveTickerCik(upper),
  ]);
  for (const result of [security, company, mappings]) {
    if (result.error) throw new Error(`Tracking identity read failed (${upper}): ${result.error.message}`);
  }
  const row = security.data;
  const issuer = company.data;
  if (!row || !issuer || !current || issuer.source !== "sec" || !row.source || !row.as_of || !issuer.updated_at) return null;
  // The oldest supporting source date is honest provenance, rather than today's read time.
  const dates = [row.as_of, issuer.updated_at, ...(mappings.data ?? []).map((mapping) => mapping.updated_at)];
  if (dates.some((date) => !Number.isFinite(Date.parse(date)))) return null;
  const checkedAt = dates.sort((a, b) => Date.parse(a) - Date.parse(b))[0].slice(0, 10);
  return resolveTrackingIdentity({
    ticker: upper, figi: row.source === "openfigi" ? row.figi : null,
    cik: issuer.cik, verifiedCik: current.cik, cusip: row.primary_cusip,
    verifiedCusips: mappings.data?.length ? mappings.data.map((mapping) => mapping.cusip) : undefined,
    securityType: row.security_type ?? "", source: `${row.source}+sec:https://www.sec.gov/files/company_tickers.json`, checkedAt,
  });
}
