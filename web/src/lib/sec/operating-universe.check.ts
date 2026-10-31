import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { selectOperatingFundamentals } from "./operating-universe";

async function main() {
  const records = [
    ...Array.from({ length: 1000 }, (_, i) => ({ ticker: `A${String(i).padStart(4, "0")}`, security_type: "Common Stock" })),
    { ticker: "SPY", security_type: "ETP" }, { ticker: "DIA", security_type: "ETP" },
    { ticker: "MDY", security_type: "ETP" }, { ticker: "SWZ", security_type: "Closed-End Fund" },
    { ticker: "NICM", security_type: "ADR" }, { ticker: "BMM", security_type: "Common Stock" },
    { ticker: "REIT", security_type: "REIT" }, { ticker: "UNKNOWN", security_type: null },
  ].sort((a,b) => a.ticker.localeCompare(b.ticker));
  let broken = false;
  const db = createClient("https://eligibility.invalid", "fixture", {
    auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never },
    global: { fetch: async input => {
      const u = new URL(String(input));
      assert.equal(u.pathname, "/rest/v1/securities");
      assert.equal(u.searchParams.get("order"), "ticker.asc");
      const from = Number(u.searchParams.get("offset") ?? 0);
      if (broken && from > 0) return Response.json({ message: "classification unavailable" }, { status: 400 });
      return Response.json(records.slice(from, from + Number(u.searchParams.get("limit") ?? 1000)));
    } },
  });
  const input = ["SPY", "BMM", "DIA", "NICM", "MDY", "SWZ", "UNKNOWN", "REIT", "MISSING"];
  const result = await selectOperatingFundamentals(db, input);
  assert.deepEqual(result.eligible, ["BMM", "NICM", "UNKNOWN", "REIT", "MISSING"], "funds after page 1 excluded before rank/limit; unknown/ADR/REIT retained");
  assert.deepEqual(result.excluded.map(x => x.ticker), ["SPY", "DIA", "MDY", "SWZ"]);
  broken = true;
  await assert.rejects(selectOperatingFundamentals(db, input), /classification unavailable/, "partial classification fails closed before ingestion");
  console.log("corporate queue eligibility pagination and failure checks OK");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
