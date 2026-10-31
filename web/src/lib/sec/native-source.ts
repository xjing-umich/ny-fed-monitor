import type { SecSubmission } from "./company-submissions";
import { normalizeRecentFilings } from "./company-submissions";
import { filingUrl, secFetchJson, secFetchText } from "./sec-client";
import { NATIVE_40F_ISSUERS, parseNativeFinancials } from "./native-financials";

/** Discover the SEC-extracted instance; 40-F financials live in exhibits, not the cover. */
export async function fetchNativeFinancials(ticker: string, cik: string, submission: SecSubmission) {
  if (NATIVE_40F_ISSUERS[ticker] !== cik || String(submission.cik).padStart(10, "0") !== cik) throw new Error("Native financial submission identity mismatch");
  const filing = normalizeRecentFilings(ticker, submission).find(f => f.form === "40-F");
  if (!filing) throw new Error(`${ticker}: latest 40-F unavailable in SEC submissions`);
  const index = await secFetchJson<{ directory?: { item?: { name?: string }[] } }>(`${filing.sec_index_url}index.json`);
  const candidates = (index.directory?.item ?? []).map(item => item.name).filter((name): name is string =>
    !!name && /^[a-zA-Z0-9_.-]+_htm\.xml$/.test(name));
  const preferred = filing.primary_document?.replace(/\.html?$/i, "_htm.xml");
  const name = preferred && candidates.includes(preferred) ? preferred : candidates.length === 1 ? candidates[0] : null;
  if (!name) throw new Error(`${ticker}: unambiguous SEC extracted 40-F instance unavailable`);
  const url = filingUrl(cik, filing.accession_number, name);
  return parseNativeFinancials(ticker, filing, await secFetchText(url), url);
}
