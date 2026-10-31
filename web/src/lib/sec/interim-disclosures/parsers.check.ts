import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseInterimDisclosure } from "./parsers";

// Catches selecting convenience USD, quarter instead of YTD, or adjusted NI.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}-2026-q2.html`, import.meta.url), "utf8");
const pdd = fixture("pdd");
const source = { ticker: "PDD", html: pdd, accessionNumber: "0001104659-26-100534", exhibitUrl: "https://www.sec.gov/Archives/edgar/data/1737806/000110465926100534/tm2623874d1_ex99-1.htm", publishedAt: "2026-08-24" };
const result = parseInterimDisclosure(source);
assert.equal(result.status, "supported");
assert.equal(result.evidence.currency, "CNY");
assert.equal(result.evidence.comparisonBasis, "ytd");
assert.deepEqual(result.evidence.current, { start: "2026-01-01", end: "2026-06-30", revenue: 218587e6, netIncome: 39729e6 });
assert.deepEqual(result.evidence.prior, { start: "2025-01-01", end: "2025-06-30", revenue: 199657e6, netIncome: 45496e6 });
assert.equal(result.evidence.fiscalYearStart, "2026-01-01");
assert.equal(result.evidence.source.exhibitUrl, source.exhibitUrl);
const baba = parseInterimDisclosure({ ...source, ticker: "BABA", html: fixture("baba"), accessionNumber: "0001104659-26-099220", exhibitUrl: "https://www.sec.gov/Archives/edgar/data/1577552/000110465926099220/tm2623667d1_ex99-1.htm", publishedAt: "2026-08-20" });
assert.equal(baba.status, "supported");
if (baba.status === "supported") {
  assert.deepEqual(baba.evidence.current, { start: "2026-04-01", end: "2026-06-30", revenue: 268953e6, netIncome: 10444e6 });
  assert.deepEqual(baba.evidence.prior, { start: "2025-04-01", end: "2025-06-30", revenue: 247652e6, netIncome: 42382e6 });
}
// Catches silently interpreting a changed table shape/currency as the old one.
for (const html of [pdd.replaceAll("US$", "EUR"), pdd.replace("218,587", "218,587</td><td>999"), pdd.replaceAll("2025", "2024"), pdd.replaceAll("Net income", "Non-GAAP net income")]) {
  assert.equal(parseInterimDisclosure({ ...source, html }).status, "unsupported");
}
assert.equal(parseInterimDisclosure({ ...source, ticker: "UNKNOWN" }).status, "unsupported");
assert.equal(parseInterimDisclosure({ ...source, html: "<h1>PDD announces passing of a director</h1>" }).status, "no_evidence");
assert.equal(parseInterimDisclosure({ ...source, publishedAt: "2026-05-01" }).status, "unsupported");
assert.equal(parseInterimDisclosure({ ...source, exhibitUrl: source.exhibitUrl.replace("1737806", "1577552") }).status, "unsupported");
assert.equal(parseInterimDisclosure({ ...source, html: pdd.replaceAll("millions", "thousands") }).status, "unsupported");
assert.equal(parseInterimDisclosure({ ...source, html: pdd.replaceAll("39,729", "(39,729</td><td>)") }).status, "supported");
// Changing a duplicated NI value must produce an explicit conflict, not first-wins.
assert.equal(parseInterimDisclosure({ ...source, html: pdd.replace("39,729", "39,730") }).status, "unsupported");
console.log("interim disclosure parser checks passed");

for(const html of [pdd.replaceAll("CONDENSED CONSOLIDATED STATEMENTS OF INCOME","NON-GAAP CONDENSED CONSOLIDATED STATEMENTS OF INCOME"),pdd+"<p>Statements prepared in accordance with IFRS.</p>",pdd.replace(/three months ended/gi,"TEMPWINDOW").replace(/six months ended/gi,"Three Months Ended").replaceAll("TEMPWINDOW","Six Months Ended")]) assert.notEqual(parseInterimDisclosure({...source,html}).status,"supported","reject adjusted/basis-conflicting/reordered statement headers");
