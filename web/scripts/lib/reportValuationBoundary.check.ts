import assert from "node:assert/strict";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { loadReportInput } from "./loadReportInput";
import { VALUATION_MODEL_VERSION } from "../../src/lib/valuation/modelVersion";
async function main() {
  let snapshots = 0;
  const db = createClient("https://report.invalid", "fixture", {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        if (!url.pathname.endsWith("/valuation_snapshot"))
          return Response.json([]);
        snapshots++;
        assert.equal(
          url.searchParams.get("payload->>model_version"),
          `eq.${VALUATION_MODEL_VERSION}`,
        );
        assert.equal(
          url.searchParams.get("payload->>assessment_status"),
          "eq.valid",
        );
        assert.ok(
          url.searchParams.getAll("ticker").includes("not.in.(SATS)"),
          "reports must exclude quarantined valuation identities",
        );
        return Response.json([]);
      },
    },
  });
  const result = await loadReportInput(db, "2026-09-30");
  assert.equal(
    snapshots,
    2,
    "both bargains and availability use the safety guards",
  );
  assert.equal(result.input.valuationAvailable, false);
  console.log("report valuation boundary checks OK");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
