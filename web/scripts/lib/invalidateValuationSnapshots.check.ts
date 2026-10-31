import assert from "node:assert/strict";
import { publicationFixture, projectPublicationFixture } from "../tests/publication-fixture";
import { getDb } from "../../src/lib/managers/db";
import { VALUATION_MODEL_VERSION } from "../../src/lib/valuation/modelVersion";
import { invalidateValuationSnapshots } from "./invalidateValuationSnapshots";
process.env.SUPABASE_URL = "https://snapshot-state.invalid";
process.env.SUPABASE_SERVICE_KEY = "fixture";
let row: Record<string, unknown> = {
  ticker: "A",
  range_lo: 40,
  range_hi: 120,
  price: 50,
  price_date: "2026-10-30",
  margin_pct: 0.5,
  verdict_bucket: "below",
  in_strike_zone: true,
  reliable: true,
  coverage: "full",
  computed_at: "2026-10-30",
  payload: {
    model_version: VALUATION_MODEL_VERSION,
    assessment_status: "valid",
  },
};
let publication=publicationFixture(row);
let deletes = 0;
globalThis.fetch = async (input, init) => {
  const u = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  const method = init?.method ?? "GET";
  if (method === "DELETE") {
    deletes++;
    throw new Error("global destructive cleanup must remain blocked");
  }
  if (u.pathname.endsWith("/consensus_holdings"))
    return Response.json([
      { ticker: "A", issuer: "Issuer A", holder_count: 6 },
    ]);
  if (u.pathname.endsWith("/tracking_securities")) return Response.json([projectPublicationFixture(publication,u.searchParams.get("select"))]);
  if (u.pathname.endsWith("/rpc/invalidate_valuation_publications")) {
    assert.equal(method,"POST");
    const args=JSON.parse(String(init?.body));
    assert.deepEqual(args.p_tickers,["A"]);
    assert.equal(args.p_model_version,VALUATION_MODEL_VERSION);
    if ((row.payload as Record<string,unknown>).assessment_status === "invalidated" &&
      Date.parse(args.p_observed_at)<=Date.parse(publication.valuation_publication.safety.observedAt)) return Response.json(0);
    row={...row,reliable:false,in_strike_zone:false,payload:{...row.payload as Record<string,unknown>,assessment_status:"invalidated",revalidation_pending:true}};
    publication={...publication,valuation_publication:{...publication.valuation_publication,
      safety:{status:"invalid",reasons:["valuation_suppressed"],observedAt:args.p_observed_at}}};
    return Response.json(1);
  }
  let matches = true;
  for (const [field, filter] of u.searchParams) {
    const value = field.startsWith("payload->>")
      ? (row.payload as Record<string, unknown>)[field.slice(10)]
      : row[field];
    if (filter.startsWith("eq.") && String(value) !== filter.slice(3))
      matches = false;
  }
  if (method === "PATCH") {
    if (matches) row = { ...row, ...JSON.parse(String(init?.body)) };
    return new Response(null, {
      status: 204,
      headers: { "content-range": `*/${matches ? 1 : 0}` },
    });
  }
  if (method === "HEAD")
    return new Response(null, {
      status: 200,
      headers: { "content-range": `*/${matches ? 1 : 0}` },
    });
  return Response.json(matches ? [row] : []);
};
async function checks() {
  const readers = await import("../../src/lib/valuation/valuationSnapshot");
  assert.equal(
    (await readers.readValuationVerdicts(["A"])).size,
    1,
    "first run publishes a current reliable snapshot",
  );
  // A second run discovers an evidence gap while global delete cleanup is held.
  const count = await invalidateValuationSnapshots(
    getDb(),
    ["A"],
    "2026-10-31T00:00:00Z",
  );
  assert.equal(count, 1);
  assert.equal(deletes, 0);
  assert.equal(row.reliable, false);
  assert.equal((row.payload as Record<string, unknown>).revalidation_pending, true,
    "cache refresh intent persists until a successful publication acknowledgement");
  assert.equal(row.in_strike_zone, false);
  assert.equal((await readers.readValuationVerdicts(["A"])).size, 0);
  assert.equal((await readers.readBargainVerdicts()).size, 0);
  const leaders = await readers.readStrikeZoneLeaders(5);
  assert.equal(leaders.total, 0);
  assert.equal(leaders.leaders.length, 0);
  assert.equal((await readers.readValuationScreen("all")).rows.length, 0);
  assert.equal((await readers.readConvictionScreen()).rows.length, 0);
  assert.equal(
    await invalidateValuationSnapshots(getDb(), ["A"], "2026-10-31T00:00:00Z"),
    0,
    "exact duplicate invalidation does not trigger repeated cache refreshes",
  );
  assert.equal(await invalidateValuationSnapshots(getDb(), ["A"], "2026-11-01T00:00:00Z"),1,
    "newer revocation is a changed safety observation even when already invalid");
  assert.equal((await readers.readValuationVerdicts(["A"])).size,0);
  assert.equal(await invalidateValuationSnapshots(getDb(), ["A"], "2026-11-01T00:00:00Z"),0);
  console.log("two-run snapshot invalidation checks passed (duplicate and newer revocation)");
}
checks();
