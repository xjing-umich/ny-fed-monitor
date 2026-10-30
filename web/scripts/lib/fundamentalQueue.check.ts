import assert from "node:assert/strict";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import {
  prepareFundamentalQueue,
  refreshFundamentalQueue,
} from "./fundamentalPublication";

async function main() {
  const state = [{ ticker: "MSFT", content_fingerprint: "financial-a" }];
  const first = prepareFundamentalQueue([], state, ["MSFT"], "generation-1");
  assert.equal(first.length, 1);
  assert.equal(first[0].pending, true);
  assert.equal(first[0].generation, "generation-1");
  assert.deepEqual(
    prepareFundamentalQueue(first, state, ["MSFT"], "generation-2"),
    [],
    "retries preserve the unacknowledged generation",
  );
  assert.deepEqual(
    prepareFundamentalQueue(
      [{ ...first[0], pending: false }],
      state,
      ["MSFT"],
      "generation-2",
    ),
    [],
    "unchanged published content does not invalidate daily",
  );
  assert.equal(
    prepareFundamentalQueue(
      first,
      [{ ticker: "MSFT", content_fingerprint: "financial-b" }],
      ["MSFT"],
      "generation-2",
    )[0].generation,
    "generation-2",
  );
  assert.deepEqual(
    prepareFundamentalQueue([], state, [], "generation"),
    [],
    "failed ingests never publish",
  );

  let rows = [...first, { ...first[0], ticker: "GOOG" }];
  let writes = 0;
  const db = createClient("https://queue.invalid", "fixture", {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (init?.method !== "PATCH") return Response.json(rows);
        writes++;
        const generation = url.searchParams.get("generation")!.slice(3);
        const tickers = url.searchParams.get("ticker")!.slice(4, -1).split(",");
        const matched = rows.filter(
          (r) =>
            r.pending &&
            r.generation === generation &&
            tickers.includes(r.ticker),
        );
        rows = rows.map((r) =>
          matched.includes(r) ? { ...r, pending: false } : r,
        );
        return new Response(null, {
          status: 204,
          headers: { "content-range": `*/${matched.length}` },
        });
      },
    },
  });
  await assert.rejects(
    refreshFundamentalQueue(db, async () => {
      throw new Error("HTTP refresh failed");
    }),
    /HTTP refresh failed/,
  );
  assert.equal(writes, 0, "failed refresh retains durable intent");
  assert.equal(
    await refreshFundamentalQueue(db, async (tickers) => {
      assert.deepEqual(tickers, ["MSFT", "GOOG"]);
      rows[1] = { ...rows[1], generation: "generation-2" };
    }),
    1,
    "old refresh cannot acknowledge a concurrent newer financial generation",
  );
  assert.equal(rows[0].pending, false);
  assert.equal(rows[1].pending, true);
  assert.equal(
    await refreshFundamentalQueue(db, async (tickers) => {
      assert.deepEqual(tickers, ["GOOG"]);
    }),
    1,
  );
  assert.equal(rows[1].pending, false);
  console.log("durable fundamental publication queue and retry checks OK");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
