import assert from "node:assert/strict";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { ingestCompany } from "./ingest";
import { publishFinancialPages } from "./publishPages";
import type { FundamentalPublication } from "./fundamentalPublication";
process.env.SEC_USER_AGENT = "Compounder fixture tests test@example.com";
let queue: FundamentalPublication | null = null;
let failQueueRead = false,
  failQueueWrite = false;
let financialWrites = 0,
  queueWrites = 0,
  revenue = 100;
const transport: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname.endsWith("sec.gov")) {
    if (url.pathname.endsWith("company_tickers.json"))
      return Response.json({
        0: { ticker: "MSFT", cik_str: 1, title: "Fixture" },
      });
    if (url.pathname.includes("/submissions/"))
      return Response.json({
        cik: "1",
        name: "Fixture",
        fiscalYearEnd: "0630",
        filings: {
          recent: {
            accessionNumber: [],
            filingDate: [],
            reportDate: [],
            form: [],
            primaryDocument: [],
          },
        },
      });
    assert.ok(
      url.pathname.includes("/companyfacts/"),
      "no unmocked external requests",
    );
    return Response.json({
      cik: 1,
      entityName: "Fixture",
      facts: {
        "us-gaap": {
          Revenues: {
            units: {
              USD: [
                {
                  start: "2025-07-01",
                  end: "2026-06-30",
                  val: revenue,
                  fy: 2026,
                  form: "10-K",
                  filed: "2026-07-25",
                },
              ],
            },
          },
        },
      },
    });
  }
  assert.equal(url.hostname, "ingest.invalid");
  const table = url.pathname.split("/").at(-1);
  const method = init?.method ?? "GET";
  if (table === "fundamental_publications") {
    if (method === "GET") {
      if (failQueueRead)
        return Response.json({ message: "queue unavailable" }, { status: 400 });
      return Response.json(
        url.searchParams.has("ticker") ? queue : queue ? [queue] : [],
      );
    }
    if (failQueueWrite)
      return Response.json({ message: "queue write failed" }, { status: 400 });
    if (method === "POST") {
      queue = JSON.parse(String(init?.body))[0];
      queueWrites++;
    }
    if (method === "PATCH" && queue) queue = { ...queue, pending: false };
    return new Response(null, {
      status: 204,
      headers: { "content-range": "*/1" },
    });
  }
  if (table === "sec_ingest_runs" && method === "POST")
    return Response.json({ id: "run-1" });
  if (table?.startsWith("company_fundamentals") || table === "sec_companies")
    financialWrites++;
  return new Response(null, { status: 204 });
};
globalThis.fetch = transport;
const db = createClient("https://ingest.invalid", "fixture", {
  auth: { persistSession: false },
  realtime: { transport: WebSocket as unknown as never },
  global: { fetch: transport },
});
async function main() {
  failQueueRead = true;
  assert.equal((await ingestCompany("MSFT", db)).status, "failed");
  assert.equal(
    financialWrites,
    0,
    "missing queue migration fails before financial mutation",
  );
  failQueueRead = false;
  assert.equal((await ingestCompany("MSFT", db)).status, "success");
  assert.equal(
    queueWrites,
    1,
    "shared ingestion used by cron/API/CLI persists refresh intent",
  );
  assert.ok(queue?.pending);
  const generation = queue!.generation;
  assert.equal((await ingestCompany("MSFT", db)).status, "success");
  assert.equal(queueWrites, 1, "unchanged retries preserve pending generation");
  assert.equal(queue!.generation, generation);
  revenue = 120;
  assert.equal((await ingestCompany("MSFT", db)).status, "success");
  assert.equal(
    queueWrites,
    2,
    "same-period financial correction queues a new generation",
  );
  assert.notEqual(queue!.generation, generation);
  const paths: string[] = [];
  assert.equal(
    await publishFinancialPages(db, (path) => {
      paths.push(path);
    }),
    1,
  );
  assert.ok(
    paths.includes("/en/stocks/MSFT") && paths.includes("/zh/stocks/MSFT"),
  );
  assert.equal(queue!.pending, false);
  revenue = 130;
  failQueueWrite = true;
  assert.equal(
    (await ingestCompany("MSFT", db)).status,
    "failed",
    "failed queue writes never report successful ingestion",
  );
  console.log("shared SEC ingestion and server publication boundary checks OK");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
