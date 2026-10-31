import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUsdComparables } from "./usdComparables";
const cases = [
  { ticker: "NICE", cik: "1003935", acc: "0001178913-26-003846", doc: "exhibit_99-1.htm", revenue: [1550910e3, 1426904e3], income: [130041e3,316694e3] },
  { ticker: "INMD", cik: "1742692", acc: "0001178913-26-003831", doc: "exhibit_99-1.htm", revenue: [177606e3,173476e3], income: [28626e3,44943e3] },
  { ticker: "TSEM", cik: "928876", acc: "0001178913-26-004158", doc: "exhibit_99-1.htm", revenue: [873710e3,730231e3], income: [158184e3,85309e3] },
];
for(const c of cases) {
  const html = readFileSync(new URL(`./fixtures/${c.ticker.toLowerCase()}-usd.html`,import.meta.url),"utf8");
  const input = { ticker:c.ticker,html,accessionNumber:c.acc,exhibitUrl:`https://www.sec.gov/Archives/edgar/data/${c.cik}/${c.acc.replaceAll("-","")}/${c.doc}`,publishedAt:"2026-08-15" };
  const result = parseUsdComparables(input);
  assert.equal(result.status,"supported",`${c.ticker}: ${JSON.stringify(result)}`);
  if(result.status !== "supported") continue;
  assert.deepEqual([result.evidence.current.revenue,result.evidence.prior.revenue],c.revenue);
  assert.deepEqual([result.evidence.current.netIncome,result.evidence.prior.netIncome],c.income);
  assert.equal(result.evidence.current.start,"2026-01-01");
  assert.equal(result.evidence.current.end,"2026-06-30");
  assert.equal(parseUsdComparables({...input,html:html.replaceAll("dollars","euros")}).status,"unsupported");
  assert.equal(parseUsdComparables({...input,html:html.replaceAll("2025","2024")}).status,"unsupported");
}
console.log("USD comparable parser checks passed");

// All 29 inspected official source layouts, including five explicit unsupported formats.
const sourceCases = JSON.parse(readFileSync(new URL("./fixtures/usd-source-cases.json",import.meta.url),"utf8")) as {
  ticker:string;accessionNumber:string;exhibitUrl:string;publishedAt:string;periodEnd:string;status:string;
}[];
for(const c of sourceCases) {
  const html=readFileSync(new URL(`./fixtures/usd-${c.ticker.toLowerCase()}.html`,import.meta.url),"utf8");
  const result=parseUsdComparables({...c,html});
  assert.equal(result.status,c.status,`${c.ticker}: ${JSON.stringify(result)}`);
  if(result.status!=="supported")continue;
  assert.equal(result.evidence.current.end,c.periodEnd,`${c.ticker} source period`);
  assert.equal(result.evidence.source.exhibitUrl,c.exhibitUrl);
  assert.equal(parseUsdComparables({...c,html,exhibitUrl:c.exhibitUrl.replace("www.sec.gov","example.com")}).status,"unsupported");
  assert.equal(parseUsdComparables({...c,html:html.replaceAll("2025","2024")}).status,"unsupported",`${c.ticker} incomparable year`);
  assert.equal(parseUsdComparables({...c,html:html.replace(/consolidated/gi,"NON-GAAP CONSOLIDATED")}).status,"unsupported",`${c.ticker} non-GAAP heading`);
  assert.equal(parseUsdComparables({...c,html:html+"<p>These financial statements are prepared in accordance with IFRS.</p>"}).status,"unsupported",`${c.ticker} contradictory accounting basis`);
  const boundEuro = '<xbrli:unit id="euro"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>' + html.replace(/<td>([0-9][0-9,.]+)<\/td>/g, '<td><ix:nonFraction unitRef="euro">$1</ix:nonFraction></td>');
  assert.equal(parseUsdComparables({...c,html:boundEuro}).status,"unsupported",`${c.ticker} contradictory bound monetary unit`);
  const foreign=result.evidence.currency===null?html.replaceAll("2025","2025 CAD"):html.replace(/(?:U\.?S\.?|United States) dollars?|US\$|USD/gi,"euros");
  assert.equal(parseUsdComparables({...c,html:foreign}).status,"unsupported",`${c.ticker} currency ambiguity`);
}
console.log("USD official-source matrix passed (29 layouts)");

const mrt=sourceCases.find(c=>c.ticker==="MRT")!;
const mrtHtml=readFileSync(new URL("./fixtures/usd-mrt.html",import.meta.url),"utf8");
const lossRow=mrtHtml.match(/<tr><td>Net loss<\/td>[\s\S]*?<\/tr>/)![0];
assert.equal(parseUsdComparables({...mrt,html:mrtHtml.replace(lossRow,lossRow+lossRow.replace("19,928,085","19,928,086"))}).status,"unsupported","conflicting consolidated loss rows cannot bypass ambiguity guard");

// A later same-day full interim source supplies the currency declaration omitted by the earnings release.
const brslFullHtml=readFileSync(new URL("./fixtures/brsl-full-2026-h1.html",import.meta.url),"utf8");
const brslFullInput={ticker:"BRSL",html:brslFullHtml,accessionNumber:"0001628280-26-052565",exhibitUrl:"https://www.sec.gov/Archives/edgar/data/1619762/000162828026052565/brightstar-6302026xform6k.htm",publishedAt:"2026-08-04"};
const brslFull=parseUsdComparables(brslFullInput);
assert.equal(brslFull.status,"supported",JSON.stringify(brslFull));
if(brslFull.status==="supported") {
  assert.deepEqual([brslFull.evidence.current.revenue,brslFull.evidence.prior.revenue],[1171e6,1214e6]);
  assert.deepEqual([brslFull.evidence.current.netIncome,brslFull.evidence.prior.netIncome],[119e6,40e6]);
}
assert.equal(parseUsdComparables({...brslFullInput,html:brslFullHtml.replaceAll("United States (“U.S.”) dollars","euros")}).status,"unsupported");
const mgaFullHtml=readFileSync(new URL("./fixtures/mga-full-2026-q3.html",import.meta.url),"utf8");
const mgaFullInput={ticker:"MGA",html:mgaFullHtml,accessionNumber:"0001104659-26-120352",exhibitUrl:"https://www.sec.gov/Archives/edgar/data/749098/000110465926120352/tm2628312d1_ex99-2.htm",publishedAt:"2026-10-30"};
const mgaFull=parseUsdComparables(mgaFullInput);
assert.equal(mgaFull.status,"supported",JSON.stringify(mgaFull));
if(mgaFull.status==="supported") {
  assert.deepEqual([mgaFull.evidence.current.revenue,mgaFull.evidence.prior.revenue],[31420e6,31162e6]);
  assert.deepEqual([mgaFull.evidence.current.netIncome,mgaFull.evidence.prior.netIncome],[878e6,880e6]);
}
assert.equal(parseUsdComparables({...mgaFullInput,html:mgaFullHtml.replaceAll("Net income","Net income attributable to Magna")}).status,"unsupported");
const mgaHistoryHtml=readFileSync(new URL("./fixtures/mga-quarter-history-2026-q3.html",import.meta.url),"utf8");
const mgaHistoryInput={...mgaFullInput,html:mgaHistoryHtml,accessionNumber:"0001104659-26-120638",exhibitUrl:"https://www.sec.gov/Archives/edgar/data/749098/000110465926120638/tm2628312d2_ex99-1.htm"};
const mgaHistory=parseUsdComparables(mgaHistoryInput);
assert.equal(mgaHistory.status,"supported",JSON.stringify(mgaHistory));
if(mgaHistory.status==="supported") {
  assert.deepEqual([mgaHistory.evidence.current.revenue,mgaHistory.evidence.prior.revenue],[31420e6,31162e6]);
  assert.deepEqual([mgaHistory.evidence.current.netIncome,mgaHistory.evidence.prior.netIncome],[878e6,880e6]);
  assert.equal(mgaHistory.evidence.prior.netIncome===883e6,false,"prior FY annual must not substitute nine-month sum");
}
assert.equal(parseUsdComparables({...mgaHistoryInput,html:mgaHistoryHtml.replace("31,420","31,421")}).status,"unsupported");
for(const [ticker,revenue,income] of [
  ["CHKP",[1342e6,1303e6],[385.4e6,393.7e6]],
  ["WIX",[1104229e3,963581e3],[-133825e3,91469e3]],
] as const) {
  const c=sourceCases.find(c=>c.ticker===ticker)!;
  const html=readFileSync(new URL(`./fixtures/usd-${ticker.toLowerCase()}.html`,import.meta.url),"utf8");
  const r=parseUsdComparables({...c,html});
  assert.equal(r.status,"supported",JSON.stringify(r));
  if(r.status==="supported") {
    assert.equal(r.evidence.currency,null);
    assert.equal(r.evidence.presentationUnit,"$");
    assert.equal(r.evidence.sharedUnitVerified,true);
    assert.deepEqual([r.evidence.current.revenue,r.evidence.prior.revenue],revenue);
    assert.deepEqual([r.evidence.current.netIncome,r.evidence.prior.netIncome],income);
  }
  assert.equal(parseUsdComparables({...c,html:html.replaceAll("2025","2025 CAD")}).status,"unsupported");
}
const glbeCase=sourceCases.find(c=>c.ticker==="GLBE")!;
const glbeHtml=readFileSync(new URL("./fixtures/usd-glbe.html",import.meta.url),"utf8");
const glbe=parseUsdComparables({...glbeCase,html:glbeHtml});
assert.equal(glbe.status,"supported",JSON.stringify(glbe));
if(glbe.status==="supported") {
  assert.equal(glbe.evidence.currency,null);
  assert.deepEqual([glbe.evidence.current.netIncome,glbe.evidence.prior.netIncome],[78078e3,-7365e3]);
}
assert.equal(parseUsdComparables({...glbeCase,html:glbeHtml.replaceAll('Net profit (loss)</td>','Net profit (loss) attributable to ordinary shareholders</td>')}).status,"unsupported");
const cashHeading=glbeHtml.indexOf('CONSOLIDATED STATEMENTS OF CASH FLOWS');
const mismatchedCash=glbeHtml.slice(0,cashHeading)+glbeHtml.slice(cashHeading).replaceAll('2025','2024');
assert.equal(parseUsdComparables({...glbeCase,html:mismatchedCash}).status,"unsupported");

const mgaHistoryEuro = '<xbrli:unit id="euro"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>' + mgaHistoryHtml.replace(/<td>([0-9][0-9,.]+)<\/td>/g, '<td><ix:nonFraction unitRef="euro">$1</ix:nonFraction></td>');
assert.equal(parseUsdComparables({...mgaHistoryInput,html:mgaHistoryEuro}).status,"unsupported","MGA history must reject conflicting bound currency");
const wixCase=sourceCases.find(c=>c.ticker==="WIX")!;
const wixHtml=readFileSync(new URL("./fixtures/usd-wix.html",import.meta.url),"utf8");
const wixComponentEnd=wixHtml.indexOf('</tr>',wixHtml.indexOf('Business Solutions</td>'))+5;
const wixAmbiguous=wixHtml.slice(0,wixComponentEnd)+'<tr><td>999</td><td>999</td><td>999</td><td>999</td></tr>'+wixHtml.slice(wixComponentEnd);
assert.equal(parseUsdComparables({...wixCase,html:wixAmbiguous}).status,"unsupported","WIX revenue subtotal must be unique and reconcile components");
assert.equal(parseUsdComparables({...wixCase,html:wixHtml.replace('398,350','398,351')}).status,"unsupported","WIX total must equal both revenue components");
const wixCreative=wixHtml.match(/<tr><td>Creative Subscriptions<\/td>[\s\S]*?<\/tr>/)![0];
assert.equal(parseUsdComparables({...wixCase,html:wixHtml.replace(wixCreative,wixCreative+wixCreative)}).status,"unsupported","WIX component must be unique inside revenue section");
const glbeCashStart=glbeHtml.indexOf('<table',glbeHtml.indexOf('CONSOLIDATED STATEMENTS OF CASH FLOWS'));
const glbeCashRaw=glbeHtml.slice(glbeCashStart,glbeHtml.indexOf('</table>',glbeCashStart)+8);
const glbeCashCaption='<p>Global-E Online Ltd. CONSOLIDATED STATEMENTS OF CASH FLOWS (In thousands)</p>';
assert.equal(parseUsdComparables({...glbeCase,html:glbeHtml+glbeCashCaption+glbeCashRaw.replaceAll('78,078','79,078')}).status,"unsupported","conflicting same-period consolidated cash-flow NI cannot silently win");
assert.equal(parseUsdComparables({...glbeCase,html:glbeHtml+glbeCashCaption+glbeCashRaw}).status,"supported","identical same-period cash-flow duplicates are harmless");
