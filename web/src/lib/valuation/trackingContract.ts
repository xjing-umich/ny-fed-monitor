import { createHash } from "node:crypto";
import { resolveTrackingIdentity, type SecurityIdentity } from "../securities/trackingIdentity";
import type { ValuationRun } from "./runValuation";

export type { SecurityIdentity } from "../securities/trackingIdentity";
export type ReferenceKind = "oe_dcf_neutral" | "zero_growth_floor" | "sotp_base";
export type TrackingRecord = {
  schemaVersion: 1; revisionId: string; identity: SecurityIdentity;
  modelVersion: string; currency: string; perShareBasis: string;
  intrinsicValue: number | null; referenceValue: number | null;
  referenceKind: ReferenceKind | null; rangeLo: number | null; rangeHi: number | null;
  price: number | null; priceDate: string | null; priceSource: string | null;
  marginPct: number | null; requiredMargin: number | null; strikePrice: number | null;
  inStrikeZone: boolean | null; status: "valid" | "pending" | "unavailable";
  reasons: string[]; fundamentalAsOf: string | null; filedAt: string | null;
  computedAt: string; publishedAt: string | null;
  inputHashes: { fundamentals: string | null; assumptions: string | null; shareBasis: string | null };
  sources: { url: string; asOf: string | null; periodEnd?: string | null; currency?: string | null; evidenceKind?: "native_interim_ratios" }[];
};

/** Supply complete, same-run inputs (including evidence, external-rate dates and ADS/split treatment).
 * Null explicitly means unavailable; an empty or partial projection is not a complete fingerprint.
 * These are non-price inputs: neither the quote nor runtime timestamps belong in them.
 */
export type TrackingContext = {
  identity: SecurityIdentity;
  modelVersion: string; currency: string; perShareBasis: string;
  priceSource: string | null;
  fundamentalAsOf: string | null; filedAt: string | null;
  computedAt: string; publishedAt: string | null;
  nonPriceInputs: { fundamentals: unknown | null; assumptions: unknown | null; shareBasis: unknown | null };
  sources: TrackingRecord["sources"];
};

type JsonObject = Record<string, unknown>;
const HASH = /^[a-f0-9]{64}$/;
const KINDS: readonly unknown[] = ["oe_dcf_neutral", "zero_growth_floor", "sotp_base"];
const NUMBERS = ["intrinsicValue", "referenceValue", "rangeLo", "rangeHi", "price", "marginPct", "requiredMargin", "strikePrice"] as const;
function object(value: unknown): value is JsonObject { return !!value && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value.slice(0, 10)).toISOString().slice(0, 10) === value.slice(0, 10);
}
function nullableDate(value: unknown): boolean { return value === null || date(value); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function source(value: unknown): boolean {
  if (!object(value) || !text(value.url) || !nullableDate(value.asOf)) return false;
  if (value.periodEnd !== undefined && !nullableDate(value.periodEnd)) return false;
  if (value.currency !== undefined && value.currency !== null && !(typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency))) return false;
  if (value.evidenceKind !== undefined && value.evidenceKind !== "native_interim_ratios") return false;
  try { return ["https:", "http:"].includes(new URL(value.url).protocol); } catch { return false; }
}

/** Stable JSON rejects lossy/non-JSON inputs rather than hashing NaN as null or dropping undefined. */
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || finite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value) && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  throw new Error("Tracking inputs must contain finite JSON values");
}
function hash(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
function inputHash(value: unknown): string | null {
  if (value == null || object(value) && Object.keys(value).length === 0 || Array.isArray(value) && value.length === 0) return null;
  try { return hash(value); } catch { return null; }
}
function revision(record: Omit<TrackingRecord, "revisionId"> | TrackingRecord): string {
  // Whitelist contract semantics. Runtime publication/compute times and unknown properties cannot create revisions.
  const { identity, schemaVersion, modelVersion, currency, perShareBasis, intrinsicValue, referenceValue,
    referenceKind, rangeLo, rangeHi, price, priceDate, priceSource, marginPct, requiredMargin, strikePrice,
    inStrikeZone, status, reasons, fundamentalAsOf, filedAt, inputHashes, sources } = record;
  return hash({ identity, schemaVersion, modelVersion, currency, perShareBasis, intrinsicValue, referenceValue,
    referenceKind, rangeLo, rangeHi, price, priceDate, priceSource, marginPct, requiredMargin, strikePrice,
    inStrikeZone, status, reasons, fundamentalAsOf, filedAt, inputHashes, sources });
}

export function buildTrackingRecord(run: ValuationRun, context: TrackingContext): TrackingRecord {
  const identity = resolveTrackingIdentity(context.identity);
  if (!identity || identity.key !== context.identity.key) throw new Error("Tracking identity is not verified");
  if (!text(context.modelVersion) || !/^[A-Z]{3}$/.test(context.currency) || !text(context.perShareBasis)) throw new Error("Tracking model, currency and per-share basis are required");
  if (!date(context.computedAt) || !nullableDate(context.publishedAt) || !nullableDate(context.fundamentalAsOf) || !nullableDate(context.filedAt)) throw new Error("Invalid tracking provenance date");
  if (!context.sources.every(source)) throw new Error("Invalid tracking source");
  const inputHashes = {
    fundamentals: inputHash(context.nonPriceInputs.fundamentals),
    assumptions: inputHash(context.nonPriceInputs.assumptions),
    shareBasis: inputHash(context.nonPriceInputs.shareBasis),
  };
  const priceSource = context.priceSource?.trim() || null;
  const reasons: string[] = [];
  const verdict = run.verdict;
  const quote = run.strikeZone?.price;
  const currencyMismatch = run.currency !== context.currency || !!run.strikeZone?.currencyMismatch || !!quote && quote.currency !== run.currency;
  const referenceOnly = verdict?.referenceOnly === "missing_reinvestment";
  const invalidNumbers = !!verdict && (
    NUMBERS.some((key) => key !== "intrinsicValue" && key !== "marginPct" && !(referenceOnly && (key === "requiredMargin" || key === "strikePrice") && verdict[key] === null) && !finite(verdict[key])) ||
    verdict.intrinsicValue !== null && !finite(verdict.intrinsicValue) ||
    verdict.marginPct !== null && !finite(verdict.marginPct) ||
    !(verdict.referenceValue > 0) || !(verdict.price > 0) || !(verdict.rangeLo > 0) || verdict.rangeHi < verdict.rangeLo ||
    (!referenceOnly && (verdict.requiredMargin == null || verdict.requiredMargin < 0 || verdict.requiredMargin >= 1 || verdict.strikePrice == null || !(verdict.strikePrice > 0))) ||
    (referenceOnly && (verdict.intrinsicValue !== null || verdict.marginPct !== null || verdict.requiredMargin !== null || verdict.strikePrice !== null || verdict.inStrikeZone || verdict.reliable || verdict.referenceKind !== "zero_growth_floor")) || !KINDS.includes(verdict.referenceKind)
  );
  if (referenceOnly) reasons.push("missing_reinvestment");
  if (run.suppressedReason) reasons.push(run.suppressedReason);
  else if (!verdict) reasons.push("no_valuation_verdict");
  if (currencyMismatch) reasons.push("currency_mismatch");
  if (invalidNumbers) reasons.push("invalid_valuation_numbers");
  const unavailable = !verdict || !!run.suppressedReason || currencyMismatch || invalidNumbers;
  if (verdict?.marginPct === null) reasons.push("missing_margin");
  if (verdict && !verdict.reliable) reasons.push("unreliable_valuation");
  if (Object.values(inputHashes).some((value) => value === null)) reasons.push("missing_input_fingerprints");
  if (!context.sources.length) reasons.push("missing_sources");
  if (!context.fundamentalAsOf) reasons.push("missing_fundamental_date");
  if (!priceSource) reasons.push("missing_price_source");
  if (run.strikeZone?.stale) reasons.push("price_stale");
  const status = unavailable ? "unavailable" : reasons.length ? "pending" : "valid";
  const usable = unavailable ? null : verdict;
  const record: Omit<TrackingRecord, "revisionId"> = {
    schemaVersion: 1, identity, modelVersion: context.modelVersion, currency: context.currency, perShareBasis: context.perShareBasis,
    intrinsicValue: usable?.intrinsicValue ?? null, referenceValue: usable?.referenceValue ?? null,
    referenceKind: usable?.referenceKind ?? null, rangeLo: usable?.rangeLo ?? null, rangeHi: usable?.rangeHi ?? null,
    price: currencyMismatch ? null : finite(verdict?.price) ? verdict.price : finite(quote?.close) ? quote.close : null,
    priceDate: date(verdict?.priceDate) ? verdict.priceDate : date(quote?.date) ? quote.date : null,
    priceSource, marginPct: usable?.marginPct ?? null,
    requiredMargin: usable?.requiredMargin ?? null, strikePrice: usable?.strikePrice ?? null,
    inStrikeZone: status === "valid" ? verdict!.inStrikeZone : null,
    status, reasons: [...new Set(reasons)].sort(), fundamentalAsOf: context.fundamentalAsOf, filedAt: context.filedAt,
    computedAt: context.computedAt, publishedAt: context.publishedAt, inputHashes,
    sources: context.sources.map((item) => ({ ...item })).sort((a, b) => a.url.localeCompare(b.url) || (a.asOf ?? "").localeCompare(b.asOf ?? "")),
  };
  if (!record.priceDate && status !== "unavailable") {
    record.status = "pending";
    record.inStrikeZone = null;
    record.reasons = [...record.reasons, "missing_price_date"].sort();
  }
  return { ...record, revisionId: revision(record) };
}

/** Old snapshots and malformed/tampered contracts cannot become immutable user baselines. */
export function parseTrackingRecord(value: unknown): TrackingRecord | null {
  if (!object(value) || value.schemaVersion !== 1 || !text(value.revisionId) || !HASH.test(value.revisionId)) return null;
  const v = value;
  if (!object(v.identity)) return null;
  const i = v.identity;
  if (![i.ticker, i.key, i.securityType, i.source, i.checkedAt].every(text) ||
    ![i.figi, i.cik, i.cusip].every((id) => id === null || text(id))) return null;
  const identity = resolveTrackingIdentity(i as TrackingContext["identity"]);
  try {
    if (!identity || canonical(identity) !== canonical(i)) return null;
  } catch { return null; }
  if (!text(v.modelVersion) || !text(v.currency) || !/^[A-Z]{3}$/.test(v.currency) || !text(v.perShareBasis)) return null;
  if (!date(v.computedAt) || ![v.priceDate, v.fundamentalAsOf, v.filedAt, v.publishedAt].every(nullableDate)) return null;
  if (!(v.priceSource === null || text(v.priceSource)) || !NUMBERS.every((key) => v[key] === null || finite(v[key]))) return null;
  if (!(v.referenceKind === null || KINDS.includes(v.referenceKind)) || !(v.inStrikeZone === null || typeof v.inStrikeZone === "boolean")) return null;
  if (!["valid", "pending", "unavailable"].includes(v.status as string) || !Array.isArray(v.reasons) || !v.reasons.every(text)) return null;
  const hashes = v.inputHashes;
  if (!Array.isArray(v.sources) || !v.sources.every(source) || !object(hashes) ||
    !["fundamentals", "assumptions", "shareBasis"].every((key) => hashes[key] === null || typeof hashes[key] === "string" && HASH.test(hashes[key]))) return null;
  if (v.status === "valid") {
    if (v.reasons.length || !v.sources.length || !v.fundamentalAsOf || !v.priceDate || !v.priceSource ||
      !Object.values(hashes).every((h) => typeof h === "string" && HASH.test(h)) ||
      !["referenceValue", "rangeLo", "rangeHi", "price", "strikePrice"].every((key) => finite(v[key]) && v[key] > 0) ||
      !finite(v.requiredMargin) || v.requiredMargin < 0 || v.requiredMargin >= 1 ||
      !finite(v.marginPct) || !v.referenceKind || typeof v.inStrikeZone !== "boolean") return null;
  } else if (!v.reasons.length || v.inStrikeZone !== null) return null;
  if (v.referenceKind === "zero_growth_floor" && v.intrinsicValue !== null) return null;
  if (finite(v.rangeLo) && finite(v.rangeHi) && v.rangeHi < v.rangeLo) return null;
  try {
    const record = v as TrackingRecord;
    return revision(record) === v.revisionId ? JSON.parse(JSON.stringify(record)) as TrackingRecord : null;
  } catch { return null; }
}
