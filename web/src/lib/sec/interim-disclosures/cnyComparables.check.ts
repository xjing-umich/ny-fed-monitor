import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCnyComparables } from "./cnyComparables";
import type { InterimDisclosureInput } from "./types";

const sources = JSON.parse(readFileSync(new URL("./fixtures/cny/sources.json", import.meta.url), "utf8")) as (Omit<InterimDisclosureInput, "html"> & { fixture: string })[];
// Hand-checked consolidated GAAP statement rows, in native CNY units.
const expected: Record<string, [number, number, number, number]> = {
  NTES: [60697827e3, 18012164e3, 56720209e3, 19635236e3],
  JD: [662095e6, 14517e6, 657742e6, 17988e6],
  TCOM: [31871e6, 80e6, 28673e6, 9194e6],
  HTHT: [13117e6, 2400e6, 11821e6, 2458e6],
  FINV: [6613231e3, 847827e3, 7058992e3, 1488954e3],
  ATAT: [6301588e3, 1011411e3, 4374363e3, 668428e3],
  QFIN: [7475889e3, 1281178e3, 9906592e3, 3527079e3],
  BEKE: [43431447e3, 3878955e3, 49338983e3, 2161967e3],
  NOAH: [1245650e3, 360078e3, 1244095e3, 328356e3],
};
for (const source of sources) {
  const html = readFileSync(new URL(`./fixtures/cny/${source.fixture}`, import.meta.url), "utf8");
  const input = { ...source, html };
  const result = parseCnyComparables(input);
  assert.equal(result.status, "supported", `${source.ticker}: ${result.status === "supported" ? "" : result.reason}`);
  if (result.status !== "supported") continue;
  const [revenue, netIncome, oldRevenue, oldIncome] = expected[source.ticker];
  assert.deepEqual(result.evidence.current, { start: "2026-01-01", end: "2026-06-30", revenue, netIncome });
  assert.deepEqual(result.evidence.prior, { start: "2025-01-01", end: "2025-06-30", revenue: oldRevenue, netIncome: oldIncome });
  assert.equal(result.evidence.currency, "CNY");
  assert.equal(result.evidence.fiscalYearStart, "2026-01-01");
  assert.equal(result.evidence.comparisonBasis, "ytd");
  assert.equal(result.evidence.accountingBasis, source.ticker === "BEKE" ? "GAAP-unspecified" : "US-GAAP");
  assert.equal(result.evidence.source.publishedAt, source.publishedAt, "source availability is the supplied SEC filing date");
  assert.equal(result.evidence.source.exhibitUrl, source.exhibitUrl);
  for (const changed of [
    { ...input, exhibitUrl: source.exhibitUrl.replace("www.sec.gov", "example.com") },
    { ...input, accessionNumber: "0000000000-26-999999" },
    { ...input, exhibitUrl: source.exhibitUrl.replace("www.sec.gov", "www.sec.gov:8080") },
    { ...input, publishedAt: "2026-05-31" },
    { ...input, html: html.replaceAll("2025", "2024") },
    { ...input, html: html.replace(/six months ended/gi, "Five Months Ended") },
    ...( /three months ended/i.test(html) ? [{...input,html:html.replace(/three months ended/gi,"TEMPWINDOW").replace(/six months ended/gi,"Three Months Ended").replaceAll("TEMPWINDOW","Six Months Ended")}] : []),
    { ...input,html:html.replace(/((?:UNAUDITED )?(?:INTERIM )?(?:CONDENSED )?CONSOLIDATED STATEMENTS? OF)/gi,"NON-GAAP $1")},
    { ...input,html:html+"<p>Financial statements prepared in accordance with IFRS.</p>"},
  ]) assert.notEqual(parseCnyComparables(changed).status, "supported", `${source.ticker}: reject changed provenance/year/window`);
}
const atat = sources.find(s => s.ticker === "ATAT")!;
const atatHtml = readFileSync(new URL(`./fixtures/cny/${atat.fixture}`, import.meta.url), "utf8");
for (const html of [
  atatHtml.replaceAll("Net income", "Non-GAAP net income"),
  atatHtml.replaceAll("Net income", "Net income attributable to ordinary shareholders"),
  atatHtml.replaceAll("RMB", "EUR"),
  atatHtml.replace("6,301,588", "6,301,588</td><td>999"),
  atatHtml.replace("1,011,411", "1,011,412"),
]) assert.notEqual(parseCnyComparables({ ...atat, html }).status, "supported", "no adjusted/attributable/currency/width/conflict substitution");
assert.equal(parseCnyComparables({ ...atat, html: "<p>Director resignation</p>" }).status, "no_evidence");
assert.equal(parseCnyComparables({ ...atat, ticker: "UNKNOWN", html: atatHtml }).status, "unsupported");
const beke = sources.find(s => s.ticker === "BEKE")!;
const bekeHtml = readFileSync(new URL(`./fixtures/cny/${beke.fixture}`, import.meta.url), "utf8");
assert.notEqual(parseCnyComparables({ ...beke, html: `${bekeHtml}<p>These financial statements are prepared under IFRS.</p>` }).status, "supported");
const tcom = sources.find(s => s.ticker === "TCOM")!;
const tcomHtml = readFileSync(new URL(`./fixtures/cny/${tcom.fixture}`, import.meta.url), "utf8");
for (const [replacement, expectedIncome] of [["(80)", -80e6], ["0", 0]] as const) {
  const html = tcomHtml.replace(/(<td>\s*)80(\s*<\/td>)/i, `$1${replacement}$2`);
  assert.notEqual(html, tcomHtml, "test changes the actual consolidated native YTD income cell");
  const result = parseCnyComparables({ ...tcom, html });
  assert.equal(result.status, "supported", "reported losses/zero remain real financial evidence");
  if (result.status === "supported") assert.equal(result.evidence.current.netIncome, expectedIncome);
}
console.log("CNY native consolidated comparables checks passed (9 official source profiles)");

for(const suffix of ["<h2>Reconciliation between U.S. GAAP and IFRS Accounting Standards</h2>","<p>IFRS means International Financial Reporting Standards.</p>"])assert.equal(parseCnyComparables({...atat,html:atatHtml+suffix}).status,"supported","an unrelated accounting appendix/glossary does not change selected GAAP income basis");
