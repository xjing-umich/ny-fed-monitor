import assert from "node:assert/strict";
import { buildTrackingRecord, parseTrackingRecord, type TrackingContext } from "./trackingContract";
import type { ValuationRun } from "./runValuation";

const context: TrackingContext = {
  identity: { key: "figi:BBG009S3NB30", ticker: "GOOG", figi: "BBG009S3NB30", cik: "0001652044", cusip: "02079K107", securityType: "Common Stock", source: "openfigi+sec", checkedAt: "2026-10-29" },
  modelVersion: "fixture-v1", currency: "USD", perShareBasis: "ordinary:split-2026-01-01",
  priceSource: "fixture", fundamentalAsOf: "2026-09-30", filedAt: "2026-10-29",
  computedAt: "2026-10-31T00:00:00Z", publishedAt: null,
  nonPriceInputs: { fundamentals: { revenue: 1000, periodEnd: "2026-09-30" }, assumptions: { dgs10: 4.2, date: "2026-10-29" }, shareBasis: { shares: 10, adsRatio: 1 } },
  sources: [{ url: "https://www.sec.gov/fixture", asOf: "2026-10-29" }],
};
const run: ValuationRun = {
  currency: "USD",
  floor: undefined, strikeZone: undefined, oeDcf: undefined, reconciliation: undefined,
  methods: { zeroGrowthEpv: true, oeDcf: true, greenwaldGrowthCeilings: true },
  expectations: { assessable: false, reason: "fixture" },
  verdict: { bucket: "below", coverage: "full", methods: { zeroGrowthEpv: true, oeDcf: true, greenwaldGrowthCeilings: true }, reliable: true,
    rangeLo: 60, rangeHi: 120, price: 50, priceDate: "2026-10-30", marginPct: .5, inStrikeZone: true,
    intrinsicValue: 100, referenceValue: 100, referenceKind: "oe_dcf_neutral", requiredMargin: .38, strikePrice: 62 },
};
const record = buildTrackingRecord(run, context);
assert.equal(record.referenceValue, 100, "comparison anchor must not be display rangeLo=60");
assert.equal(record.referenceKind, "oe_dcf_neutral");
assert.equal(record.intrinsicValue, 100);
assert.equal(record.requiredMargin, .38);
assert.equal(record.strikePrice, 62);
assert.equal(record.status, "valid");
assert.equal(record.priceDate, "2026-10-30");
assert.equal(record.fundamentalAsOf, "2026-09-30");
assert.match(record.revisionId, /^[a-f0-9]{64}$/);
for (const hash of Object.values(record.inputHashes)) assert.match(hash!, /^[a-f0-9]{64}$/);
assert.deepEqual(parseTrackingRecord(JSON.parse(JSON.stringify(record))), record);
assert.equal(parseTrackingRecord({ rangeLo: 60, marginPct: .5 }), null);
assert.equal(parseTrackingRecord({ ...record, referenceValue: NaN }), null);
assert.equal(parseTrackingRecord({ ...record, identity: { ...record.identity, key: "fake" } }), null);
assert.equal(parseTrackingRecord({ ...record, marginPct: .9 }), null, "tampered content must fail revision validation");
assert.equal(parseTrackingRecord({ ...record, status: "pending", reasons: [] }), null);
assert.equal(parseTrackingRecord({ ...record, inputHashes: {} }), null);
const rerun = buildTrackingRecord(run, { ...context, computedAt: "2026-11-01T00:00:00Z", publishedAt: "2026-11-01T00:05:00Z" });
assert.equal(rerun.revisionId, record.revisionId, "runtime timestamps do not manufacture new revisions");
assert.equal(buildTrackingRecord(run, { ...context, nonPriceInputs: { ...context.nonPriceInputs, fundamentals: { periodEnd: "2026-09-30", revenue: 1000 } } }).revisionId, record.revisionId,
  "object key order is immaterial");
for (const update of [
  { fundamentalAsOf: "2026-10-01" },
  { sources: [{ url: "https://www.sec.gov/fixture", asOf: "2026-10-30" }] },
  { nonPriceInputs: { ...context.nonPriceInputs, assumptions: { dgs10: 4.3, date: "2026-10-30" } } },
]) assert.notEqual(buildTrackingRecord(run, { ...context, ...update }).revisionId, record.revisionId);
const missing = buildTrackingRecord(run, { ...context, nonPriceInputs: { fundamentals: null, assumptions: null, shareBasis: null } });
assert.deepEqual(missing.inputHashes, { fundamentals: null, assumptions: null, shareBasis: null });
assert.equal(missing.status, "pending");
assert(missing.reasons.includes("missing_input_fingerprints"));
const unreliable = buildTrackingRecord({ ...run, verdict: { ...run.verdict!, reliable: false } }, context);
assert.equal(unreliable.status, "pending");
assert.equal(unreliable.inStrikeZone, null);
assert(unreliable.reasons.includes("unreliable_valuation"));
const unavailable = buildTrackingRecord({ ...run, verdict: null, suppressedReason: "currency_mismatch" }, context);
assert.equal(unavailable.referenceValue, null);
assert.equal(unavailable.status, "unavailable");
assert(unavailable.reasons.includes("currency_mismatch"));
const mismatch = buildTrackingRecord({ ...run, strikeZone: { price: { close: 50, date: "2026-10-30", currency: "HKD" }, stale: false, currencyMismatch: true } }, context);
assert.equal(mismatch.status, "unavailable");
assert.equal(mismatch.marginPct, null);
assert(mismatch.reasons.includes("currency_mismatch"));
const invalid = buildTrackingRecord({ ...run, verdict: { ...run.verdict!, referenceValue: NaN } }, context);
assert.equal(invalid.status, "unavailable");
assert.equal(invalid.referenceValue, null);
assert(invalid.reasons.includes("invalid_valuation_numbers"));
assert.doesNotThrow(() => JSON.stringify(invalid));
const floor = buildTrackingRecord({ ...run, verdict: { ...run.verdict!, intrinsicValue: null, referenceValue: 60, referenceKind: "zero_growth_floor", requiredMargin: 1 / 3, strikePrice: 40 } }, context);
assert.equal(floor.intrinsicValue, null, "zero-growth fallback must never impersonate neutral IV");
assert.equal(floor.referenceValue, 60);
const sotp = buildTrackingRecord({ ...run, verdict: { ...run.verdict!, intrinsicValue: null, referenceValue: 80, referenceKind: "sotp_base" } }, context);
assert.equal(sotp.referenceValue, 80);
assert.equal(sotp.referenceKind, "sotp_base");
assert.equal(parseTrackingRecord({ ...record, identity: { ...record.identity, extra: undefined } }), null);
assert.equal(buildTrackingRecord({ ...run, verdict: { ...run.verdict!, marginPct: null } }, context).status, "pending",
  "missing margin must be explained without treating its other numbers as corrupt");
assert.equal(buildTrackingRecord(run, { ...context, nonPriceInputs: { fundamentals: {}, assumptions: {}, shareBasis: {} } }).status, "pending",
  "empty input objects are not complete fingerprints");
assert.equal(buildTrackingRecord({ ...run, suppressedReason: "fundamentals_stale" }, context).status, "unavailable",
  "a suppression cannot become a valid baseline even if an old verdict was retained");

const mislabeled = buildTrackingRecord(run, { ...context, currency: "HKD" });
assert.equal(mislabeled.status, "unavailable", "engine's USD output must not be relabeled by context");
assert.equal(mislabeled.intrinsicValue, null);
assert.equal(mislabeled.price, null);
assert(mislabeled.reasons.includes("currency_mismatch"));

const blankSource = buildTrackingRecord(run, { ...context, priceSource: "   " });
assert.equal(blankSource.status, "pending", "blank quote provenance must not yield a valid baseline");
assert.equal(blankSource.priceSource, null);
assert(blankSource.reasons.includes("missing_price_source"));

const pendingReference = buildTrackingRecord({ ...run, verdict: { ...run.verdict!,
  referenceOnly: "missing_reinvestment", reliable: false, inStrikeZone: false,
  intrinsicValue: null, referenceValue: 60, referenceKind: "zero_growth_floor",
  marginPct: null, requiredMargin: null, strikePrice: null,
} }, context);
assert.equal(pendingReference.status, "pending", "missing reinvestment must retain a readable reference");
assert.equal(pendingReference.referenceValue, 60);
assert.equal(pendingReference.rangeLo, 60);
assert.equal(pendingReference.strikePrice, null);
assert.equal(pendingReference.inStrikeZone, null);
assert.ok(pendingReference.reasons.includes("missing_reinvestment"));
assert.deepEqual(parseTrackingRecord(pendingReference), pendingReference);
console.log("trackingContract.check.ts OK");
