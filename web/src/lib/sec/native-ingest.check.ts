import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { ingestCompany, prepareCompanyFundamentals } from "./ingest";
process.env.SEC_USER_AGENT = "Compounder fixture tests test@example.com";
const fixture = (name: string) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const submissions = JSON.parse(fixture("nicm-submissions.json"));
const match = { ticker: "NICM", normalizedTicker: "NICM", cik: "0001526475", companyName: "NICOLA MINING INC." };
let factsStatus = 404, failNativeWrite = false, missingMigration = false;
const xml = fixture("nicm-40f.xml");
let directoryFiles = ["nicm-20251231xex99d2.htm", "nicm-20251231x40f_htm.xml", "FilingSummary.xml"];
const writes: { table: string; method: string; body: unknown }[] = [];
const nativeUrl = "https://www.sec.gov/Archives/edgar/data/1526475/000110465926049487/nicm-20251231x40f_htm.xml";
const transport: typeof fetch = async (input, init) => {
  const u = new URL(input instanceof Request ? input.url : String(input));
  if (u.hostname.endsWith("sec.gov")) {
    if (u.pathname.endsWith("company_tickers.json")) return Response.json({ 0: { ticker: "NICM", cik_str: 1526475, title: "Nicola Mining Inc." } });
    if (u.pathname.includes("/submissions/")) return Response.json(submissions);
    if (u.pathname.includes("/companyfacts/")) return Response.json({ error: "not available" }, { status: factsStatus });
    if (u.pathname.endsWith("/index.json")) return Response.json({ directory: { item: directoryFiles.map(name => ({ name })) } });
    assert.equal(u.href, nativeUrl, "use SEC directory's extracted instance including financial exhibits");
    return new Response(xml);
  }
  assert.equal(u.hostname, "native-ingest.invalid");
  const table = u.pathname.split("/").at(-1)!;
  const method = init?.method ?? "GET";
  if (method === "GET") {
    if (table === "sec_native_financial_periods" && missingMigration) return Response.json({ message: "native table missing", code: "PGRST205" }, { status: 400 });
    return Response.json(table === "fundamental_publications" ? null : []);
  }
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  writes.push({ table, method, body });
  if (table === "sec_ingest_runs" && method === "POST") return Response.json({ id: "run-1" });
  if (table === "sec_native_financial_periods" && failNativeWrite) return Response.json({ message: "native write failed" }, { status: 400 });
  return new Response(null, { status: 204 });
};
globalThis.fetch = transport;
const db = createClient("https://native-ingest.invalid", "fixture", { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never }, global: { fetch: transport } });
async function main() {
  for (const status of [403, 429, 500]) {
    factsStatus = status;
    await assert.rejects(prepareCompanyFundamentals("NICM", match), new RegExp(`SEC request failed ${status}`));
  }
  factsStatus = 404;
  await assert.rejects(prepareCompanyFundamentals("OTHER", match), /SEC request failed 404/, "404-only fallback remains scoped to audited ticker+CIK");
  const prepared = await prepareCompanyFundamentals("NICM", match);
  assert.equal(prepared.nativePeriods.length, 2);
  assert.equal(prepared.normalized.annual.length, 0, "CAD never enters legacy USD normalizer");
  directoryFiles = ["../untrusted_htm.xml"];
  await assert.rejects(prepareCompanyFundamentals("NICM", match), /instance unavailable/);
  directoryFiles = ["first_htm.xml", "second_htm.xml"];
  await assert.rejects(prepareCompanyFundamentals("NICM", match), /instance unavailable/, "ambiguous extracted instances cannot silently choose a file");
  directoryFiles = ["nicm-20251231x40f_htm.xml"];
  for (const mode of ["missing", "write-failed", "success"]) {
    writes.length = 0;
    missingMigration = mode === "missing"; failNativeWrite = mode === "write-failed";
    const result = await ingestCompany("NICM", db);
    assert.equal(result.status, mode === "success" ? "success" : "failed");
    assert.equal(writes.some(w => w.table.startsWith("company_fundamentals")), false, "no native values or deletion in legacy USD tables");
    const finished = writes.find(w => w.table === "sec_ingest_runs" && w.method === "PATCH")!;
    assert.equal((finished.body as { status: string }).status, mode === "success" ? "success" : "failed");
    const published = writes.filter(w => w.table === "fundamental_publications");
    assert.equal(published.length, mode === "success" ? 1 : 0, "failed native writes cannot publish/ack success");
    if (mode === "missing") assert.equal(writes.some(w => w.table === "sec_companies"), false, "schema gate precedes financial mutation");
    if (mode === "success") {
      assert.equal(result.quality_status, "native_currency");
      assert.equal(result.saved.native_annual_periods, 2);
      assert.deepEqual(result.valuation_blockers, ["fx_conversion_required", "adr_conversion_required"]);
      const rows = writes.find(w => w.table === "sec_native_financial_periods")!.body as { reporting_currency: string; revenue: number; source_instance_url: string }[];
      assert.equal(rows[0].revenue, 1535138);
      assert.equal(rows[0].reporting_currency, "CAD");
      assert.equal(rows[0].source_instance_url, nativeUrl);
    }
  }
  console.log("native SEC fallback status boundary, persistence and USD isolation checks OK");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
