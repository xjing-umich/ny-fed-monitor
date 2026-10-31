import assert from "node:assert/strict";
import type { TrackingRecord } from "./trackingContract";
import { compareTrackingRecords } from "./trackingComparison";
import { trackingChangeText } from "./trackingCopy";

// Synthetic records exercise comparisons without fetching market or financial data.
const base: TrackingRecord = {
  schemaVersion: 1, revisionId: "baseline", identity: { key: "figi:fixture", ticker: "FIX", figi: "fixture", cik: null,
    cusip: null, securityType: "Common Stock", source: "fixture", checkedAt: "2026-10-30" },
  modelVersion: "fixture-v1", currency: "USD", perShareBasis: "ordinary:split-1",
  intrinsicValue: 100, referenceValue: 100, referenceKind: "oe_dcf_neutral", rangeLo: 60, rangeHi: 120,
  price: 80, priceDate: "2026-10-30", priceSource: "fixture", marginPct: .20, requiredMargin: .25,
  strikePrice: 75, inStrikeZone: false, status: "valid", reasons: [], fundamentalAsOf: "2026-09-30",
  filedAt: "2026-10-29", computedAt: "2026-10-30T12:00:00Z", publishedAt: "2026-10-30T12:01:00Z",
  inputHashes: { fundamentals: "f1", assumptions: "a1", shareBasis: "s1" },
  sources: [{ url: "https://www.sec.gov/fixture", asOf: "2026-10-29" }],
};
const compare = (patch: Partial<TrackingRecord>) => compareTrackingRecords(base, { ...base, revisionId: "latest", ...patch });
const latest = { ...base, revisionId: "latest", price: 70, marginPct: .30, inStrikeZone: true };
const priceOnly = compareTrackingRecords(base, latest);
assert.equal(priceOnly.kind, "price_only");
assert.equal(priceOnly.valueChangePct, 0, "price drops must not become intrinsic-value drops");
assert.ok(Math.abs(priceOnly.marginChangePp! - 10) < 1e-9);
assert.equal(priceOnly.zoneChange, "entered");
const valueDrop = compare({ referenceValue: 80, intrinsicValue: 80, price: 72, marginPct: .10,
  inputHashes: { ...base.inputHashes, fundamentals: "f2" } });
assert.equal(valueDrop.valueChangePct, -20, "(80 - 100) / 100 differs from the price's -10%");
assert.ok(Math.abs(valueDrop.marginChangePp! + 10) < 1e-9, "a falling price can still lose margin when value falls more");
assert.equal(valueDrop.kind, "multiple_inputs", "price and fundamentals both changed");
assert.equal(compare({ referenceValue: 80, intrinsicValue: 80, marginPct: 0,
  inputHashes: { ...base.inputHashes, fundamentals: "f2" } }).kind, "fundamentals");
assert.equal(compare({ referenceValue: 80, intrinsicValue: 80,
  inputHashes: { ...base.inputHashes, assumptions: "a2" } }).kind, "assumptions");
assert.equal(compare({ referenceValue: 80, intrinsicValue: 80 }).kind, "result_updated", "different results alone cannot prove a cause");
assert.equal(compare({ price: 70, marginPct: .30,
  inputHashes: { ...base.inputHashes, assumptions: null } }).kind, "result_updated", "incomplete fingerprints never prove price-only changes");
assert.equal(compare({ referenceValue: 80, intrinsicValue: 80, sources: [],
  inputHashes: { ...base.inputHashes, fundamentals: "f2" } }).kind, "result_updated", "financial attribution needs sources");
assert.equal(compare({ price: 70, marginPct: .30,
  sources: [{ url: "https://www.sec.gov/corrected-fixture", asOf: "2026-10-30" }] }).kind, "result_updated",
  "changed financial provenance cannot prove that only price changed");
assert.equal(compare({ referenceValue: 80, intrinsicValue: 80, fundamentalAsOf: null,
  inputHashes: { ...base.inputHashes, fundamentals: "f2" } }).kind, "result_updated", "financial attribution needs a financial period");
for (const patch of [
  { modelVersion: "fixture-v2" }, { referenceKind: "sotp_base" as const },
  { identity: { ...base.identity, key: "figi:other" } }, { currency: "HKD" },
  { perShareBasis: "ADS:ratio-2" }, { inputHashes: { ...base.inputHashes, shareBasis: "split-2" } },
]) {
  const result = compare(patch);
  assert.equal(result.kind, "not_comparable");
  assert.equal(result.comparable, false);
  assert.equal(result.valueChangePct, null);
  assert.equal(result.marginChangePp, null);
  assert.equal(result.zoneChange, null);
}
assert.equal(compareTrackingRecords(base, { ...latest, status: "pending" }).zoneChange, null);
assert.equal(compare({ status: "unavailable", reasons: ["fundamentals_stale"], inStrikeZone: null }).kind, "unavailable");
const noBaseline = compareTrackingRecords({ ...base, status: "pending", referenceValue: null, inStrikeZone: null }, latest);
assert.equal(noBaseline.kind, "unavailable", "first usable valuation still needs a valid baseline before comparison");
assert.equal(noBaseline.zoneChange, null);
assert.equal(compareTrackingRecords({ ...base, referenceValue: 0 }, { ...base, referenceValue: 80 }).valueChangePct, null);
assert.equal(compare({ referenceValue: NaN }).valueChangePct, null);
assert.equal(compare({ inStrikeZone: null }).zoneChange, null);
assert.equal(compareTrackingRecords({ ...base, inStrikeZone: true }, { ...base, inStrikeZone: false }).zoneChange, "left");
assert.equal(compare({ referenceValue: 100.001, intrinsicValue: 100.001, price: 80.001, marginPct: .200001 }).kind, "no_change",
  "changes invisible at existing amount/percentage precision do not manufacture a summary");
assert.equal(compare({ inputHashes: { ...base.inputHashes, fundamentals: "new-source" },
  sources: [{ url: "https://www.sec.gov/new-fixture", asOf: "2026-10-30" }] }).kind, "no_change",
  "new provenance at unchanged displayed values does not claim an economic change");
assert.equal(compare({ computedAt: "2026-10-31T00:00:00Z" }).kind, "no_change");
assert.equal(compare({ referenceValue: 80, intrinsicValue: 80, fundamentalAsOf: "2026-10-31" }).kind, "fundamentals",
  "a sourced financial-period update is explicit evidence even without a changed fingerprint");
assert.equal(compare({ referenceValue: 80, intrinsicValue: 80,
  inputHashes: { ...base.inputHashes, fundamentals: "f2", assumptions: "a2" } }).kind, "multiple_inputs");
const floor = { ...base, intrinsicValue: null, referenceValue: 60, referenceKind: "zero_growth_floor" as const };
assert.equal(compareTrackingRecords(floor, { ...floor, referenceValue: 48 }).valueChangePct, -20,
  "zero-growth reference remains comparable without pretending to be intrinsic value");
for (const lang of ["zh", "en"] as const) {
  const text = trackingChangeText(priceOnly, lang);
  assert.match(text, lang === "zh" ? /价格变化，估值参照未变/ : /Price changed; the valuation reference is unchanged/);
  assert.match(text, lang === "zh" ? /\+10.*百分点/ : /\+10.*percentage points/);
  assert.match(text, lang === "zh" ? /相对基准进入击球区/ : /Entered the strike zone relative to the baseline/);
  const unknown = trackingChangeText(valueDrop, lang);
  assert.doesNotMatch(unknown, /经营改善|经营恶化|business improved|business deteriorated|中枢 IV|Central IV/);
  assert.match(trackingChangeText(noBaseline, lang), lang === "zh" ? /待确认/ : /pending review/);
  assert.match(trackingChangeText(compare({ referenceValue: 80 }), lang), lang === "zh" ? /具体原因待核实/ : /cause.*unverified/);
}
console.log("trackingComparison.check.ts OK");
