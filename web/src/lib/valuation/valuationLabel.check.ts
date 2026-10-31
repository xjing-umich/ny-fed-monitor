// 运行: npx tsx src/lib/valuation/valuationLabel.check.ts
import assert from "node:assert/strict";
import { valuationLabel } from "./valuationLabel";

const v = (p: Partial<{ bucket: "below" | "within" | "above"; inStrikeZone: boolean; reliable: boolean; coverage: "full" | "single_lamp" }>) =>
  ({ bucket: "within" as const, inStrikeZone: false, reliable: true, coverage: "full" as const, ...p });

let l = valuationLabel(v({ inStrikeZone: true, bucket: "below" }), "zh");
assert.deepEqual([l.tier, l.label, l.pending, l.tone], ["strike", "击球区", false, "val-below"]);
l = valuationLabel(v({ inStrikeZone: true, bucket: "below", reliable: false }), "zh");
assert.deepEqual([l.tier, l.label, l.pending, l.tone], ["strike", "击球区", true, "neutral"], "红旗击球区 = 待确认");
assert.ok(l.title && l.title.length > 0, "待确认带原因");
l = valuationLabel(v({ bucket: "below" }), "en");
assert.deepEqual([l.tier, l.label], ["below", "Below intrinsic value"]);
l = valuationLabel(v({ bucket: "below", reliable: false }), "en");
assert.equal(l.pending, true);
l = valuationLabel(v({ bucket: "within" }), "zh");
assert.deepEqual([l.tier, l.label, l.pending, l.tone], ["within", "在价值区间内", false, "val-within"]);
l = valuationLabel(v({ bucket: "within", reliable: false }), "zh");
assert.equal(l.pending, false, "非便宜档不挂待确认");
l = valuationLabel(v({ bucket: "above" }), "en");
assert.deepEqual([l.tier, l.label, l.tone], ["above", "Above value range", "val-above"]);
l = valuationLabel(null, "zh");
assert.deepEqual([l.tier, l.label, l.pending], ["unassessed", "未评估", false]);
assert.equal(l.title, "暂无可用估值：缺少可用财报、这类公司不适用本估值方法，或数据未通过核验。", "未评估带原因(含核验未过)");
l = valuationLabel(undefined, "en");
assert.equal(l.label, "Not assessed");
assert.equal(l.title, "No valuation yet: usable filings are missing, the method doesn't apply to this kind of company, or the data failed our checks.");
l = valuationLabel(v({ bucket: "above", coverage: "single_lamp" }), "en");
assert.ok(l.title?.includes("Single-method"), "单法口径说明");
console.log("valuationLabel.check OK");

for(const lang of ["en","zh"] as const)for(const bucket of ["below","within","above"] as const){const label=valuationLabel({...v({bucket,reliable:false}),referenceOnly:"missing_reinvestment"},lang);assert.equal(label.pending,true);assert.equal(label.tone,"neutral");assert.match(label.label,lang==="zh"?/^零增长参考$/:/^Zero-growth reference$/);assert.doesNotMatch(label.label,/击球区|intrinsic value|低于内在价值/);}
