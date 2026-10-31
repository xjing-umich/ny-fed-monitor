import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SecurityIdentity } from "../securities/trackingIdentity";
import { resolveTrackingIdentity } from "../securities/trackingIdentity";
import { buildTrackingRecord, type TrackingContext } from "./trackingContract";
import type { RunValuationInput, ValuationRun } from "./runValuation";
import { VALUATION_MODEL_VERSION } from "./modelVersion";
import { PublicationUnavailableError, type PublishedValuation, type SafetyState } from "./publishedRead";
import { isMissingTableError } from "../managers/db";

/** Materialize the very input passed to runValuation, before discarding it. Undefined optional
 * properties mean the engine's default, so JSON normalization removes only those absent values.
 * No runtime asOf or quote participates in a non-price fingerprint.
 */
export function buildPublishedValuation(run: ValuationRun, input: RunValuationInput,
  provenance: Omit<TrackingContext,"modelVersion" | "currency" | "nonPriceInputs" | "publishedAt"> & {shareBasis: unknown},
): PublishedValuation {
  const json = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === "number" && !Number.isFinite(item)) throw new Error("Publication inputs must be finite");
    return item;
  }));
  const record = buildTrackingRecord(run, {
    ...provenance, modelVersion:VALUATION_MODEL_VERSION,currency:run.currency,publishedAt:null,
    nonPriceInputs:{
      fundamentals:json(input.floorInput),
      assumptions:json({dgs10:input.dgs10,modelVersion:VALUATION_MODEL_VERSION,suppressExpectations:input.suppressExpectations ?? false}),
      shareBasis:json(provenance.shareBasis),
    },
  });
  return {record,presentation:json(run)};
}
/** Controlled writer only; generation conflicts must be recomputed from current state, never blindly retried. */
export async function writeValuationPublication(db: SupabaseClient, args: {
  identity: SecurityIdentity; expectedGeneration: number; candidate?: PublishedValuation | null;
  safety?: Omit<SafetyState,"identityKey"> | null;
}): Promise<number> {
  if (resolveTrackingIdentity(args.identity)?.key !== args.identity.key) throw new Error("Unverified publication identity");
  const {data,error} = await db.rpc("write_valuation_publication",{
    p_identity:args.identity,p_expected_generation:args.expectedGeneration,
    p_public_result:args.candidate ?? null,p_safety:args.safety ?? null,
  });
  if (error) {
    if (isMissingTableError(error) || error.code === "PGRST202" || error.code === "42883") throw new PublicationUnavailableError("schema_missing",error.message);
    const failure=new Error(`Valuation publication write failed (${error.code}): ${error.message}`);
    failure.name="PublicationWriteError";
    throw failure;
  }
  if (!Number.isSafeInteger(data) || data < 1) throw new Error("Invalid publication generation returned");
  return data;
}
export async function readPublicationWriteState(db: SupabaseClient): Promise<Map<string,{identity:SecurityIdentity;generation:number}>> {
  const out = new Map<string,{identity:SecurityIdentity;generation:number}>();
  for (let from=0;;from+=1000) {
    const {data,error} = await db.from("tracking_securities").select("ticker,identity,valuation_publication(generation)").eq("is_current",true).order("identity_key").range(from,from+999);
    if (error) throw new PublicationUnavailableError(isMissingTableError(error)?"schema_missing":"database_unavailable",error.message);
    for (const row of data ?? []) {
      const publication = row.valuation_publication as unknown as {generation:number} | null;
      out.set(row.ticker,{identity:row.identity as SecurityIdentity,generation:publication?.generation ?? 0});
    }
    if (!data || data.length<1000) return out;
  }
}
