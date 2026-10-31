import assert from "node:assert/strict";
import { resolveTrackingIdentity } from "./trackingIdentity";

const meta = {
  ticker: "GOOG", figi: "BBG009S3NB30", cik: "1652044", cusip: "02079K107",
  securityType: "Common Stock", source: "openfigi+sec", checkedAt: "2026-10-30",
};
assert.equal(resolveTrackingIdentity(meta)?.key, "figi:BBG009S3NB30");
assert.equal(resolveTrackingIdentity({ ...meta, ticker: " goog " })?.ticker, "GOOG");
assert.equal(resolveTrackingIdentity({ ...meta, ticker: "SATS" }), null, "quarantine blocks even otherwise complete identity");
const fallback = resolveTrackingIdentity({ ...meta, figi: null });
assert.equal(fallback?.key, "sec:0001652044:Common%20Stock:02079K107");
assert.notEqual(fallback?.key, resolveTrackingIdentity({ ...meta, ticker: "GOOGL", figi: null, cusip: "02079K305" })?.key,
  "same issuer's share classes must not share identity");
assert.equal(resolveTrackingIdentity({ ...meta, figi: null, cusip: null }), null, "CIK and generic stock type do not identify a share class");
assert.equal(resolveTrackingIdentity({ ...meta, figi: null, cik: null }), null);
assert.equal(resolveTrackingIdentity({ ...meta, figi: null, securityType: "" }), null);
assert.equal(resolveTrackingIdentity({ ...meta, figi: null, cik: null, cusip: null }), null);
assert.equal(resolveTrackingIdentity({ ...meta, verifiedCik: "1920406" }), null, "ticker reused for another issuer");
assert.equal(resolveTrackingIdentity({ ...meta, verifiedCusips: ["02079K305"] }), null, "conflicting class mapping");
assert.equal(resolveTrackingIdentity({ ...meta, source: "" }), null);
assert.equal(resolveTrackingIdentity({ ...meta, checkedAt: "not a date" }), null);
assert.equal(resolveTrackingIdentity({ ...meta, figi: "bad identifier" }), null);

// The actual storage/SEC boundaries use fixtures only; quarantined tickers never reach either boundary.
process.env.SUPABASE_URL = "https://tracking-identity-fixture.invalid";
process.env.SUPABASE_SERVICE_KEY = "fixture-key";
process.env.SEC_USER_AGENT = "Compounder fixture fixture@example.invalid";
let calls = 0;
let fixtureMode = "complete";
globalThis.fetch = async (input) => {
  calls++;
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.pathname.endsWith("company_tickers.json")) return Response.json({ 0: { cik_str: 1652044, ticker: "GOOG", title: "Alphabet" } });
  if (url.pathname.endsWith("/securities")) return Response.json([{ ticker: "GOOG", figi: "BBG009S3NB30", primary_cusip: fixtureMode === "figi_only" ? null : "02079K107", security_type: "Common Stock", source: "openfigi", as_of: "2026-10-29" }]);
  if (url.pathname.endsWith("/sec_companies")) return Response.json([{ cik: fixtureMode === "reused" ? "0001920406" : "0001652044", source: "sec", updated_at: "2026-10-30T10:00:00Z" }]);
  if (url.pathname.endsWith("/security_cusips")) return Response.json(fixtureMode === "figi_only" ? [] : [{ cusip: fixtureMode === "class_conflict" ? "02079K305" : "02079K107", ticker: "GOOG", resolved: true, updated_at: fixtureMode === "old_mapping" ? "2026-10-27T00:00:00Z" : "2026-10-30T00:00:00Z" }]);
  throw new Error(`Unexpected fixture request ${url}`);
};
async function main() {
  const { readTrackingIdentity } = await import("./trackingIdentityRead");
  assert.equal(await readTrackingIdentity("SATS"), null);
  assert.equal(calls, 0);
  const identity = await readTrackingIdentity("goog");
  assert.equal(identity?.key, "figi:BBG009S3NB30");
  assert.equal(identity?.checkedAt, "2026-10-29", "source date, not read time");
  fixtureMode = "old_mapping";
  assert.equal((await readTrackingIdentity("GOOG"))?.checkedAt, "2026-10-27", "CUSIP supporting source date is preserved too");
  fixtureMode = "reused";
  assert.equal(await readTrackingIdentity("GOOG"), null, "reader rejects issuer mismatch");
  fixtureMode = "class_conflict";
  assert.equal(await readTrackingIdentity("GOOG"), null, "reader rejects security-class mismatch");
  fixtureMode = "figi_only";
  assert.equal((await readTrackingIdentity("GOOG"))?.key, "figi:BBG009S3NB30", "confirmed FIGI does not require CUSIP");
  console.log("trackingIdentityRead fixture checks OK");
}
assert.equal(resolveTrackingIdentity({ ...meta, checkedAt: "2026-02-30" }), null, "impossible source date must not roll over");
assert.equal(resolveTrackingIdentity({ ...meta, cusip: "2079K107", figi: null })?.cusip, "02079K107", "stored 13F CUSIPs can omit leading zero");

console.log("trackingIdentity.check.ts OK");
main().catch((error) => { console.error(error); process.exitCode = 1; });
