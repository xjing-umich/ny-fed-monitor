export const SEC_DATA_BASE = "https://data.sec.gov";
export const SEC_WWW_BASE = "https://www.sec.gov";

export function getSecUserAgent() {
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent) {
    throw new Error('Missing SEC_USER_AGENT, e.g. "Compounder Research y0276406@gmail.com"');
  }
  return userAgent;
}

export async function secFetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": getSecUserAgent(),
      "Accept-Encoding": "gzip, deflate",
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`SEC request failed ${response.status}: ${url}`);
  }

  return response.json() as Promise<T>;
}

export async function secFetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": getSecUserAgent(),
      "Accept-Encoding": "gzip, deflate"
    }
  });

  if (!response.ok) {
    throw new Error(`SEC request failed ${response.status}: ${url}`);
  }

  return response.text();
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function filingUrl(cik: string, accessionNumber: string, primaryDocument?: string | null) {
  const cikInt = String(Number(cik));
  const accession = accessionNumber.replaceAll("-", "");
  if (!primaryDocument) return `${SEC_WWW_BASE}/Archives/edgar/data/${cikInt}/${accession}/`;
  return `${SEC_WWW_BASE}/Archives/edgar/data/${cikInt}/${accession}/${primaryDocument}`;
}

export function filingIndexUrl(cik: string, accessionNumber: string) {
  const cikInt = String(Number(cik));
  const accession = accessionNumber.replaceAll("-", "");
  return `${SEC_WWW_BASE}/Archives/edgar/data/${cikInt}/${accession}/`;
}
