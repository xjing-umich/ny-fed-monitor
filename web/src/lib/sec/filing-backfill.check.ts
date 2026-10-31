/**
 * filing-backfill 行为校验。跑法: npx tsx src/lib/sec/filing-backfill.check.ts
 * 无 IO:内嵌一份迷你 instance + 假 companyfacts,覆盖单位/维度/scale、新一期与历史空洞的挑选,
 * 以及「比较期数不注入、同期取最早申报」两条不改历史的规则。
 */
import { extractGaapFacts, findMissingFilings, findMissingCapitalExpenditureFilings, injectFilingFacts, isOwnPeriod } from "./filing-backfill";
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
const own = g.filter((f) => (f.end ?? f.instant) === "2026-06-30").length;
check("只注入本期事实(去年同期比较数跳过)", n === own && own === g.length - 1, `${n} vs ${own}/${g.length}`);
check("isOwnPeriod 容差 ±7 天(52/53 周制)", isOwnPeriod("2026-06-28", "2026-06-30") && !isOwnPeriod("2025-06-30", "2026-06-30"));
const rev = facts.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD;
check("注入条目带 accn/form/filed", rev.some((u) => u.accn === "Q2-26" && u.form === "10-Q" && u.filed === "2026-07-28" && u.end === "2026-06-30"));

// 端到端:经 normalizer 后,新一期出现;去年同期仍取最早申报的原值(11.0B),不被新申报的比较数(11.142B)覆盖。
const norm = normalizeCompanyFacts("ABT", "0000001800", facts, filings, "1231");
const q = (end: string) => norm.quarterly.find((r) => r.period_end === end);
check("归一后出现 2026-06-30 新一期", q("2026-06-30")?.revenue === 12_593_000_000, String(q("2026-06-30")?.revenue));
check("去年同期保持最早申报值(不改历史)", q("2025-06-30")?.revenue === 11_000_000_000, String(q("2025-06-30")?.revenue));

console.log("历史空洞(最新一期之前)");
// companyfacts 已到 2026-06-30,但 2025-09-30 的 10-Q 与 2025-12-31 的 10-K 都没收(XOM / CAH / TAP 型)。
const mkHoleFacts = (): CompanyFacts => ({
  cik: 1800, entityName: "ABT",
  facts: { "us-gaap": {
    Revenues: { units: { USD: [
      { start: "2025-04-01", end: "2025-06-30", val: 10_900_000_000, accn: "Q2-25", form: "10-Q", filed: "2025-07-30" },
      { start: "2026-04-01", end: "2026-06-30", val: 12_000_000_000, accn: "Q2-26", form: "10-Q", filed: "2026-07-28" },
    ] } },
    // 2026 Q1 10-Q 带的上年末资产负债表比较数:时点事实,不能让 10-K 2025-12-31 被当成「已覆盖」
    Assets: { units: { USD: [
      { end: "2025-12-31", val: 100_000_000_000, accn: "Q1-26", form: "10-Q", filed: "2026-04-29" },
    ] } },
  } },
});
const holeFilings = [
  filing("OLD", "10-Q", "2019-06-30", "2019-07-30"),        // 超出回看窗口
  filing("Q2-25", "10-Q", "2025-06-30", "2025-07-30"),
  filing("Q3-25", "10-Q", "2025-09-30", "2025-10-29"),      // companyfacts 漏收:空洞
  filing("FY-25", "10-K", "2025-12-31", "2026-02-18"),      // companyfacts 漏收:空洞(只有时点比较数)
  filing("Q1-26", "10-Q", "2026-03-31", "2026-04-29"),      // accession 在 companyfacts 里(Assets 那条)→ 已收
  filing("Q2-26", "10-Q", "2026-06-30", "2026-07-28"),
];
const holes = findMissingFilings(mkHoleFacts(), holeFilings, 10).map((f) => f.accession_number);
check("挑出最新一期之前的空洞(10-Q 与 10-K)", holes.includes("Q3-25") && holes.includes("FY-25"), holes.join(","));
check("超出 3 年回看窗口的远古申报不挑", !holes.includes("OLD"));
check("已有核心期间事实的申报不挑", !holes.includes("Q2-25") && !holes.includes("Q2-26"));
check("同 accession 只有资产负债表时仍补核心流量", holes.includes("Q1-26"));
const coveredFacts = mkHoleFacts();
coveredFacts.facts["us-gaap"].Revenues.units.USD.push(
  // 后来申报里的去年同期比较数已覆盖 2025-09-30 → 不算空洞,不去拉
  { start: "2025-07-01", end: "2025-09-30", val: 11_200_000_000, accn: "Q3-26x", form: "10-Q", filed: "2026-10-28" },
);
check("比较数已覆盖的期不算空洞", !findMissingFilings(coveredFacts, holeFilings, 10).some((f) => f.accession_number === "Q3-25"));
const proxyFacts = mkHoleFacts();
proxyFacts.facts["us-gaap"].NetIncomeLoss = { units: { USD: [
  // DEF 14A 薪酬与业绩表的全年净利:撑不起一行基本面,不能让 10-K 空洞被当成已覆盖(AMRC / EIKN / MWH 型)
  { start: "2025-01-01", end: "2025-12-31", val: 900_000_000, accn: "PROXY", form: "DEF 14A", filed: "2026-04-10" },
] } };
check("DEF 14A 的全年数不算覆盖 10-K 空洞", findMissingFilings(proxyFacts, holeFilings, 10).some((f) => f.accession_number === "FY-25"));
const footnoteFacts = mkHoleFacts();
footnoteFacts.facts["us-gaap"].FairValueMeasurementWithUnobservableInputsReconciliationRecurringBasisLiabilitySettlements = { units: { USD: [
  // 10-Q 附注里的全年公允价值调节数:非核心概念,同样不算覆盖
  { start: "2025-01-01", end: "2025-12-31", val: 1_685_000, accn: "Q1-26", form: "10-Q", filed: "2026-04-29" },
] } };
check("10-Q 附注里的非核心全年数不算覆盖", findMissingFilings(footnoteFacts, holeFilings, 10).some((f) => f.accession_number === "FY-25"));
check("超过上限时保留最新的", findMissingFilings(mkHoleFacts(), holeFilings, 1).map((f) => f.accession_number).join() === "Q1-26");

console.log("foreign annual source backfill");
for (const form of ["20-F", "40-F"]) {
  const annual = filing(`FY-${form}`, form, "2025-12-31", "2026-03-01");
  const annualFacts: CompanyFacts = { cik: 1800, entityName: "Foreign USD", facts: { "us-gaap": {
    Assets: { units: { USD: [{ end: "2025-12-31", val: 1000, accn: annual.accession_number, form }] } },
    Revenues: { units: { USD: [{ start: "2024-01-01", end: "2024-12-31", val: 100, form, accn: "PRIOR" }] } },
  } } };
  check(`${form} 同 accession 仅有时点事实仍可回填`, findMissingFilings(annualFacts, [annual]).length === 1);
  annualFacts.facts["us-gaap"].Revenues.units.USD.push({ start: "2025-10-01", end: "2025-12-31", val: 30, form, accn: annual.accession_number });
  check(`${form} 同期单季数不能代替全年数`, findMissingFilings(annualFacts, [annual]).length === 1);
  annualFacts.facts["us-gaap"].Revenues.units.EUR = [{ start: "2025-01-01", end: "2025-12-31", val: 110, form, accn: annual.accession_number }];
  check(`${form} EUR 全年数不能声称 USD 核心已覆盖`, findMissingFilings(annualFacts, [annual]).length === 1);
  annualFacts.facts["ifrs-full"] = { Revenue: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val: 120, form }] } } };
  check(`${form} IFRS 数不能声称 us-gaap 核心已覆盖`, findMissingFilings(annualFacts, [annual]).length === 1);
  const annualXml = XML.replaceAll("2026-04-01", "2025-01-01").replaceAll("2026-06-30", "2025-12-31")
    .replaceAll("2025-04-01", "2024-01-01").replaceAll("2025-06-30", "2024-12-31");
  injectFilingFacts(annualFacts, annual, extractGaapFacts(annualXml));
  check(`${form} 注入自身 USD 全年流量后不再下载`, findMissingFilings(annualFacts, [annual]).length === 0);
  const injected = annualFacts.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD;
  check(`${form} 不注入年度比较数`, injected.length === 1 && injected[0].start === "2025-01-01" && injected[0].end === "2025-12-31");
  check(`${form} 资本开支年度源同样可选`, findMissingCapitalExpenditureFilings(annualFacts, [annual]).some(f => f.accession_number === annual.accession_number));
}
const wrongNamespace = XML.replaceAll("us-gaap:", "ifrs-full:");
check("IFRS 收入/净利不注入 us-gaap", !extractGaapFacts(wrongNamespace).some(f => ["RevenueFromContractWithCustomerExcludingAssessedTax", "NetIncomeLoss"].includes(f.tag)));
const ifrsCapital = XML.replace("</xbrli:xbrl>", '<ifrs-full:PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets contextRef="q2" unitRef="usd">123</ifrs-full:PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets></xbrli:xbrl>');
check("IFRS 命名空间不能经资本开支别名注入", !extractGaapFacts(ifrsCapital).some(f => f.tag === "PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets"));
const invalidAnnual = filing("INVALID", "20-F", "invalid-date", "2026-03-01");
check("无效自身报告期不触发回填", findMissingFilings(mkFacts(), [invalidAnnual]).length === 0);
check("无报告期不注入任何比较数", injectFilingFacts(mkFacts(), { ...invalidAnnual, report_date: null }, g) === 0);

// 端到端:补 Q3-25 空洞;它的去年同期比较数用的是优先级更高的概念,也不能顶掉历史上用 Revenues 报的原值。
const Q3_XML = XML.replaceAll("2026-04-01", "2025-07-01").replaceAll("2026-06-30", "2025-09-30")
  .replaceAll("2025-04-01", "2024-07-01").replaceAll("2025-06-30", "2024-09-30");
const holeFacts = mkHoleFacts();
holeFacts.facts["us-gaap"].Revenues.units.USD.push(
  { start: "2024-07-01", end: "2024-09-30", val: 10_100_000_000, accn: "Q3-24", form: "10-Q", filed: "2024-10-30" },
);
const q3 = holeFilings.find((f) => f.accession_number === "Q3-25")!;
injectFilingFacts(holeFacts, q3, extractGaapFacts(Q3_XML));
const holeNorm = normalizeCompanyFacts("ABT", "0000001800", holeFacts, holeFilings, "1231");
const hq = (end: string) => holeNorm.quarterly.find((r) => r.period_end === end);
check("空洞期 2025-09-30 被补出", hq("2025-09-30")?.revenue === 12_593_000_000, String(hq("2025-09-30")?.revenue));
check("空洞期 accession 指向原始申报", hq("2025-09-30")?.accession_number === "Q3-25", String(hq("2025-09-30")?.accession_number));
check("跨概念比较数不覆盖历史(2024-09-30 仍为 10.1B)", hq("2024-09-30")?.revenue === 10_100_000_000, String(hq("2024-09-30")?.revenue));
check("既有期不受影响(2026-06-30 仍为 12.0B)", hq("2026-06-30")?.revenue === 12_000_000_000, String(hq("2026-06-30")?.revenue));

if (failed) {
  console.error(`\nfiling-backfill.check: ${failed} 项失败`);
  process.exit(1);
}
console.log("\nfiling-backfill.check OK");
