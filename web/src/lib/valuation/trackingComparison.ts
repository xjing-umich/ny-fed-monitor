import { pctDelta, perShareValue, price, weight } from "../i18n/format";
import type { TrackingRecord } from "./trackingContract";

export type ChangeKind = "no_change" | "price_only" | "fundamentals" | "assumptions"
  | "multiple_inputs" | "result_updated" | "not_comparable" | "unavailable";
export type TrackingComparison = {
  comparable: boolean; kind: ChangeKind; reasons: string[];
  valueChangePct: number | null; marginChangePp: number | null;
  zoneChange: "entered" | "left" | null;
};

function finite(value: number | null): value is number { return value !== null && Number.isFinite(value); }
function percentChange(before: number | null, after: number | null): number | null {
  if (!finite(before) || before <= 0 || !finite(after)) return null;
  const delta = (after - before) / before * 100;
  return Number.isFinite(delta) ? delta : null;
}
function visible(before: number | null, after: number | null, format: (value: number) => string): boolean {
  return (finite(before) ? format(before) : "—") !== (finite(after) ? format(after) : "—");
}
function stopped(kind: "not_comparable" | "unavailable", reasons: string[]): TrackingComparison {
  return { comparable: false, kind, reasons: [...new Set(reasons)], valueChangePct: null, marginChangePp: null, zoneChange: null };
}

/** Compares fixed, validated snapshots; callers retain both originals when comparison is paused. */
export function compareTrackingRecords(baseline: TrackingRecord, latest: TrackingRecord): TrackingComparison {
  const unavailable: string[] = [];
  for (const [role, record] of [["baseline", baseline], ["latest", latest]] as const) {
    if (record.status !== "valid") unavailable.push(`${role}_${record.status}`, ...record.reasons);
    if (!finite(record.referenceValue) || record.referenceValue <= 0) unavailable.push(`${role}_missing_reference`);
  }
  if (unavailable.length) return stopped("unavailable", unavailable);

  const incompatible: string[] = [];
  const oldIdentity = baseline.identity;
  const newIdentity = latest.identity;
  if (oldIdentity.key !== newIdentity.key || oldIdentity.securityType !== newIdentity.securityType ||
    (["figi", "cik", "cusip"] as const).some((key) => oldIdentity[key] && newIdentity[key] && oldIdentity[key] !== newIdentity[key])) {
    incompatible.push("identity_changed");
  }
  if (baseline.modelVersion !== latest.modelVersion) incompatible.push("model_changed");
  if (baseline.referenceKind !== latest.referenceKind) incompatible.push("method_changed");
  if (baseline.currency !== latest.currency) incompatible.push("currency_changed");
  if (baseline.perShareBasis !== latest.perShareBasis || baseline.inputHashes.shareBasis && latest.inputHashes.shareBasis &&
    baseline.inputHashes.shareBasis !== latest.inputHashes.shareBasis) incompatible.push("share_basis_changed");
  if (incompatible.length) return stopped("not_comparable", incompatible);

  const valueChangePct = percentChange(baseline.referenceValue, latest.referenceValue);
  const marginDelta = finite(baseline.marginPct) && finite(latest.marginPct) ? (latest.marginPct - baseline.marginPct) * 100 : null;
  const marginChangePp = marginDelta !== null && Number.isFinite(marginDelta) ? marginDelta : null;
  const zoneChange: TrackingComparison["zoneChange"] = typeof baseline.inStrikeZone === "boolean" && typeof latest.inStrikeZone === "boolean" &&
    finite(baseline.marginPct) && finite(latest.marginPct) && baseline.inStrikeZone !== latest.inStrikeZone
    ? latest.inStrikeZone ? "entered" : "left" : null;
  const priceChanged = visible(baseline.price, latest.price, price);
  const valueFields = ["intrinsicValue", "referenceValue", "rangeLo", "rangeHi", "strikePrice"] as const;
  const valueChanged = valueFields.some((key) => visible(baseline[key], latest[key], perShareValue)) ||
    valueChangePct !== null && pctDelta(valueChangePct / 100) !== "0%";
  const marginChanged = visible(baseline.marginPct, latest.marginPct, weight);
  const thresholdChanged = visible(baseline.requiredMargin, latest.requiredMargin, weight);
  const result = { comparable: true, valueChangePct, marginChangePp, zoneChange };
  if (!priceChanged && !valueChanged && !marginChanged && !thresholdChanged && !zoneChange) {
    return { ...result, kind: "no_change", reasons: [] };
  }

  const completeHashes = Object.values(baseline.inputHashes).every(Boolean) && Object.values(latest.inputHashes).every(Boolean);
  const sourcesPresent = baseline.sources.length > 0 && latest.sources.length > 0 && !!baseline.fundamentalAsOf && !!latest.fundamentalAsOf;
  if (!completeHashes || !sourcesPresent) {
    return { ...result, kind: "result_updated", reasons: [!completeHashes ? "missing_input_fingerprints" : "missing_sources"] };
  }
  const fundamentalsChanged = baseline.inputHashes.fundamentals !== latest.inputHashes.fundamentals || baseline.fundamentalAsOf !== latest.fundamentalAsOf;
  const assumptionsChanged = baseline.inputHashes.assumptions !== latest.inputHashes.assumptions;
  const inputs = [priceChanged ? "price_changed" : null, fundamentalsChanged ? "fundamentals_updated" : null,
    assumptionsChanged ? "assumptions_updated" : null].filter((reason): reason is string => reason !== null);
  if (inputs.length > 1) return { ...result, kind: "multiple_inputs", reasons: inputs };
  if (fundamentalsChanged) return { ...result, kind: "fundamentals", reasons: inputs };
  if (assumptionsChanged) return { ...result, kind: "assumptions", reasons: inputs };
  const sourceKeys = (record: TrackingRecord) => record.sources.map(({ url, asOf }) => JSON.stringify([url, asOf])).sort();
  const sameProvenance = baseline.filedAt === latest.filedAt && JSON.stringify(sourceKeys(baseline)) === JSON.stringify(sourceKeys(latest));
  // Equal fingerprints cannot explain a changed valuation reference, requirement, or financial provenance.
  if (priceChanged && !valueChanged && !thresholdChanged && sameProvenance) return { ...result, kind: "price_only", reasons: inputs };
  return { ...result, kind: "result_updated", reasons: ["unverified_result_change"] };
}
