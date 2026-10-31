import { financialNumbers, htmlTables, htmlText } from "./html";
import type { InterimDisclosureInput, InterimDisclosureResult } from "./types";

type Profile = { cik: string; name: string; heading: string; revenue: string; income: string; scale: number; columns: 3 | 6 | 7; implicitRmb?: boolean; continuation?: boolean; usdFootnote?: boolean; unspecifiedGaap?: boolean };
// Issuer/layout identities, never financial values. USD columns are validated but never consumed.
const PROFILES: Record<string, Profile> = {
  NTES: { cik: "1110646", name: "NETEASE, INC.", heading: "UNAUDITED CONDENSED CONSOLIDATED STATEMENTS OF OPERATIONS AND COMPREHENSIVE INCOME", revenue: "Net revenues", income: "Net income", scale: 1e3, columns: 7 },
  JD: { cik: "1549802", name: "JD.COM, INC.", heading: "UNAUDITED INTERIM CONDENSED CONSOLIDATED STATEMENTS OF OPERATIONS", revenue: "Total net revenues", income: "Net income", scale: 1e6, columns: 6 },
  TCOM: { cik: "1269238", name: "TRIP.COM GROUP LIMITED", heading: "UNAUDITED CONSOLIDATED STATEMENTS OF INCOME/(LOSS)", revenue: "Total net revenues", income: "Net income/(loss)", scale: 1e6, columns: 7 },
  HTHT: { cik: "1483994", name: "H WORLD GROUP LIMITED", heading: "UNAUDITED INTERIM CONDENSED CONSOLIDATED STATEMENTS OF COMPREHENSIVE INCOME", revenue: "Total revenues", income: "Net income", scale: 1e6, columns: 3, implicitRmb: true },
  FINV: { cik: "1691445", name: "FINVOLUTION GROUP", heading: "UNAUDITED INTERIM CONDENSED CONSOLIDATED STATEMENTS OF COMPREHENSIVE INCOME", revenue: "Net revenue", income: "Net profit", scale: 1e3, columns: 6 },
  ATAT: { cik: "1853717", name: "ATOUR LIFESTYLE HOLDINGS LIMITED", heading: "UNAUDITED CONDENSED CONSOLIDATED STATEMENTS OF COMPREHENSIVE INCOME", revenue: "Net revenues", income: "Net income", scale: 1e3, columns: 6, usdFootnote: true },
  QFIN: { cik: "1741530", name: "QFIN HOLDINGS", heading: "UNAUDITED CONDENSED CONSOLIDATED STATEMENTS OF OPERATIONS", revenue: "Total net revenue", income: "Net income", scale: 1e3, columns: 6 },
  BEKE: { cik: "1809587", name: "KE HOLDINGS INC.", heading: "UNAUDITED CONDENSED CONSOLIDATED STATEMENT OF OPERATIONS", revenue: "Total net revenues", income: "Net income", scale: 1e3, columns: 6, unspecifiedGaap: true },
  NOAH: { cik: "1499543", name: "NOAH HOLDINGS", heading: "CONDENSED CONSOLIDATED STATEMENTS OF OPERATIONS", revenue: "Net revenues", income: "Net income", scale: 1e3, columns: 3, continuation: true },
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const clean = (value: string) => value.replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
const upper = (value: string) => clean(value).toUpperCase();
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const fail = (reason: string): InterimDisclosureResult => ({ status: "unsupported", reason });
type Header = { year: number; month: number; day: number; months: number; signature: string };

function readHeader(rows: string[][], caption: string, profile: Profile): Header | null {
  const head = rows.flat().join(" ");
  const windows = [...head.matchAll(/\b(three|six|nine) months ended\b/gi)].map(m => ({ three: 3, six: 6, nine: 9 })[m[1].toLowerCase()]!);
  if (!windows.length) return null;
  const expectedWindows=profile.columns===3?[Math.max(...windows)]:[3,Math.max(...windows)];
  if(JSON.stringify(windows)!==JSON.stringify(expectedWindows))return null;
  const months = Math.max(...windows);
  const dates = rows.flatMap(row => row.flatMap(cell => [...cell.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}),?(?: (20\d{2}))?/gi)]));
  const lastDate = dates.at(-1);
  if (!lastDate) return null;
  const month = MONTHS.findIndex(m => m.toLowerCase() === lastDate[1].toLowerCase()) + 1, day = Number(lastDate[2]);
  // These adapters support complete calendar YTD, not isolated Q2/Q3 masquerading as YTD.
  if (months !== month || ![3, 6, 9].includes(months)) return null;
  const yearRow = rows.find(row => row.some(c => /^20\d{2}(?: (?:RMB|USD|US\$))?$/.test(c)));
  const years = yearRow?.flatMap(c => /^20\d{2}(?: (?:RMB|USD|US\$))?$/.test(c) ? [Number(c.slice(0, 4))] : [])
    ?? dates.filter(d => d[3]).map(d => Number(d[3]));
  const year = years.at(-1);
  if (!year || !validDate(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`)
    || day !== new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  const expectedYears = profile.columns === 7 ? [year - 1, year, year, year, year - 1, year, year]
    : profile.columns === 6 ? [year - 1, year, year, year - 1, year, year] : [year - 1, year, year];
  const nativeYears = profile.columns === 6 ? [year - 1, year, year - 1, year] : expectedYears;
  if (JSON.stringify(years) !== JSON.stringify(expectedYears) && JSON.stringify(years) !== JSON.stringify(nativeYears)) return null;
  // Every actual YTD date column must describe the same season; earlier standalone quarters may differ.
  const datedYears = dates.filter(d => d[3]);
  if (datedYears.length && (datedYears.length !== profile.columns || datedYears.slice(-3).some((d, i) => Number(d[3]) !== year - (i === 0 ? 1 : 0) || MONTHS.findIndex(m => m.toLowerCase() === d[1].toLowerCase()) + 1 !== month || Number(d[2]) !== day))) return null;
  const expectedCurrency = profile.columns === 7 ? ["RMB", "RMB", "RMB", "USD", "RMB", "RMB", "USD"]
    : profile.columns === 6 ? ["RMB", "RMB", "USD", "RMB", "RMB", "USD"] : ["RMB", "RMB", "USD"];
  const currencyRow = rows.find(row => row.some(c => /^(?:RMB|USD(?: 1)?|US\$)$/.test(c)))
    ?? rows.find(row => row.some(c => /\bRMB\b|\bUSD\b/.test(c) && /20\d{2}/.test(c)));
  let currencies = currencyRow?.flatMap(c => [...c.matchAll(/\bRMB\b|\bUSD\b|US\$/g)].map(m => m[0] === "US$" ? "USD" : m[0]));
  if (currencyRow?.some(c => /USD 1/.test(c)) && !profile.usdFootnote) return null;
  if (profile.implicitRmb && !currencies && /Renminbi in millions/i.test(caption) && rows.some(row => row.some(c => /^US\$[’']? in millions?$/.test(c)))) currencies = ["RMB", "RMB", "USD"];
  if (!currencies || JSON.stringify(currencies) !== JSON.stringify(expectedCurrency)) return null;
  const declared = `${caption} ${head}`;
  const scale = /\bin millions\b/i.test(declared) ? 1e6 : /\bin thousands\b/i.test(declared) ? 1e3 : null;
  if (scale !== profile.scale) return null;
  return { year, month, day, months, signature: `${year}|${month}|${day}|${months}|${currencies.join("|")}` };
}

/** Strict native-CNY consolidated GAAP comparables for verified SEC issuer layouts. */
export function parseCnyComparables(input: InterimDisclosureInput): InterimDisclosureResult {
  const ticker = input.ticker.toUpperCase(), profile = PROFILES[ticker];
  if (!profile) return fail("No validated native CNY issuer/layout adapter");
  const text = clean(htmlText(input.html));
  if (!upper(text).includes(profile.heading)) return { status: "no_evidence", reason: "No validated consolidated income statement" };
  let url: URL;
  try { url = new URL(input.exhibitUrl); } catch { return fail("Invalid exhibit URL"); }
  if (url.protocol !== "https:" || url.hostname !== "www.sec.gov" || url.port || url.username || url.password || url.search || url.hash || !/^\d{10}-\d{2}-\d{6}$/.test(input.accessionNumber)
    || !url.pathname.startsWith(`/Archives/edgar/data/${profile.cik}/${input.accessionNumber.replaceAll("-", "")}/`)
    || !/\.html?$/.test(url.pathname) || !validDate(input.publishedAt) || !upper(text).includes(profile.name)) return fail("Invalid issuer/source provenance");
  if (!profile.unspecifiedGaap && !/U\.S\. GAAP|US GAAP|United States Generally Accepted Accounting Principles/i.test(text)) return fail("US GAAP basis not established by document");
  if (profile.unspecifiedGaap && (!/\bGAAP\b/.test(text) || /\b(?:IFRS|IFRSS|TIFRS)\b/i.test(text))) return fail("Unverified or conflicting GAAP basis");
  if (/\b(?:prepared|presented)\s+(?:and\s+(?:prepared|presented)\s+)?(?:in\s+accordance\s+with|under)\s+(?:the\s+)?(?:IFRS|TIFRS)\b/i.test(text)) return fail("Conflicting accounting basis declaration");
  const hits: { header: Header; field: "revenue" | "income"; prior: number; current: number }[] = [];
  let continuation: { caption: string; header: Header } | undefined;
  for (const table of htmlTables(input.html)) {
    const caption = clean(table.precedingText);
    const rows = table.rows.map(row => row.map(clean).filter(Boolean));
    const ownHeading = upper(caption).includes(profile.heading) && !/NON[- ]GAAP|RECONCILIATION|SEGMENT|\bIFRS\b|\bTIFRS\b/i.test(caption.slice(Math.max(0,caption.toUpperCase().lastIndexOf(profile.heading)-35)));
    const continuing = profile.continuation && continuation && !/STATEMENTS? OF|RECONCILIATION|SEGMENT/i.test(caption);
    if (!ownHeading && !continuing) { continuation = undefined; continue; }
    const wanted = rows.filter(row => row[0] === profile.revenue || row[0] === profile.income);
    if (!wanted.length) { continuation = undefined; continue; }
    const first = rows.indexOf(wanted[0]);
    const header = readHeader(rows.slice(0, first), ownHeading ? caption : continuation!.caption, profile);
    if (!header || (!ownHeading && header.signature !== continuation!.header.signature)) return fail("Unrecognized or non-comparable YTD/currency/scale headers");
    for (const row of wanted) {
      const numbers = financialNumbers(row.slice(1));
      if (!numbers || numbers.length !== profile.columns) return fail("Unexpected consolidated financial row width or value");
      hits.push({ header, field: row[0] === profile.revenue ? "revenue" : "income", prior: numbers.at(-3)! * profile.scale, current: numbers.at(-2)! * profile.scale });
    }
    continuation = { caption: ownHeading ? caption : continuation!.caption, header };
  }
  if (!hits.length) return fail("No complete consolidated native CNY comparables");
  const anchor = hits[0].header;
  if (hits.some(h => h.header.signature !== anchor.signature)) return fail("Conflicting consolidated reporting periods");
  const pick = (field: "revenue" | "income") => {
    const values = hits.filter(h => h.field === field);
    return values.length && values.every(h => h.current === values[0].current && h.prior === values[0].prior) ? values[0] : null;
  };
  const revenue = pick("revenue"), income = pick("income");
  if (!revenue || !income || ![revenue.current, revenue.prior, income.current, income.prior].every(Number.isFinite) || revenue.current < 0 || revenue.prior < 0) return fail("Missing or conflicting consolidated income facts");
  const suffix = `${String(anchor.month).padStart(2, "0")}-${String(anchor.day).padStart(2, "0")}`, end = `${anchor.year}-${suffix}`;
  const age = (Date.parse(input.publishedAt) - Date.parse(end)) / 864e5;
  if (age < 0 || age > 180) return fail("Source availability does not follow financial reporting period");
  return { status: "supported", evidence: {
    ticker, currency: "CNY", accountingBasis: profile.unspecifiedGaap ? "GAAP-unspecified" : "US-GAAP", comparisonBasis: "ytd", fiscalYearStart: `${anchor.year}-01-01`,
    current: { start: `${anchor.year}-01-01`, end, revenue: revenue.current, netIncome: income.current },
    prior: { start: `${anchor.year - 1}-01-01`, end: `${anchor.year - 1}-${suffix}`, revenue: revenue.prior, netIncome: income.prior },
    source: { accessionNumber: input.accessionNumber, exhibitUrl: input.exhibitUrl, publishedAt: input.publishedAt, parserVersion: "cny-consolidated-ytd-v1" },
  } };
}
