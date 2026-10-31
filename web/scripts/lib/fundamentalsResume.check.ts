import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { parseResumeSince, readCompletedFundamentals, remainingFundamentals } from "./fundamentalsResume";

async function main() {
  const now = Date.parse("2026-10-30T19:00:00Z");
  assert.equal(parseResumeSince(undefined, now), undefined);
  assert.equal(parseResumeSince("  ", now), undefined);
  assert.equal(parseResumeSince("2026-10-30T17:04:06Z", now), "2026-10-30T17:04:06.000Z");
  for (const bad of ["yesterday", "2026-02-30T12:00:00Z", "2026-10-31T00:00:00Z", "2026-10-28T00:00:00Z", "2026-10-30"]) {
    assert.throws(() => parseResumeSince(bad, now), /resume/i, `reject unsafe resume boundary: ${bad}`);
  }

  const records = [
    { id: "a2", ticker: "FAILED", status: "failed", started_at: "2026-10-30T18:00:00Z", run_type: "company" },
    { id: "a1", ticker: "FAILED", status: "success", started_at: "2026-10-30T17:30:00Z", run_type: "company" },
    { id: "b1", ticker: "RUNNING", status: "running", started_at: "2026-10-30T18:00:00Z", run_type: "company" },
    { id: "c1", ticker: "OLD", status: "success", started_at: "2026-10-30T16:00:00Z", run_type: "company" },
    { id: "d1", ticker: "OTHER", status: "success", started_at: "2026-10-30T18:00:00Z", run_type: "other" },
    { id: "e1", ticker: "mixed", status: "success", started_at: "2026-10-30T17:30:00Z", run_type: "company" },
    { id: "e2", ticker: "MIXED", status: "running", started_at: "2026-10-30T18:00:00Z", run_type: "company" },
    ...Array.from({ length: 1003 }, (_, i) => ({ id: `s${i}`, ticker: `S${String(i).padStart(4, "0")}`, status: "success", started_at: "2026-10-30T18:00:00Z", run_type: "company" })),
  ];
  let requests = 0;
  let failLaterPage = false;
  const db = createClient("https://resume.invalid", "fixture", {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
    global: { fetch: async input => {
      requests++;
      const url = new URL(String(input));
      assert.equal(url.pathname, "/rest/v1/sec_ingest_runs");
      const q = url.searchParams;
      assert.equal(q.get("run_type"), "eq.company");
      assert.equal(q.get("started_at"), "gte.2026-10-30T17:04:06.000Z");
      const from = Number(q.get("offset") ?? "0");
      if (failLaterPage && from > 0) return Response.json({ message: "fixture unavailable", code: "XX000" }, { status: 500 });
      let rows = records.filter(r => r.run_type === "company" && r.started_at >= "2026-10-30T17:04:06.000Z");
      // Honour the emitted query: filtering success first must expose the newer-failure bug.
      if (q.get("status") === "eq.success") rows = rows.filter(r => r.status === "success");
      const order = (q.get("order") ?? "").split(",").map(s => s.split("."));
      rows.sort((a, b) => {
        for (const [key, direction] of order) {
          const x = String(a[key as keyof typeof a] ?? "").localeCompare(String(b[key as keyof typeof b] ?? ""));
          if (x) return direction === "desc" ? -x : x;
        }
        return 0;
      });
      return Response.json(rows.slice(from, from + Number(q.get("limit") ?? "1000")));
    } },
  });
  assert.equal((await readCompletedFundamentals(db, undefined)).size, 0);
  assert.equal(requests, 0, "default full ingestion never consults a resume journal");
  const done = await readCompletedFundamentals(db, "2026-10-30T17:04:06.000Z");
  assert.equal(done.size, 1003, "read completed tickers beyond the first PostgREST page");
  assert.ok(done.has("S1002"));
  assert.equal(done.has("MIXED"), false, "case-normalized tickers still use their latest attempt");
  assert.deepEqual(remainingFundamentals(["FAILED", "RUNNING", "OLD", "OTHER", "MISSING", "S0000", "s1002"], done), ["FAILED", "RUNNING", "OLD", "OTHER", "MISSING"]);
  failLaterPage = true;
  await assert.rejects(readCompletedFundamentals(db, "2026-10-30T17:04:06.000Z"), /resume.*unavailable/i, "a partial journal cannot silently skip work");
  console.log("fundamentals resume boundary, latest-attempt and pagination checks OK");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
