/**
 * class-shares-fallback.check.ts — 分股类经济股数推导断言（纯 fixture,无网络）。
 * 场景:V 形态(默认命名空间+摊薄as-converted)/BRK 形态(xbrli:前缀+basic equivalent)/
 * 超差拒绝/B1B2 成员排除/负净利跳过。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/class-shares-fallback.check.ts
 */
import { extractClassShareFacts, deriveEconomicShares, listedClassToken } from "./class-shares-fallback";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.error(`  ✗ ${msg}`); }
}

// ── fixture 1:V 形态(默认命名空间;Class A 摊薄股数即 as-converted 经济总量) ──
const V_XML = `<?xml version="1.0" encoding="utf-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:v="http://visa/20250930">
  <context id="cA"><entity><identifier scheme="s">0001403161</identifier><segment>
    <xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">us-gaap:CommonClassAMember</xbrldi:explicitMember>
  </segment></entity><period><startDate>2024-10-01</startDate><endDate>2025-09-30</endDate></period></context>
  <context id="cB1"><entity><identifier scheme="s">0001403161</identifier><segment>
    <xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">v:CommonClassB1Member</xbrldi:explicitMember>
  </segment></entity><period><startDate>2024-10-01</startDate><endDate>2025-09-30</endDate></period></context>
  <us-gaap:EarningsPerShareDiluted contextRef="cA" unitRef="u" decimals="2">10.20</us-gaap:EarningsPerShareDiluted>
  <us-gaap:EarningsPerShareDiluted contextRef="cB1" unitRef="u" decimals="2">15.95</us-gaap:EarningsPerShareDiluted>
  <us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding contextRef="cA" unitRef="sh" decimals="-6">1966000000</us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding>
</xbrl>`;

console.log("fixture 1: V 形态");
const vFacts = extractClassShareFacts(V_XML);
assert(vFacts.some((f) => f.tag === "EarningsPerShareDiluted" && f.member === "CommonClassAMember" && f.value === 10.2), "提取到 Class A 摊薄 EPS(默认命名空间)");
assert(vFacts.some((f) => f.member === "CommonClassB1Member"), "提取到 B1 成员事实");
const vDerived = deriveEconomicShares(vFacts, listedClassToken("V"), [{ period_end: "2025-09-30", net_income: 20_058_000_000 }]);
assert(vDerived.length === 1, "V FY2025 推导出 1 行");
assert(Math.abs(vDerived[0].shares - 20_058_000_000 / 10.2) < 1, "经济股数=净利÷EPS_A(路线B定值)");
assert(vDerived[0].cross_check_pct < 0.01, "双路互证偏差 <1%");

// ── fixture 2:BRK 形态(xbrli: 前缀;仅 basic;EquivalentClassBMember) ──
const BRK_XML = `<?xml version="1.0" encoding="utf-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:brka="http://brk/20251231">
  <xbrli:context id="cEqB"><xbrli:entity><xbrli:identifier scheme="s">0001067983</xbrli:identifier><xbrli:segment>
    <xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">brka:EquivalentClassBMember</xbrldi:explicitMember>
  </xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>
  <us-gaap:EarningsPerShareBasic contextRef="cEqB" unitRef="u" decimals="2">31.04</us-gaap:EarningsPerShareBasic>
  <us-gaap:WeightedAverageNumberOfSharesOutstandingBasic contextRef="cEqB" unitRef="sh" decimals="0">2157335139</us-gaap:WeightedAverageNumberOfSharesOutstandingBasic>
</xbrli:xbrl>`;

console.log("fixture 2: BRK 形态");
const brkFacts = extractClassShareFacts(BRK_XML);
assert(brkFacts.length === 2, "xbrli: 前缀命名空间可解析");
const brkDerived = deriveEconomicShares(brkFacts, listedClassToken("BRK.B"), [{ period_end: "2025-12-31", net_income: 66_968_000_000 }]);
assert(brkDerived.length === 1 && Math.abs(brkDerived[0].shares - 66_968_000_000 / 31.04) < 1, "BRK.B basic/basic 配对推导成功(1500 换算内生)");

// ── fixture 3:超差拒绝(股数 tag 与净利÷EPS 偏差 >10% → 不补) ──
console.log("fixture 3: 超差拒绝");
const badFacts: typeof vFacts = [
  { tag: "EarningsPerShareDiluted", member: "CommonClassAMember", start: "2024-10-01", end: "2025-09-30", value: 10.2 },
  { tag: "WeightedAverageNumberOfDilutedSharesOutstanding", member: "CommonClassAMember", start: "2024-10-01", end: "2025-09-30", value: 1_714_000_000 },
];
assert(deriveEconomicShares(badFacts, "ClassA", [{ period_end: "2025-09-30", net_income: 20_058_000_000 }]).length === 0, "偏差约 12.8% 被 10% 闸拒绝(宁缺毋假)");

// ── fixture 4:token 匹配纪律 ──
console.log("fixture 4: token 匹配");
assert(listedClassToken("BRK.B") === "ClassB" && listedClassToken("V") === "ClassA" && listedClassToken("BRK.A") === "ClassA", "后缀 .A/.B 映射,无后缀默认 ClassA");
const b2Facts: typeof vFacts = [
  { tag: "EarningsPerShareDiluted", member: "CommonClassB2Member", start: "2025-01-01", end: "2025-12-31", value: 15.7 },
  { tag: "WeightedAverageNumberOfDilutedSharesOutstanding", member: "CommonClassB2Member", start: "2025-01-01", end: "2025-12-31", value: 120_000_000 },
];
assert(deriveEconomicShares(b2Facts, "ClassB", [{ period_end: "2025-12-31", net_income: 1_884_000_000 }]).length === 0, "ClassB token 不匹配 ClassB2Member(后随数字排除)");

// ── fixture 5:负净利年跳过 ──
console.log("fixture 5: 负净利跳过");
assert(deriveEconomicShares(vFacts, "ClassA", [{ period_end: "2025-09-30", net_income: -1_000_000 }]).length === 0, "净利≤0 → 路线B无定义 → 该年不补");

// ── fixture 6:scenario 维度(context 直接子节点,非 entity 内) ──
const SCENARIO_XML = `<?xml version="1.0" encoding="utf-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:t="http://test/20251231">
  <context id="cScenario"><entity><identifier scheme="s">0001234567</identifier></entity><scenario>
    <xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">us-gaap:CommonClassAMember</xbrldi:explicitMember>
  </scenario><period><startDate>2025-01-01</startDate><endDate>2025-12-31</endDate></period></context>
  <us-gaap:EarningsPerShareDiluted contextRef="cScenario" unitRef="u" decimals="2">8.50</us-gaap:EarningsPerShareDiluted>
  <us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding contextRef="cScenario" unitRef="sh" decimals="-6">500000000</us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding>
</xbrl>`;

console.log("fixture 6: scenario 维度");
const scenarioFacts = extractClassShareFacts(SCENARIO_XML);
assert(scenarioFacts.length === 2, "从 scenario(context 直接子节点)提取 ClassOfStock 维度事实");
const scenarioDerived = deriveEconomicShares(scenarioFacts, listedClassToken("T"), [{ period_end: "2025-12-31", net_income: 4_250_000_000 }]);
assert(scenarioDerived.length === 1 && Math.abs(scenarioDerived[0].shares - 4_250_000_000 / 8.5) < 1, "scenario 源事实推导成功");

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
