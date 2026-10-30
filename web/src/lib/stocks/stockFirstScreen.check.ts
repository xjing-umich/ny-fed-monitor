import assert from "node:assert/strict";
import { linearValueAxis, stockValueSummary, stockFallbackHeading } from "./stockFirstScreen";
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";

const axis = linearValueAxis(90, 180, 360)!;
assert.equal(axis.max, 400);
assert.equal(axis.low, 22.5); assert.equal(axis.high, 45); assert.equal(axis.price, 90);
assert.deepEqual(axis.ticks, [0, 100, 200, 300, 400]);
for (const [lo, hi, price] of [[100, 100, 100], [0.01, 0.03, 0.2], [1e10, 1e11, 1e12], [1e305, 1e306, 1e308]]) {
  const result = linearValueAxis(lo, hi, price)!;
  assert.ok(result && Object.values(result).flat().every(Number.isFinite));
  assert.ok(result.price <= 100 && result.high <= 100 && result.low <= result.high);
  assert.ok(result.ticks.length <= 6);
}
for (const row of [[NaN, 100, 100], [100, 90, 100], [0, 100, 100], [100, 200, -1], [100, Infinity, 1]]) assert.equal(linearValueAxis(...row as [number, number, number]), null);
const verdict = { rangeLo: 90, rangeHi: 180, price: 150, priceDate: "2026-10-29", reliable: true, bucket: "below" } as ValuationVerdict;
const quote = { close: 150, date: "2026-10-29", currency: "USD", source: "yahoo" };
const input = { verdict, quote, reference: 160, kind: "earnings" as const };
const zh = stockValueSummary(input, "zh")!;
assert.equal(zh.position, "within"); assert.equal(zh.heading, "现价处于价值区间");
assert.equal(zh.reference, 160); assert.equal(zh.referenceLabel, "内在价值参考");
assert.equal(zh.source, "Yahoo Finance"); assert.equal(zh.date, "2026-10-29");
assert.equal(stockValueSummary({ ...input, reference: undefined, kind: "zero-growth" }, "zh")!.reference, null);
assert.equal(stockValueSummary({ ...input, kind: "zero-growth" }, "zh")!.rangeLabel, "零增长价值参考 · 每股");
assert.equal(stockValueSummary({ ...input, kind: "sotp" }, "zh")!.referenceLabel, "分部估值参考");
assert.match(stockValueSummary({ ...input, kind: "sotp" }, "en")!.rangeLabel, /sum.of.the.parts/i);
for (const price of [90, 180]) assert.equal(stockValueSummary({ ...input, verdict: { ...verdict, price }, quote: { ...quote, close: price } }, "en")!.position, "within");
const below = stockValueSummary({ ...input, verdict: { ...verdict, price: 60 }, quote: { ...quote, close: 60 } }, "en")!;
assert.equal(below.position, "below"); assert.match(below.gap!, /33%/);
for (const broken of [
  { ...input, verdict: null }, { ...input, verdict: { ...verdict, reliable: false } }, { ...input, quote: null },
  { ...input, quote: { ...quote, stale: true } }, { ...input, quote: { ...quote, currency: "HKD" } },
  { ...input, quote: { ...quote, close: 151 } }, { ...input, quote: { ...quote, date: "2026-10-28" } },
]) assert.equal(stockValueSummary(broken, "zh"), null, "不绕过可靠性、价格、币种或日期闸门");
assert.match(stockFallbackHeading("growthEvidenceMissing", true, "zh"), /增长证据/);
assert.equal(stockFallbackHeading("card", false, "zh"), "估值待确认");
assert.equal(stockFallbackHeading("unassessed", undefined, "en"), "Valuation unavailable");
console.log("stockFirstScreen.check OK");
