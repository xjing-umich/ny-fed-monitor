import { valuationVerdictChip } from "./valuationVerdictChip";
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

console.log("valuationVerdictChip.check OK");
