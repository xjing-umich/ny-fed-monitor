/**
 * instance-facts.check.ts — 件⑤ Task 1 断言(纯 fixture,无网络)。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/instance-facts.check.ts
 */
import {
  extractInstanceFacts, isDimensionless, dimIs, pickFact,
} from "./instance-facts";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}

// 覆盖:USD/JPY 两种单位、时点/duration 两种 period、segment/scenario 两种维度位置、
// 带前缀与不带前缀两种命名空间写法、sign/scale 属性。
const XML = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025">
  <xbrli:unit id="U_USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <xbrli:unit id="U_JPY"><xbrli:measure>iso4217:JPY</xbrli:measure></xbrli:unit>
  <xbrli:context id="I_2025">
    <xbrli:entity><xbrli:identifier>x</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:context id="I_2025_INS">
    <xbrli:entity><xbrli:identifier>x</xbrli:identifier>
      <xbrli:segment>
        <xbrldi:explicitMember xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
          dimension="us-gaap:ProductOrServiceAxis">us-gaap:InsuranceAndOtherMember</xbrldi:explicitMember>
      </xbrli:segment>
    </xbrli:entity>
    <xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:context id="D_FY2025_SEG">
    <xbrli:entity><xbrli:identifier>x</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period>
    <xbrli:scenario>
      <xbrldi:explicitMember xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
        dimension="us-gaap:StatementBusinessSegmentsAxis">brka:BnsfMember</xbrldi:explicitMember>
    </xbrli:scenario>
  </xbrli:context>
  <xbrli:context id="D_Q4_2025">
    <xbrli:entity><xbrli:identifier>x</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>2025-10-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period>
  </xbrli:context>
  <us-gaap:USTreasuryBills contextRef="I_2025_INS" unitRef="U_USD">321430000000</us-gaap:USTreasuryBills>
  <us-gaap:Assets contextRef="I_2025" unitRef="U_USD">1222180000000</us-gaap:Assets>
  <us-gaap:DebtInstrumentFaceAmount contextRef="I_2025" unitRef="U_JPY">234300000000</us-gaap:DebtInstrumentFaceAmount>
  <us-gaap:PretaxIncome contextRef="D_FY2025_SEG" unitRef="U_USD">7170000000</us-gaap:PretaxIncome>
  <us-gaap:PretaxIncome contextRef="D_Q4_2025" unitRef="U_USD">1800000000</us-gaap:PretaxIncome>
  <us-gaap:Scaled contextRef="I_2025" unitRef="U_USD" scale="6" sign="-">5</us-gaap:Scaled>
</xbrli:xbrl>`;

const facts = extractInstanceFacts(XML);

console.log("① 币种闸");
assert(facts.every((f) => f.tag !== "DebtInstrumentFaceAmount"),
  "非 USD 单位事实被整条剔除(日元债 2,343 亿不得进入)");

console.log("② 维度提取");
const tbill = facts.find((f) => f.tag === "USTreasuryBills");
assert(tbill?.value === 321430000000, "USTreasuryBills 取值正确");
assert(dimIs(tbill!, "ProductOrService", "InsuranceAndOtherMember"),
  "segment 位置的维度被提取(entity 内)");
assert(!isDimensionless(tbill!), "带维度事实不被判为无维度");
const bnsf = facts.find((f) => f.tag === "PretaxIncome" && f.start === "2025-01-01");
assert(dimIs(bnsf!, "StatementBusinessSegments", "BnsfMember"),
  "scenario 位置的维度被提取(context 直接子节点)");

console.log("③ 无维度判定");
const assets = facts.find((f) => f.tag === "Assets");
assert(isDimensionless(assets!), "无维度事实被正确识别");

console.log("④ sign / scale");
const scaled = facts.find((f) => f.tag === "Scaled");
assert(scaled?.value === -5000000, "scale=6 且 sign=- → -5,000,000");

console.log("⑤ pickFact 选择器");
assert(pickFact(facts, { tag: "Assets", instant: "2025-12-31", dimensionless: true }) === 1222180000000,
  "按 instant + 无维度取值");
assert(pickFact(facts, { tag: "USTreasuryBills", instant: "2025-12-31",
  axisContains: "ProductOrService", member: "InsuranceAndOtherMember" }) === 321430000000,
  "按 instant + 指定维度取值");
assert(pickFact(facts, { tag: "PretaxIncome", end: "2025-12-31", fyOnly: true,
  axisContains: "StatementBusinessSegments", member: "BnsfMember" }) === 7170000000,
  "fyOnly 只认 350–380 天窗口(季度 duration 被排除)");
assert(pickFact(facts, { tag: "PretaxIncome", end: "2025-12-31", fyOnly: true, dimensionless: true }) === null,
  "无匹配 → null(不得回退到带维度的值)");

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
