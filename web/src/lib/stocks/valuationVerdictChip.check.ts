import { valuationVerdictChip, valuationSectionTitle } from "./valuationVerdictChip";
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exit(1); } }

function v(p: Partial<ValuationVerdict>): ValuationVerdict {
  return { bucket: "within", inStrikeZone: false, valueFloor: 10, marginPct: null, coverage: "full", reliable: true, ...p } as ValuationVerdict;
}

// null → null
assert(valuationVerdictChip(null, "zh") === null, "null → null");
// 击球区优先于 bucket, 可信 → positive
const strike = valuationVerdictChip(v({ inStrikeZone: true, bucket: "below" }), "en");
assert(strike?.label === "Strike zone" && strike?.tone === "positive", `strike zone positive, got ${JSON.stringify(strike)}`);
// below 可信 → positive
assert(valuationVerdictChip(v({ bucket: "below" }), "zh")?.tone === "positive", "below reliable → positive");
assert(valuationVerdictChip(v({ bucket: "below" }), "zh")?.label === "低于内在价值", "below zh label");
// 便宜档但 reliable=false → neutral(不标已确认便宜)
assert(valuationVerdictChip(v({ bucket: "below", reliable: false }), "en")?.tone === "neutral", "below unreliable → neutral");
assert(valuationVerdictChip(v({ inStrikeZone: true, reliable: false }), "en")?.tone === "neutral", "strike unreliable → neutral");
// 红旗便宜档标题芯片带“待确认”字样
assert(valuationVerdictChip(v({ inStrikeZone: true, reliable: false }), "en")?.label === "Strike zone · pending", "红旗击球区带 pending 字样");
assert(valuationVerdictChip(v({ inStrikeZone: true, reliable: false }), "zh")?.label === "击球区 · 待确认", "zh 待确认");
// within → neutral, above → warn
assert(valuationVerdictChip(v({ bucket: "within" }), "en")?.tone === "neutral", "within → neutral");
const above = valuationVerdictChip(v({ bucket: "above" }), "zh");
assert(above?.label === "高于价值带" && above?.tone === "warn", `above warn, got ${JSON.stringify(above)}`);
// zh/en 纯语言
assert(valuationVerdictChip(v({ bucket: "within" }), "en")?.label === "Within band", "within en label");

// 估值区块标题:档名与标题徽章同源(final-fix B #3),红旗便宜档必带待确认
const eq = (got: string | null, want: string | null, m: string) => assert(got === want, `${m}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
eq(valuationSectionTitle(v({ inStrikeZone: true, bucket: "below" }), "zh"), "击球区", "strike confirmed zh");
eq(valuationSectionTitle(v({ inStrikeZone: true, bucket: "below" }), "en"), "Strike zone", "strike confirmed en");
eq(valuationSectionTitle(v({ inStrikeZone: true, bucket: "below", reliable: false }), "zh"), "击球区 · 待确认", "strike pending zh");
eq(valuationSectionTitle(v({ inStrikeZone: true, bucket: "below", reliable: false }), "en"), "Strike zone · pending", "strike pending en");
eq(valuationSectionTitle(v({ bucket: "below", reliable: false }), "zh"), "低于内在价值 · 待确认", "below pending zh");
eq(valuationSectionTitle(v({ bucket: "above" }), "zh"), "高于价值带", "above zh");
eq(valuationSectionTitle(v({ bucket: "above" }), "en"), "Above band", "above en");
eq(valuationSectionTitle(v({ bucket: "within" }), "zh"), "价值带内", "within zh");
eq(valuationSectionTitle(v({ bucket: "within" }), "en"), "Within band", "within en");
eq(valuationSectionTitle(null, "zh"), "估值", "null zh → 回退");
eq(valuationSectionTitle(null, "en"), "Valuation", "null en → 回退");

console.log("valuationVerdictChip.check OK");
