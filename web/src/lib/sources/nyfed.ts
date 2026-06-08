/**
 * nyfed.ts — fetch helpers for NY Fed APIs
 * Mirrors Python NYFedClient retry/backoff behavior.
 */

type Opts = {
  tag: string;
  revalidate?: number;
  maxAttempts?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
  /**
   * Optional pre-parse transform on the raw response body. When provided, the
   * body is read as text, passed through `sanitize`, then JSON.parsed — instead
   * of calling `res.json()` directly. Use to repair known upstream JSON defects
   * (e.g. NY Fed emits bare unquoted `*` sentinels that break strict parsing).
   */
  sanitize?: (raw: string) => string;
};

/**
 * Fetch JSON from a URL with exponential backoff retry on 5xx errors.
 * 4xx errors are non-retryable and throw immediately.
 */
export async function fetchJsonWithRetry(url: string, opts: Opts): Promise<unknown> {
  const {
    tag,
    revalidate = 600,
    maxAttempts = 3,
    backoffMs = 500,
    fetchImpl = fetch,
    sanitize,
  } = opts;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchImpl(url, {
        next: { revalidate, tags: [tag] },
      } as RequestInit);
      if (res.ok) {
        if (sanitize) return JSON.parse(sanitize(await res.text()));
        return await res.json();
      }
      if (res.status < 500) throw new Error(`${url} ${res.status}`);
      lastErr = new Error(`${url} ${res.status}`);
    } catch (e) {
      // Re-throw non-5xx errors immediately (they won't be retried)
      if (e instanceof Error && e.message.match(/ [1-4]\d\d$/)) throw e;
      lastErr = e;
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, backoffMs * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`fetch failed after ${maxAttempts}: ${lastErr}`);
}

// ─── Typed row shapes ────────────────────────────────────────────────────────

export type PdRow = { date: string; value: number | null };

export type ReferenceRateRow = {
  date: string;
  rate_name: string;
  rate_percent: number | null;
  volume: number | null;
};

export type SomaSummaryRow = {
  date: string;
  category: "Treasury" | "MBS" | "Total";
  par_value: number | null;
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function toFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "*") return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

// ─── PD History ──────────────────────────────────────────────────────────────

/**
 * Fetch PD time-series history for a given keyid.
 * URL: https://markets.newyorkfed.org/api/pd/get/<keyid>.json
 * Response shape: { pd: { timeseries: [{ asofdate, value }] } }
 */
export async function fetchPdHistory(keyid: string): Promise<PdRow[]> {
  const url = `https://markets.newyorkfed.org/api/pd/get/${keyid}.json`;
  const payload = (await fetchJsonWithRetry(url, { tag: `pd-${keyid}` })) as Record<
    string,
    unknown
  >;
  const timeseries = (
    (payload?.pd as Record<string, unknown>)?.timeseries ?? []
  ) as Array<Record<string, unknown>>;
  return timeseries.map((item) => ({
    date: String(item.asofdate ?? ""),
    value: toFloat(item.value),
  }));
}

// ─── Reference Rates ─────────────────────────────────────────────────────────

const RATE_ENDPOINTS: Record<string, string> = {
  SOFR: "https://markets.newyorkfed.org/api/rates/secured/sofr/last/30.json",
  EFFR: "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/30.json",
  OBFR: "https://markets.newyorkfed.org/api/rates/unsecured/obfr/last/30.json",
  TGCR: "https://markets.newyorkfed.org/api/rates/secured/tgcr/last/30.json",
  BGCR: "https://markets.newyorkfed.org/api/rates/secured/bgcr/last/30.json",
};

/**
 * Fetch the last 30 days of SOFR/EFFR/OBFR/TGCR/BGCR from NY Fed.
 * Response shape for each: { refRates: [{ effectiveDate, percentRate, volumeInBillions }] }
 */
export async function fetchReferenceRates(): Promise<ReferenceRateRow[]> {
  const results: ReferenceRateRow[] = [];
  for (const [rateName, url] of Object.entries(RATE_ENDPOINTS)) {
    try {
      const payload = (await fetchJsonWithRetry(url, {
        tag: `ref-rate-${rateName}`,
      })) as Record<string, unknown>;
      const items = (payload?.refRates ?? []) as Array<Record<string, unknown>>;
      for (const item of items) {
        results.push({
          date: String(item.effectiveDate ?? ""),
          rate_name: rateName,
          rate_percent: toFloat(item.percentRate),
          volume: toFloat(item.volumeInBillions),
        });
      }
    } catch {
      // Partial failure: skip this rate, caller can detect missing rates
    }
  }
  return results;
}

// ─── SOMA Summary ─────────────────────────────────────────────────────────────

/**
 * Fetch SOMA summary holdings.
 * URL: https://markets.newyorkfed.org/api/soma/summary.json
 * Returns rows with category Treasury / MBS / Total for each date.
 */
export async function fetchSomaSummary(): Promise<SomaSummaryRow[]> {
  const url = "https://markets.newyorkfed.org/api/soma/summary.json";
  const payload = (await fetchJsonWithRetry(url, { tag: "soma-summary" })) as Record<
    string,
    unknown
  >;
  const records = (
    (payload?.soma as Record<string, unknown>)?.summary ?? []
  ) as Array<Record<string, unknown>>;

  const rows: SomaSummaryRow[] = [];
  for (const rec of records) {
    const notesBonds = toFloat(rec.notesbonds) ?? 0;
    const bills = toFloat(rec.bills) ?? 0;
    const tips = toFloat(rec.tips) ?? 0;
    const tipsInflation = toFloat(rec.tipsInflationCompensation) ?? 0;
    const frn = toFloat(rec.frn) ?? 0;
    const agencies = toFloat(rec.agencies) ?? 0;
    const treasuryTotal = notesBonds + bills + tips + tipsInflation + frn + agencies;
    const mbsTotal = (toFloat(rec.mbs) ?? 0) + (toFloat(rec.cmbs) ?? 0);
    const date = String(rec.asOfDate ?? "");
    rows.push({ date, category: "Treasury", par_value: treasuryTotal });
    rows.push({ date, category: "MBS", par_value: mbsTotal });
    rows.push({ date, category: "Total", par_value: toFloat(rec.total) });
  }
  return rows;
}

// ─── Facility Usage ────────────────────────────────────────────────────────────

/**
 * Fetch raw facility usage payload (lastTwoWeeks).
 * URL: https://markets.newyorkfed.org/api/rp/all/all/results/lastTwoWeeks.json
 * Returns the raw JSON — normalization is done in the analyzer.
 */
export async function fetchFacilityUsage(): Promise<unknown> {
  const url =
    "https://markets.newyorkfed.org/api/rp/all/all/results/lastTwoWeeks.json";
  return fetchJsonWithRetry(url, { tag: "facility-usage" });
}
