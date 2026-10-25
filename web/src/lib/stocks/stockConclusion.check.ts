// 运行: npx tsx src/lib/stocks/stockConclusion.check.ts
import assert from "node:assert/strict";
import { conclusionLeftState, stockAnchors, holdersLine, valuationDetailsShown, verdictGaugeReady } from "./stockConclusion";

const base = { hasFloor: true, splitCoverageStale: false, holdcoNotAssessable: false, hasHoldcoSotp: false, capitalStructureDistorted: false, fundamentalsCorrupt: false };
assert.equal(conclusionLeftState(base), "card");
assert.equal(conclusionLeftState({ ...base, hasFloor: false }), "unassessed", "无地板 → 未评估");
assert.equal(conclusionLeftState({ ...base, splitCoverageStale: true }), "splitPaused");
assert.equal(conclusionLeftState({ ...base, holdcoNotAssessable: true, hasHoldcoSotp: true }), "holdcoSotp", "BRK.B");
assert.equal(conclusionLeftState({ ...base, holdcoNotAssessable: true }), "holdcoNotAssessable");
assert.equal(conclusionLeftState({ ...base, capitalStructureDistorted: true }), "moatDistorted");
assert.equal(conclusionLeftState({ ...base, fundamentalsCorrupt: true }), "fundamentalsSuspect");
// 优先级与原估值区块分支一致:拆股暂停先于控股公司
assert.equal(conclusionLeftState({ ...base, splitCoverageStale: true, holdcoNotAssessable: true, hasHoldcoSotp: true }), "splitPaused");

assert.deepEqual(
  stockAnchors({ valuation: true, quality: true, coOwned: true }, "zh").map((a) => `${a.id}:${a.label}`),
  ["holders:持有人", "valuation:估值与方法", "quality:生意质量", "co-owned:共同持有", "sources:来源"],
);
assert.deepEqual(
  stockAnchors({ valuation: false, quality: false, coOwned: false }, "en").map((a) => a.id),
  ["holders", "sources"],
  "没有数据的区块不进导航",
);
assert.equal(stockAnchors({ valuation: true, quality: false, coOwned: false }, "en")[1].label, "Valuation");

assert.equal(holdersLine(27, "$76.77B", "zh"), "27 位持有 · 合计 $76.77B");
assert.equal(holdersLine(1, "$5.0M", "en"), "1 holder · $5.0M combined");
assert.equal(holdersLine(27, "$76.77B", "en"), "27 holders · $76.77B combined");

// #valuation 只在有明细可放时出现:普通估值卡(方法与数字)与控股集团 SOTP 表。
// holdcoNotAssessable 的资产底一行已在结论带里,不再单开一节(锚点随之消失)。
assert.equal(valuationDetailsShown("card"), true);
assert.equal(valuationDetailsShown("holdcoSotp"), true);
for (const s of ["unassessed", "splitPaused", "holdcoNotAssessable", "moatDistorted", "fundamentalsSuspect"] as const) {
  assert.equal(valuationDetailsShown(s), false, `${s} 无估值明细`);
}

// SOTP 中枢 + 刻度盘只在权威判定的区间与现价都有限时画(与改版前一致)。
const v = { rangeLo: 300, rangeHi: 600, price: 450 };
assert.equal(verdictGaugeReady(v), true);
assert.equal(verdictGaugeReady(null), false, "无判定 → 不画中枢");
assert.equal(verdictGaugeReady(undefined), false);
assert.equal(verdictGaugeReady({ ...v, price: Number.NaN }), false, "现价非有限");
assert.equal(verdictGaugeReady({ ...v, rangeLo: Number.POSITIVE_INFINITY }), false, "下沿非有限");
assert.equal(verdictGaugeReady({ ...v, rangeHi: Number.NaN }), false, "上沿非有限");

console.log("stockConclusion.check OK");
