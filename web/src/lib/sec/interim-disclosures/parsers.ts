import { parseCnyComparables } from "./cnyComparables";
import { parseUsdComparables } from "./usdComparables";
import { financialNumbers, htmlTables, htmlText } from "./html";
import type { InterimDisclosureInput, InterimDisclosureResult } from "./types";

export const INTERIM_PARSER_VERSION = "native-income-html-v1";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fail = (reason: string): InterimDisclosureResult => ({ status: "unsupported", reason });
const iso = (year: number, month: number, day = 1) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

/**
 * Verified PDD/BABA RMB income-statement layouts. Same-exhibit native comparables
 * avoid comparing convenience USD amounts translated at different exchange rates.
 * No network, persistence, FX, CapEx, adjusted earnings, or generic layout guessing.
 */
export function parseInterimDisclosure(input: InterimDisclosureInput): InterimDisclosureResult {
  const ticker = input.ticker.toUpperCase();
  const issuer = ticker === "PDD" ? { cik: "1737806", name: "PDD HOLDINGS INC.", heading: "CONDENSED CONSOLIDATED STATEMENTS OF INCOME", revenue: "Revenues" }
    : ticker === "BABA" ? { cik: "1577552", name: "ALIBABA GROUP HOLDING LIMITED", heading: "UNAUDITED CONSOLIDATED INCOME STATEMENTS", revenue: "Revenue" } : null;
  if (!issuer) {
    const cny = parseCnyComparables(input);
    if (cny.status === "supported") return cny;
    const usd = parseUsdComparables(input);
    return usd.status === "supported" ? usd : { status: "unsupported", reason: `${cny.reason}; ${usd.reason}` };
  }
  const text = htmlText(input.html);
  if (!text.includes(issuer.heading)) return { status: "no_evidence", reason: "No supported consolidated income statement" };
  let url: URL;
  try { url = new URL(input.exhibitUrl); } catch { return fail("Invalid exhibit URL"); }
  if (url.protocol !== "https:" || url.hostname !== "www.sec.gov" || !/^\d{10}-\d{2}-\d{6}$/.test(input.accessionNumber)
    || !url.pathname.startsWith(`/Archives/edgar/data/${issuer.cik}/${input.accessionNumber.replaceAll("-", "")}/`)
    || !validDate(input.publishedAt)) return fail("Invalid source provenance");
  if (/\b(?:IFRS|TIFRS)\b/i.test(text)) return fail("Conflicting accounting basis");
  const hits: { months: number; year: number; month: number; day: number; field: "revenue" | "netIncome"; prior: number; current: number }[] = [];
  for (const table of htmlTables(input.html)) {
    if (!table.precedingText.includes(issuer.name) || !table.precedingText.includes(issuer.heading)) continue;
    const headingContext=table.precedingText.slice(Math.max(0,table.precedingText.lastIndexOf(issuer.heading)-35));
    if(/NON[- ]GAAP|RECONCILIATION|SEGMENT|\bIFRS\b|\bTIFRS\b/i.test(headingContext))continue;
    const wanted = table.rows.filter(row => row[0] === issuer.revenue || row[0] === "Net income");
    if (!wanted.length) continue;
    const headers = table.rows.slice(0, table.rows.indexOf(wanted[0]));
    const heading = headers.flat().join(" ");
    const periods = [...heading.matchAll(/(?:For the )?(three|six|nine) months ended (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}),/gi)];
    const durations=periods.map(p=>({three:3,six:6,nine:9})[p[1].toLowerCase()]!);
    if(ticker==="PDD" && (durations.length!==2||durations[0]!==3||durations[1]!==Math.max(...durations)))return fail("Unsupported quarter/YTD column order");
    if(ticker==="BABA" && (durations.length!==1||durations[0]!==3))return fail("Unsupported fiscal Q1 column order");
    const years = headers.find(row => row.every(cell => /^20\d\d$/.test(cell)));
    const currencies = headers.find(row => row.some(cell => /^(?:RMB|US\$|EUR|USD|CNY)$/.test(cell)));
    if (!periods.length || !years || !currencies || currencies.join("|") !== Array(periods.length).fill("RMB|RMB|US$").join("|")
      || years.length !== periods.length * 2 || !/in millions/i.test(`${table.precedingText} ${heading}`)) return fail("Unrecognized period/currency/scale headers");
    const year = Number(years[1]);
    if (years.some((v, i) => Number(v) !== year - (i % 2 === 0 ? 1 : 0))) return fail("Non-comparable years");
    for (const row of wanted) {
      const numbers = financialNumbers(row.slice(1));
      if (!numbers || numbers.length !== periods.length * 3) return fail("Unexpected financial row width or number");
      periods.forEach((p, i) => hits.push({ months: { three: 3, six: 6, nine: 9 }[p[1].toLowerCase()]!, year, month: MONTHS.indexOf(p[2]) + 1, day: Number(p[3]), field: row[0] === issuer.revenue ? "revenue" : "netIncome", prior: numbers[i * 3] * 1e6, current: numbers[i * 3 + 1] * 1e6 }));
    }
  }
  if (!hits.length) return fail("Income statement layout unsupported");
  const months = Math.max(...hits.map(h => h.months));
  const selected = hits.filter(h => h.months === months);
  const anchor = selected[0];
  if (selected.some(h => h.year !== anchor.year || h.month !== anchor.month || h.day !== anchor.day)) return fail("Conflicting report periods");
  const end = iso(anchor.year, anchor.month, anchor.day);
  const startMonth = anchor.month - months + 1;
  if (startMonth < 1 || !validDate(end) || ![3, 6, 9, 12].includes(anchor.month)
    || anchor.day !== new Date(Date.UTC(anchor.year, anchor.month, 0)).getUTCDate()) return fail("Unsupported fiscal window");
  const age = (Date.parse(input.publishedAt) - Date.parse(end)) / 864e5;
  if (age < 0 || age > 180) return fail("Publication does not follow report period");
  const pick = (field: "revenue" | "netIncome") => {
    const values = selected.filter(h => h.field === field);
    return values.length && values.every(h => h.current === values[0].current && h.prior === values[0].prior) ? values[0] : null;
  };
  const revenue = pick("revenue"), income = pick("netIncome");
  if (!revenue || !income || revenue.current < 0 || revenue.prior < 0) return fail("Missing or conflicting comparable income facts");
  const fiscalYearStart = ticker === "PDD" ? iso(anchor.year, 1) : iso(anchor.year - (anchor.month <= 3 ? 1 : 0), 4);
  const start = iso(anchor.year, startMonth);
  if ((ticker === "PDD" && start !== fiscalYearStart && months !== 3) || (ticker === "BABA" && months !== 3)) return fail("Unsupported fiscal duration");
  return { status: "supported", evidence: {
    ticker, currency: "CNY", accountingBasis: "US-GAAP", comparisonBasis: start === fiscalYearStart ? "ytd" : "quarter", fiscalYearStart,
    current: { start, end, revenue: revenue.current, netIncome: income.current },
    prior: { start: iso(anchor.year - 1, startMonth), end: iso(anchor.year - 1, anchor.month, anchor.day), revenue: revenue.prior, netIncome: income.prior },
    source: { accessionNumber: input.accessionNumber, exhibitUrl: input.exhibitUrl, publishedAt: input.publishedAt, parserVersion: INTERIM_PARSER_VERSION },
  } };
}
