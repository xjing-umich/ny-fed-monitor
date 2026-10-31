import "server-only";
import { cache } from "react";
import type { MoatCapAssessment } from "./types";
import { getDb, hasSupabaseEnv, isMissingTableError, selectAllPages } from "../managers/db";
import { isIdentityQuarantined } from "../securities/securityIdentity";
import { resolveTrackingIdentity, type SecurityIdentity } from "../securities/trackingIdentity";
import { parseTrackingRecord, type TrackingRecord } from "./trackingContract";
import type { ValuationRun } from "./runValuation";
import { VALUATION_MODEL_VERSION } from "./modelVersion";
import { isPriceStale } from "./priceAge";
import { isFundamentalsStale } from "./fundamentalsStale";
import { isImplausibleBand } from "./deriveValuationVerdict";

export type PublishedValuation = { record: TrackingRecord; presentation: ValuationRun };
export type PublishedValuationSummary = {record:TrackingRecord;verdict:ValuationRun["verdict"];expectations:ValuationRun["expectations"];methods:ValuationRun["methods"];moatCap?:MoatCapAssessment};
export type SafetyState = {
  identityKey: string | null;
  status: "valid" | "pending" | "invalid";
  reasons: string[];
  observedAt: string;
};
export class PublicationUnavailableError extends Error {
  constructor(public readonly reason: "not_configured" | "schema_missing" | "database_unavailable", detail?: string) {
    super(`Valuation publication unavailable (${reason})${detail ? `: ${detail}` : ""}`);
    this.name = "PublicationUnavailableError";
  }
}
export type PublicationRow = {
  identity_key: string; generation: number; public_result: unknown; tracking_result: unknown;
  tracking_generation: number | null; publication_status: "pending" | "confirmed";
  safety: Omit<SafetyState, "identityKey">;
  public_record?:unknown; public_verdict?:ValuationRun["verdict"]; public_currency?:string;
  public_suppression?:string;
  public_expectations?:ValuationRun["expectations"]; public_methods?:ValuationRun["methods"]; public_moat_cap?:MoatCapAssessment;

};
type DirectoryRow = {
  identity_key: string; ticker: string; identity: SecurityIdentity; is_current: boolean;
  valuation_publication: PublicationRow | null;
};

/** Empty ticker list is reserved for full-universe screens; explicit key batches use <=100 IDs. */
async function readRows(filter: "ticker" | "identity_key", keys: string[], all = false, compact = false): Promise<DirectoryRow[]> {
  if (!all && !keys.length) return [];
  if (!hasSupabaseEnv()) throw new PublicationUnavailableError("not_configured");
  const batches = all ? [null] : Array.from({length: Math.ceil(keys.length / 100)}, (_, i) => keys.slice(i * 100, i * 100 + 100));
  const out: DirectoryRow[] = [];
  try {
    for (const batch of batches) {
      const {data,error} = await selectAllPages<DirectoryRow>(() => {
        const projection=compact ? "identity_key,ticker,identity,is_current,valuation_publication(identity_key,generation,tracking_result,tracking_generation,publication_status,safety,public_record:public_result->record,public_suppression:public_result->presentation->suppressedReason,public_verdict:public_result->presentation->verdict,public_currency:public_result->presentation->currency,public_expectations:public_result->presentation->expectations,public_methods:public_result->presentation->methods,public_moat_cap:public_result->presentation->oeDcf->moatCap)" : "identity_key,ticker,identity,is_current,valuation_publication(identity_key,generation,public_result,tracking_result,tracking_generation,publication_status,safety)";
        let q = getDb().from("tracking_securities").select(projection);
        if (filter === "ticker") q = q.eq("is_current",true);
        if (batch) q = q.in(filter,batch);
        return q.order("identity_key").returns<DirectoryRow[]>();
      }, 1000, error => !isMissingTableError(error as {code?: string}));
      if (error) throw new PublicationUnavailableError(isMissingTableError(error as {code?:string}) ? "schema_missing" : "database_unavailable", error.message);
      out.push(...data);
    }
    return out;
  } catch (error) {
    if (error instanceof PublicationUnavailableError) throw error;
    throw new PublicationUnavailableError("database_unavailable",error instanceof Error ? error.message : String(error));
  }
}
function identityReasons(row: DirectoryRow): string[] {
  const resolved = resolveTrackingIdentity(row.identity);
  return !row.is_current || isIdentityQuarantined(row.ticker) || !resolved || resolved.key !== row.identity_key || resolved.ticker !== row.ticker
    ? ["identity_unconfirmed"] : [];
}
function recordReasons(record: TrackingRecord | null, row: DirectoryRow, now: Date): string[] {
  if (!record) return ["missing_tracking_contract"];
  const reasons = [...record.reasons];
  if (record.status !== "valid") reasons.push(`valuation_${record.status}`);
  if (record.modelVersion !== VALUATION_MODEL_VERSION) reasons.push("model_changed");
  if (record.identity.key !== row.identity_key || record.identity.ticker !== row.ticker ||
    (["figi","cik","cusip","securityType"] as const).some(key => record.identity[key] !== row.identity[key])) reasons.push("identity_changed");
  if (!record.priceDate || isPriceStale(record.priceDate,now)) reasons.push("price_stale");
  if (isFundamentalsStale(record.fundamentalAsOf,now.toISOString())) reasons.push("fundamentals_stale");
  if (record.rangeLo != null && record.rangeHi != null && record.price != null && isImplausibleBand({rangeLo:record.rangeLo,rangeHi:record.rangeHi,price:record.price,marginPct:record.marginPct})) reasons.push("implausible_valuation");
  return [...new Set(reasons)];
}
function storedSafety(row: DirectoryRow): string[] {
  const safety = row.valuation_publication?.safety;
  if (!safety || !["valid","pending","invalid"].includes(safety.status) || !Array.isArray(safety.reasons) || !Number.isFinite(Date.parse(safety.observedAt))) return ["safety_unavailable"];
  return safety.status === "valid" ? [] : safety.reasons.length ? safety.reasons : [`safety_${safety.status}`];
}
function publicValue(row: DirectoryRow): PublishedValuation | null {
  const raw = row.valuation_publication?.public_result as PublishedValuation | null;
  const record = parseTrackingRecord(raw?.record);
  const run = raw?.presentation;
  const verdict = run?.verdict;
  if (!record || !run || run.currency !== record.currency || !verdict || run.suppressedReason) return null;
  // Verify paired presentation rather than trusting a separately written legacy numeric projection.
  if ((["intrinsicValue","referenceValue","referenceKind","rangeLo","rangeHi","price","priceDate","marginPct","requiredMargin","strikePrice"] as const)
    .some(key => verdict[key] !== record[key])) return null;
  if (record.status === "valid" && (!verdict.reliable || verdict.inStrikeZone !== record.inStrikeZone)) return null;
  return {record,presentation:run};
}
function publicPendingReason(reason: string, verdict: ValuationRun["verdict"]): boolean {
  return ["unreliable_valuation", "valuation_pending"].includes(reason) ||
    verdict?.referenceOnly === "missing_reinvestment" && ["missing_reinvestment", "missing_margin"].includes(reason);
}
export async function readPublicValuations(tickers: string[]): Promise<Map<string,PublishedValuation>> {
  const keys = [...new Set(tickers.map(ticker => ticker.toUpperCase()).filter(Boolean))];
  if (!keys.length) return new Map();
  return publicMap(await readRows("ticker",keys));
}
function publicMap(rows: DirectoryRow[]): Map<string,PublishedValuation> {
  const out = new Map<string,PublishedValuation>(); const now = new Date();
  for (const row of rows) {
    const value = publicValue(row);
    if (!value || identityReasons(row).length) continue;
    const reasons=[...storedSafety(row),...recordReasons(value.record,row,now)];
    // Preserve the existing explicitly pending presentation (never a confirmed opportunity).
    // Only the current paired unreliable result may be shown; stale/invalid old results stay closed.
    if (reasons.some(reason=>!publicPendingReason(reason, value.presentation.verdict) )) continue;
    out.set(row.ticker,value);
  }
  return out;
}
/** All public counts, ordering and screen membership derive from this same filtered collection. */
function summaryMap(rows:DirectoryRow[]):Map<string,PublishedValuationSummary> {
  const out=new Map<string,PublishedValuationSummary>(); const now=new Date();
  for (const row of rows) {
    const p=row.valuation_publication;
    if (!p) continue;
    const record=parseTrackingRecord(p.public_record);
    const verdict=p.public_verdict;
    if (!record || !verdict || p.public_suppression || p.public_currency !== record.currency || !p.public_expectations || !p.public_methods || identityReasons(row).length) continue;
    if ((["intrinsicValue","referenceValue","referenceKind","rangeLo","rangeHi","price","priceDate","marginPct","requiredMargin","strikePrice"] as const).some(key=>verdict[key] !== record[key])) continue;
    if (record.status === "valid" && (!verdict.reliable || verdict.inStrikeZone !== record.inStrikeZone)) continue;
    if ([...storedSafety(row),...recordReasons(record,row,now)].some(reason=>!publicPendingReason(reason, verdict))) continue;
    out.set(row.ticker,{record,verdict,expectations:p.public_expectations,methods:p.public_methods,moatCap:p.public_moat_cap});
  }
  return out;
}
export const readAllPublicValuationSummaries = cache(async ():Promise<Map<string,PublishedValuationSummary>> =>
  summaryMap(await readRows("ticker",[],true,true)));
export async function readPublicValuationSummaries(tickers:string[]):Promise<Map<string,PublishedValuationSummary>> {
  return summaryMap(await readRows("ticker",[...new Set(tickers.map(ticker=>ticker.toUpperCase()).filter(Boolean))],false,true));
}
export async function readTrackingValuations(securityKeys: string[]): Promise<Map<string,TrackingRecord>> {
  const rows = await readRows("identity_key",[...new Set(securityKeys)],false,true);
  const out = new Map<string,TrackingRecord>(); const now = new Date();
  for (const row of rows) {
    const publication = row.valuation_publication;
    const record = parseTrackingRecord(publication?.tracking_result);
    if (!record || !record.publishedAt || !publication?.tracking_generation || identityReasons(row).length || storedSafety(row).length || recordReasons(record,row,now).length) continue;
    // publication_status=pending is normal: the previous confirmed generation remains reliable.
    out.set(row.identity_key,record);
  }
  return out;
}
export async function readValuationSafety(tickers: string[]): Promise<Map<string,SafetyState>> {
  const keys = [...new Set(tickers.map(ticker => ticker.toUpperCase()).filter(Boolean))];
  const rows = await readRows("ticker",keys,false,true);
  return safetyMap(rows, keys);
}
function safetyMap(rows: DirectoryRow[], keys: string[]): Map<string,SafetyState> {
  const now = new Date(); const out = new Map<string,SafetyState>();
  for (const row of rows) {
    const publication = row.valuation_publication;
    const record = parseTrackingRecord(publication?.public_record);
    const identityFailure=identityReasons(row);
    const confirmed=parseTrackingRecord(publication?.tracking_result);
    const checkedReasons=[...identityFailure,
      ...(publication?.public_record ? recordReasons(record,row,now) : []),
      ...(publication?.tracking_result ? recordReasons(confirmed,row,now) : [])];
    const safetyReasons=storedSafety(row);
    const reasons=[...new Set([...checkedReasons,...safetyReasons])];
    const invalid=checkedReasons.length>0 || publication?.safety.status === "invalid" || safetyReasons.includes("safety_unavailable");
    const pending=publication?.publication_status === "pending" || publication?.safety.status === "pending" || !record ||
      publication?.tracking_generation !== publication?.generation || confirmed?.revisionId !== record?.revisionId;
    out.set(row.ticker,{identityKey:row.identity_key,status:invalid ? "invalid" : pending ? "pending" : "valid",
      reasons:reasons.length ? reasons : pending ? ["publication_pending"] : [],observedAt:now.toISOString()});
  }
  for (const ticker of keys) if (!out.has(ticker)) out.set(ticker,{identityKey:null,status:"pending",reasons:["identity_unconfirmed"],observedAt:now.toISOString()});
  return out;
}

/** Public API tuple is derived from one joined row snapshot, never two racing reads. */
export async function readPublicValuationStates(tickers: string[]): Promise<Map<string, SafetyState & {revisionId: string | null}>> {
  const keys = [...new Set(tickers.map(ticker => ticker.toUpperCase()).filter(Boolean))];
  const rows = await readRows("ticker", keys, false, true);
  const values = summaryMap(rows);
  return new Map([...safetyMap(rows, keys)].map(([ticker, safety]) => [ticker, {
    ...safety, revisionId: values.get(ticker)?.record.revisionId ?? null,
  }]));
}
