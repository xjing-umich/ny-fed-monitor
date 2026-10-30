import assert from "node:assert/strict";
import { getDb } from "../../src/lib/managers/db";
import { VALUATION_MODEL_VERSION } from "../../src/lib/valuation/modelVersion";
import { type PublicationSnapshot, prepareSnapshotPublication, readSnapshotPublicationState, refreshSnapshotPublication } from "./valuationPublication";
process.env.SUPABASE_URL = "https://publication.invalid";
process.env.SUPABASE_SERVICE_KEY = "fixture";
const current = (ticker: string, extra: Record<string, unknown> = {}): PublicationSnapshot => ({
  ticker, reliable: true, in_strike_zone: true, verdict_bucket: "below", updated_at: "2026-04-06T00:00:00Z",
  payload: { model_version: VALUATION_MODEL_VERSION, assessment_status: "valid" }, ...extra,
});
let rows = [current("A"), current("B"), current("C")];
let reads = 0;
let successfulRefresh = false;
let writes = 0;
globalThis.fetch = async (input, init) => {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = init?.method ?? "GET";
  const matched = rows.filter(r => [...u.searchParams].every(([field, filter]) => {
    if (!filter.startsWith("eq.")) return true;
    const val = field.startsWith("payload->>") ? (r.payload as Record<string, unknown>)[field.slice(10)] : r[field as keyof typeof r];
    return String(val) === filter.slice(3);
  }));
  if (method === "PATCH") {
    assert.equal(successfulRefresh, true, "never acknowledge before cache refresh succeeds");
    writes++;
    const patch = JSON.parse(String(init?.body));
    rows = rows.map(r => matched.includes(r) ? { ...r, ...patch } : r);
    return new Response(null, { status: 204, headers: { "content-range": `*/${matched.length}` } });
  }
  reads++;
  // Simulate the real server's 1000-row page limit.
  const from = Number(u.searchParams.get("offset") ?? 0);
  const limit = Number(u.searchParams.get("limit") ?? 1000);
  return Response.json(matched.slice(from, from + limit));
};
async function checks() {
  const db = getDb();
  const old = (await readSnapshotPublicationState(db)).get("A")!;
  assert.equal(prepareSnapshotPublication(current("NEW")).payload.revalidation_pending, true, "first model publication must refresh cached empty lists");
  const downgraded = prepareSnapshotPublication(current("A", { reliable: false }), old);
  assert.equal(downgraded.payload.revalidation_pending, true,
    "a still-present verdict losing reliability must refresh weekday caches");
  assert.equal(prepareSnapshotPublication(current("A", { in_strike_zone: false, verdict_bucket: "within" }), old).payload.revalidation_pending, true,
    "leaving the confirmed cheap region also refreshes cached signals");
  assert.notEqual(prepareSnapshotPublication(current("A"), old).payload.revalidation_pending, true,
    "unchanged safety state does not trigger daily whole-site refresh");
  const priorBasis = current("D", { payload: { model_version: VALUATION_MODEL_VERSION, assessment_status: "valid", fundamental_basis: { kind: "ttm", as_of: "2026-06-30" } } });
  const freshBasis = current("D", { payload: { model_version: VALUATION_MODEL_VERSION, assessment_status: "valid", fundamental_basis: { kind: "ttm", as_of: "2026-09-30" } } });
  assert.equal(prepareSnapshotPublication(freshBasis, priorBasis).payload.revalidation_pending, true, "new financial reporting basis must refresh even if valuation bucket and reliability are unchanged");
  const revisedBasis = current("D", { payload: { ...freshBasis.payload, fundamental_basis: { kind: "ttm", as_of: "2026-09-30", input_hash: "revised-capex" } } });
  assert.equal(prepareSnapshotPublication(revisedBasis, freshBasis).payload.revalidation_pending, true, "same-period financial revisions also refresh");
  rows[0] = downgraded;
  rows[1] = { ...rows[1], payload: { ...rows[1].payload, revalidation_pending: true } };
  const beforeFailure = JSON.stringify(rows);
  await assert.rejects(refreshSnapshotPublication(db, async () => { throw new Error("refresh failed after retries"); }), /refresh failed/);
  assert.equal(JSON.stringify(rows), beforeFailure);
  assert.equal(writes, 0);
  const next = (await readSnapshotPublicationState(db)).get("A")!;
  assert.equal(prepareSnapshotPublication(current("A", { reliable: false }), next).payload.revalidation_pending, true,
    "the next ingest preserves unacknowledged publication intent");
  // A concurrent generation is written after the refresh request began. It must not be acknowledged.
  await refreshSnapshotPublication(db, async () => {
    successfulRefresh = true;
    rows[1] = { ...rows[1], updated_at: "2026-04-07T00:00:00Z" };
  });
  assert.equal(rows[0].payload.revalidation_pending, false);
  assert.equal(rows[1].payload.revalidation_pending, true);
  await refreshSnapshotPublication(db, async () => { successfulRefresh = true; });
  assert.equal(rows[1].payload.revalidation_pending, false);
  assert.equal(rows[0].payload.assessment_status, "valid");
  // Pending invalidations are preserved through recovery too.
  const invalid = { ...old, payload: { ...old.payload, assessment_status: "invalidated", revalidation_pending: true } };
  assert.equal(prepareSnapshotPublication(current("A"), invalid).payload.revalidation_pending, true);
  rows = Array.from({ length: 1205 }, (_, i) => current(String(i)));
  reads = 0;
  assert.equal((await readSnapshotPublicationState(db)).size, 1205);
  assert.equal(reads, 2);
  console.log("valuation safety publication and durable retry checks passed");
}
checks();
