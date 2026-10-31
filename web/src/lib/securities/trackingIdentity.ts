import { isIdentityQuarantined } from "./securityIdentity";
import { normalizeTicker, padCusip } from "./openfigi";

export type SecurityIdentity = {
  key: string; ticker: string; figi: string | null; cik: string | null;
  cusip: string | null; securityType: string; source: string; checkedAt: string;
};

/** Only pass source-verified metadata. The optional cross-checks must agree, even when FIGI is present. */
export type TrackingIdentityMeta = {
  ticker: string; figi?: string | null; cik?: string | null; cusip?: string | null;
  securityType: string; source: string; checkedAt: string;
  verifiedCik?: string | null;
  verifiedCusips?: readonly string[];
};

function cikId(value: string): string | null {
  return /^\d{1,10}$/.test(value) && Number(value) > 0 ? value.padStart(10, "0") : null;
}

export function resolveTrackingIdentity(meta: TrackingIdentityMeta): SecurityIdentity | null {
  const ticker = normalizeTicker(meta.ticker.trim().toUpperCase());
  const figi = meta.figi?.trim().toUpperCase() || null;
  const cik = meta.cik ? cikId(meta.cik.trim()) : null;
  const cusip = meta.cusip?.trim() ? padCusip(meta.cusip).toUpperCase() : null;
  const securityType = meta.securityType.trim();
  const source = meta.source.trim();
  if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(ticker) || isIdentityQuarantined(ticker)) return null;
  if (!securityType || !source || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(meta.checkedAt) || !Number.isFinite(Date.parse(meta.checkedAt))) return null;
  if (new Date(meta.checkedAt.slice(0, 10)).toISOString().slice(0, 10) !== meta.checkedAt.slice(0, 10)) return null;
  if (meta.cik && !cik || figi && !/^BBG[A-Z0-9]{9}$/.test(figi) || cusip && !/^[A-Z0-9*@#]{9}$/.test(cusip)) return null;
  if (meta.verifiedCik != null && (!cik || cik !== cikId(meta.verifiedCik.trim()))) return null;
  if (meta.verifiedCusips && (meta.verifiedCusips.length === 0 || !cusip || meta.verifiedCusips.some((value) => padCusip(value).toUpperCase() !== cusip))) return null;
  // CIK identifies an issuer. A generic "Common Stock" class alone cannot distinguish GOOG/GOOGL.
  const key = figi ? `figi:${figi}` : cik && cusip ? `sec:${cik}:${encodeURIComponent(securityType)}:${cusip}` : null;
  return key ? { key, ticker, figi, cik, cusip, securityType, source, checkedAt: meta.checkedAt } : null;
}
