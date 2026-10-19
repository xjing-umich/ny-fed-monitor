/**
 * filing-backfill 行为校验。跑法: npx tsx src/lib/sec/filing-backfill.check.ts
 * 无 IO:内嵌一份迷你 instance + 假 companyfacts,覆盖单位/维度/scale 与「只补新一期、不改历史」。
 */
import { extractGaapFacts, findMissingFilings, injectFilingFacts } from "./filing-backfill";
import type { CompanyFacts } from "./company-facts";
import type { NormalizedFiling } from "./company-submissions";
import { normalizeCompanyFacts } from "./normalize-facts";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return console.log(`  ✓ ${name}`);
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const XML = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:abt="http://abt">
  <xbrli:context id="q2"><xbrli:entity><xbrli:identifier scheme="x">1800</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:context id="q2py"><xbrli:entity><xbrli:identifier scheme="x">1800</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2025-04-01</xbrli:startDate><xbrli:endDate>2025-06-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:context id="bs"><xbrli:entity><xbrli:identifier scheme="x">1800</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context>
  <xbrli:context id="seg"><xbrli:entity><xbrli:identifier scheme="x">1800</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="us-gaap:StatementBusinessSegmentsAxis">abt:DiagnosticsMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <xbrli:unit id="eur"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>
  <xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>
  <xbrli:unit id="usdPerShare"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>
  <us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax contextRef="q2" unitRef="usd" decimals="-6">12593000000</us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>
  <us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax contextRef="q2py" unitRef="usd" decimals="-6">11142000000</us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>
  <us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax contextRef="seg" unitRef="usd" decimals="-6">2400000000</us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>
  <us-gaap:NetIncomeLoss contextRef="q2" unitRef="usd" decimals="-6" scale="6">928</us-gaap:NetIncomeLoss>
  <us-gaap:InterestExpense contextRef="q2" unitRef="usd" decimals="-6" sign="-">5</us-gaap:InterestExpense>
  <us-gaap:DebtInstrumentFaceAmount contextRef="bs" unitRef="eur" decimals="-6">500000000</us-gaap:DebtInstrumentFaceAmount>
  <us-gaap:EarningsPerShareDiluted contextRef="q2" unitRef="usdPerShare" decimals="2">0.53</us-gaap:EarningsPerShareDiluted>
  <us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding contextRef="q2" unitRef="shares" decimals="-5">1743000000</us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding>
  <us-gaap:Assets contextRef="bs" unitRef="usd" decimals="-6">109215000000</us-gaap:Assets>
  <abt:CustomRevenue contextRef="q2" unitRef="usd" decimals="-6">1</abt:CustomRevenue>
</xbrli:xbrl>`;

console.log("extractGaapFacts");
const g = extractGaapFacts(XML);
const get = (tag: string, end?: string) => g.filter((f) => f.tag === tag && (end == null || (f.end ?? f.instant) === end));
check("无维度营收被收(本期 + 去年同期两条)", get("RevenueFromContractWithCustomerExcludingAssessedTax").length === 2);
check("分部维度事实被排除", !g.some((f) => f.value === 2_400_000_000));
check("scale 生效", get("NetIncomeLoss")[0]?.value === 928_000_000);
check("sign 生效", get("InterestExpense")[0]?.value === -5);
check("非 USD 货币被排除", get("DebtInstrumentFaceAmount").length === 0);
check("每股单位识别为 USD/shares", get("EarningsPerShareDiluted")[0]?.unit === "USD/shares");
check("股数单位识别为 shares", get("WeightedAverageNumberOfDilutedSharesOutstanding")[0]?.unit === "shares");
check("时点事实取 instant", get("Assets")[0]?.instant === "2026-06-30" && get("Assets")[0]?.start == null);
check("公司自定义命名空间被排除", !g.some((f) => f.tag === "CustomRevenue"));

console.log("findMissingFilings / injectFilingFacts");
const filing = (acc: string, form: string, report: string, filed: string): NormalizedFiling => ({
  cik: "0000001800", ticker: "ABT", accession_number: acc, form, filing_date: filed, report_date: report,
  fiscal_year: null, fiscal_period: null, primary_document: "abt.htm", filing_url: "", sec_index_url: "",
} as NormalizedFiling);
const mkFacts = (): CompanyFacts => ({
  cik: 1800, entityName: "ABT",
  facts: { "us-gaap": {
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
      { start: "2025-04-01", end: "2025-06-30", val: 11_000_000_000, accn: "Q2-25", form: "10-Q", filed: "2025-07-30" },
      { start: "2026-01-01", end: "2026-03-31", val: 11_500_000_000, accn: "Q1-26", form: "10-Q", filed: "2026-04-29" },
    ] } },
  } },
});
const filings = [
  filing("Q2-25", "10-Q", "2025-06-30", "2025-07-30"),
  filing("OLD", "10-Q", "2019-06-30", "2019-07-30"),       // 远古、无 XBRL:不该被挑中
  filing("Q1-26", "10-Q", "2026-03-31", "2026-04-29"),
  filing("Q2-26", "10-Q", "2026-06-30", "2026-07-28"),     // companyfacts 漏收
  filing("8K", "8-K", "2026-07-28", "2026-07-28"),
];
const missing = findMissingFilings(mkFacts(), filings);
check("只挑出晚于 companyfacts 最新一期的漏收 10-Q", missing.length === 1 && missing[0].accession_number === "Q2-26", missing.map((m) => m.accession_number).join(","));
check("不漏收时为空", findMissingFilings(mkFacts(), filings.filter((f) => f.accession_number !== "Q2-26")).length === 0);

const facts = mkFacts();
const n = injectFilingFacts(facts, missing[0], g);
check("注入条数 = 抽取条数", n === g.length, `${n} vs ${g.length}`);
const rev = facts.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD;
check("注入条目带 accn/form/filed", rev.some((u) => u.accn === "Q2-26" && u.form === "10-Q" && u.filed === "2026-07-28" && u.end === "2026-06-30"));

// 端到端:经 normalizer 后,新一期出现;去年同期仍取最早申报的原值(11.0B),不被新申报的比较数(11.142B)覆盖。
const norm = normalizeCompanyFacts("ABT", "0000001800", facts, filings, "1231");
const q = (end: string) => norm.quarterly.find((r) => r.period_end === end);
check("归一后出现 2026-06-30 新一期", q("2026-06-30")?.revenue === 12_593_000_000, String(q("2026-06-30")?.revenue));
check("去年同期保持最早申报值(不改历史)", q("2025-06-30")?.revenue === 11_000_000_000, String(q("2025-06-30")?.revenue));

if (failed) {
  console.error(`\nfiling-backfill.check: ${failed} 项失败`);
  process.exit(1);
}
console.log("\nfiling-backfill.check OK");
