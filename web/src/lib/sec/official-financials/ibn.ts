import { htmlText, financialNumbers } from "../interim-disclosures/html";
import type { AnnualSourcePeriod } from "./types";

type Table = { index: number; caption: string; rows: string[][] };
function tables(html: string): Table[] {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match,index) => ({
    index, caption: htmlText(html.slice(Math.max(0,match.index!-2500),match.index)),
    rows: [...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
      [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => htmlText(cell[1])).filter(Boolean)).filter(row => row.length>0),
  }));
}
const fail = (reason: string): never => { throw new Error(`IBN primary annual statements: ${reason}`); };

/** Primary Indian-GAAP INR statements only. Reconciliations, segments and USD columns are not inputs. */
export function parseIbnAnnual(html: string, reportEnd: string): AnnualSourcePeriod[] {
  const intro = htmlText(html.slice(0,120000));
  const year = Number(reportEnd.slice(0,4));
  if (!/^\d{4}-03-31$/.test(reportEnd) || !intro.includes("ICICI BANK LIMITED")
    || !new RegExp(`fiscal year ended March 31, ${year}`,"i").test(intro) || !intro.includes("Indian GAAP")) fail("issuer, fiscal year or accounting basis unavailable");
  const all = tables(html);
  const primary = (heading: string, columns: number, continued = false): Table => {
    const title = `ICICI Bank Limited and subsidiaries ${heading}`;
    const hits = all.filter(table => table.caption.endsWith(title)
      || (continued && table.caption.endsWith(`${title} (Rs. in thousands)`)));
    if (hits.length !== 1) fail(`missing or ambiguous ${heading}`);
    const table = hits[0];
    const header = table.rows.slice(0,4).flat().join(" ");
    const dates = [...header.matchAll(/March 31, (\d{4})/g)].map(x => Number(x[1]));
    if (dates.length !== columns || dates.some((value,index) => value !== year-index)) fail(`unexpected year columns: ${heading}`);
    if (!/\(Rs\. in thousands(?:, except per share data)?\)/.test(header+" "+table.caption.slice(-80))) fail(`unverified INR scale: ${heading}`);
    return table;
  };
  const balance = primary("Consolidated Balance Sheet",2);
  const income = primary("Consolidated Profit and Loss Account",3);
  const cashflow = primary("Consolidated Cash Flow Statement",3);
  const cashEnd = primary("Consolidated Cash Flow Statement (Continued)",3,true);
  const periods: AnnualSourcePeriod[] = [0,1].map(index => ({
    period_start: `${year-index-1}-04-01`, period_end: `${year-index}-03-31`, fiscal_period: "FY", is_comparative: index!==0,
    metrics: {}, raw_facts: {},
  }));
  const read = (table: Table, metric: string, label: string, columns: number, skip = 0, scale = 1000) => {
    const matches = table.rows.map((row,index) => ({row,index})).filter(({row}) => row[0] === label);
    if (matches.length !== 1) fail(`missing or ambiguous ${label}`);
    const {row,index} = matches[0];
    const cells = row.slice(1+skip);
    const values = financialNumbers(cells);
    if (!values || values.length !== columns) fail(`invalid numeric columns: ${label}`);
    for (const [i,period] of periods.entries()) {
      const value = values![i]*scale;
      if (!Number.isFinite(value)) fail(`non-finite ${label}`);
      period.metrics[metric] = value;
      period.raw_facts[metric] = { value, unit: scale===1 ? "INR/shares" : "INR", raw_value: cells.join(" | "), scale,
        source_label: label, source_locator: `table:${table.index}/nonempty-row:${index}/period:${period.period_end}` };
    }
  };
  read(balance,"total_assets","TOTAL ASSETS",2);
  read(income,"total_income","TOTAL INCOME",3);
  read(income,"interest_income","Interest earned",3,1);
  read(income,"other_income","Other income",3,1);
  read(income,"interest_expense","Interest expended",3,1);
  read(income,"profit_loss","Net profit for the year before deducting minority interest",3);
  read(income,"profit_loss_attributable_to_owners","Consolidated profit/(loss) for the year attributable to the Group",3);
  read(income,"basic_eps","Basic (Rs.)",3,0,1);
  read(income,"diluted_eps","Diluted (Rs.)",3,0,1);
  read(cashflow,"operating_cash_flow","Net cash flow from/(used in) operating activities ((i)+(ii)+(iii))",3,1);
  read(cashflow,"fixed_asset_purchase_cash_flow","Purchase of fixed assets",3);
  read(cashEnd,"cash_and_equivalents","Cash and cash equivalents at end of the year",3);
  return periods;
}
