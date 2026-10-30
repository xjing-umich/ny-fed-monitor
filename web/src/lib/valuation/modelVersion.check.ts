import assert from "node:assert/strict";
// Exercise the real Supabase query builder with a transport that models SQL filtering.
process.env.SUPABASE_URL = "https://valuation-evidence.invalid";
process.env.SUPABASE_SERVICE_KEY = "fixture-service-key";
const seen: URL[] = [];
const unfiltered: URL[] = [];
globalThis.fetch = async (input, init) => {
  const u = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  seen.push(u);
  if (u.pathname.endsWith("/valuation_snapshot")) {
    if (!u.searchParams.has("payload->>model_version") || u.searchParams.get("payload->>assessment_status") !== "eq.valid") unfiltered.push(u);
    return new Response(init?.method === "HEAD" ? null : "[]", {
      status: 200,
      headers: { "content-type": "application/json", "content-range": "*/0" },
    });
  }
  return new Response(
    u.pathname.endsWith("/consensus_holdings")
      ? JSON.stringify([
          { ticker: "NEW", issuer: "New issuer", holder_count: 3 },
        ])
      : "[]",
    { status: 200, headers: { "content-type": "application/json" } },
  );
};
async function checks() {
  const m = await import("./valuationSnapshot");
  await m.readValuationVerdicts(["OLD", "NEW"]);
  await m.readBargainVerdicts();
  await m.readStrikeZoneLeaders(5);
  const rows = await m.readValuationScreen("all");
  await m.readConvictionScreen();
  assert.equal(
    unfiltered.length,
    0,
    "batch, count, leaders, all screener and conviction requests must filter model version in SQL before limit",
  );
  assert.ok(rows);
  assert.ok(
    seen.filter((u) => u.pathname.endsWith("/valuation_snapshot")).length >= 5,
    "batch, count, leader and screener paths are exercised",
  );
  console.log("snapshot SQL version filtering checks passed");
}
checks();
