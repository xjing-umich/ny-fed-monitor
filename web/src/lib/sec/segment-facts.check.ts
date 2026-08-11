/**
 * segment-facts.check.ts — 件⑤ Task 3 断言(纯 fixture,无网络)。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/segment-facts.check.ts
 */
import { extractInstanceFacts } from "./instance-facts";
import { extractSegmentYears, classifySegment } from "./segment-facts";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}
const near = (a: number | null, b: number, tol = 0.005) =>
  a != null && Math.abs(a - b) / Math.abs(b) <= tol;

const PRETAX = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";

// BRK FY2025 真实分部数字(spec §1.2)。
function seg(id: string, members: string[], start: string, end: string) {
  const dims = members.map((m) => {
    const [axis, member] = m.split("|");
    return `<explicitMember xmlns:xbrldi="http://xbrl.org/2006/xbrldi" dimension="us-gaap:${axis}">${member}</explicitMember>`;
  }).join("");
  return `<context id="${id}">
    <entity><identifier>x</identifier><segment>${dims}</segment></entity>
    <period><startDate>${start}</startDate><endDate>${end}</endDate></period>
  </context>`;
}
const OPSEG = "ConsolidationItemsAxis|us-gaap:OperatingSegmentsMember";
const INSGRP = "StatementBusinessSegmentsAxis|brka:BerkshireHathawayInsuranceGroupMember";
const UW = "ProductOrServiceAxis|brka:UnderwritingMember";
const INV = "ProductOrServiceAxis|brka:InvestmentsSegmentMember";
const MFG = "StatementBusinessSegmentsAxis|brka:ManufacturingBusinessesMember";
const GEICO = "SubsegmentsAxis|brka:GeicoMember";

const XML = `<?xml version="1.0"?>
<xbrl xmlns:us-gaap="http://fasb.org/us-gaap/2025">
  <unit id="U"><measure>iso4217:USD</measure></unit>
  ${seg("C_TOT", [OPSEG], "2025-01-01", "2025-12-31")}
  ${seg("C_INS", [OPSEG, INSGRP], "2025-01-01", "2025-12-31")}
  ${seg("C_UW", [OPSEG, UW, INSGRP], "2025-01-01", "2025-12-31")}
  ${seg("C_INV", [OPSEG, INV, INSGRP], "2025-01-01", "2025-12-31")}
  ${seg("C_MFG", [OPSEG, MFG], "2025-01-01", "2025-12-31")}
  ${seg("C_TOT24", [OPSEG], "2024-01-01", "2024-12-31")}
  ${seg("C_INS24", [OPSEG, INSGRP], "2024-01-01", "2024-12-31")}
  ${seg("C_Q4", [OPSEG], "2025-10-01", "2025-12-31")}
  ${seg("C_GEICO", [OPSEG, UW, INSGRP, GEICO], "2025-01-01", "2025-12-31")}
  <us-gaap:${PRETAX} contextRef="C_TOT" unitRef="U">51710000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_INS" unitRef="U">24720000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_UW" unitRef="U">9460000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_INV" unitRef="U">15260000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_MFG" unitRef="U">12570000000</us-gaap:${PRETAX}>
  <!-- 子分部,值刻意设得比承保合计大:不排除 Subsegments 轴的实现会在这里取错 -->
  <us-gaap:${PRETAX} contextRef="C_GEICO" unitRef="U">99000000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_Q4" unitRef="U">9000000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_TOT24" unitRef="U">53940000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_INS24" unitRef="U">28150000000</us-gaap:${PRETAX}>
  <us-gaap:IncomeTaxExpenseBenefit contextRef="C_TOT" unitRef="U">8570000000</us-gaap:IncomeTaxExpenseBenefit>
  <us-gaap:IncomeTaxExpenseBenefit contextRef="C_INS" unitRef="U">4950000000</us-gaap:IncomeTaxExpenseBenefit>
  <us-gaap:IncomeTaxExpenseBenefit contextRef="C_TOT24" unitRef="U">8870000000</us-gaap:IncomeTaxExpenseBenefit>
  <us-gaap:IncomeTaxExpenseBenefit contextRef="C_INS24" unitRef="U">5460000000</us-gaap:IncomeTaxExpenseBenefit>
</xbrl>`;

const years = extractSegmentYears(extractInstanceFacts(XML));

console.log("① 年份");
assert(years.length === 2, "解析出 2 个 FY(季度 duration 不成年)");
const fy25 = years.find((y) => y.period_end === "2025-12-31")!;
assert(fy25 != null, "FY2025 存在");

console.log("② FY2025 各项");
assert(near(fy25.total_pretax, 51710000000), "经营分部合计税前 51.71B");
assert(near(fy25.insurance_pretax, 24720000000), "保险集团税前 24.72B");
assert(near(fy25.underwriting_pretax, 9460000000), "承保税前 9.46B");
assert(near(fy25.investments_pretax, 15260000000), "投资分部税前 15.26B");
assert(near(fy25.total_tax, 8570000000), "经营分部合计税 8.57B");
assert(near(fy25.insurance_tax, 4950000000), "保险集团税 4.95B");

console.log("③ 内部自洽");
assert(near(fy25.underwriting_pretax! + fy25.investments_pretax!, fy25.insurance_pretax!),
  "承保 + 投资 = 保险集团合计(9.46+15.26=24.72)");

console.log("④ 季度不得混入");
assert(!years.some((y) => y.total_pretax === 9000000000), "Q4 duration 未被当成 FY");

console.log("④b ★ 子分部不得顶替合计");
// GEICO 子分部与承保合计共用 ProductOrService=Underwriting 维度。fixture 里 GEICO 值刻意
// 设为 99B(> 承保合计 9.46B),不排除 Subsegments 轴的实现会在这里取到 99B。
assert(near(fy25.underwriting_pretax, 9460000000),
  "承保取合计 9.46B,不被子分部 99B 顶替(Subsegments 轴已排除)");

console.log("⑤ kind 分类");
assert(classifySegment({ ProductOrServiceAxis: "UnderwritingMember",
  StatementBusinessSegmentsAxis: "BerkshireHathawayInsuranceGroupMember" }) === "insurance_underwriting",
  "承保 → insurance_underwriting");
assert(classifySegment({ ProductOrServiceAxis: "InvestmentsSegmentMember",
  StatementBusinessSegmentsAxis: "BerkshireHathawayInsuranceGroupMember" }) === "insurance_investments",
  "投资 → insurance_investments(必须可被单独排除)");
assert(classifySegment({ StatementBusinessSegmentsAxis: "ManufacturingBusinessesMember" }) === "operating",
  "制造 → operating");
assert(classifySegment({ ConsolidationItemsAxis: "CorporateReconcilingItemsAndEliminationsMember" }) === "corporate",
  "公司间抵销 → corporate");

console.log("⑥ 分部明细");
const mfg = fy25.segments.find((s) => s.segment_member === "ManufacturingBusinessesMember");
assert(mfg?.kind === "operating" && near(mfg.pretax_income, 12570000000), "制造分部明细正确");

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
