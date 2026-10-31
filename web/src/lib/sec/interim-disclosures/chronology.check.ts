import assert from "node:assert/strict";
import { discoverInterimDisclosures, filingsForInterimDiscovery } from "./discovery";
import { interimDisclosureData, type StoredInterimDisclosure } from "./store";
import { INTERIM_PARSER_VERSION } from "./parsers";
import type { SecSubmission } from "../company-submissions";
import fs from "node:fs";
import path from "node:path";

const supported = { ticker: "MGA", cik: "0000749098", accession_number: "0001104659-26-120638",
  source_url: "https://www.sec.gov/Archives/edgar/data/749098/000110465926120638/current.htm",
  source_filed_at: "2026-10-30", source_accepted_at: "2026-10-30T19:50:16.000Z",
  parser_version: INTERIM_PARSER_VERSION, status: "supported", financial_document: true,
  report_period_end: "2026-09-30", payload: { current: { end: "2026-09-30" } }, error: null,
} as unknown as StoredInterimDisclosure;
const unresolved = { ...supported, accession_number: "0001104659-26-120352", source_url: supported.source_url.replace("120638", "120352"),
  source_accepted_at: "2026-10-30T10:04:15.000Z", status: "unsupported" as const, payload: null, report_period_end: null };
assert.equal(interimDisclosureData([unresolved, supported]).incomplete, false, "MGA older same-day unsupported report cannot block later verified report forever");
assert.equal(interimDisclosureData([supported, { ...unresolved, source_accepted_at: "2026-10-30T20:00:00Z" }]).incomplete, true, "newer unresolved report still blocks");
assert.equal(interimDisclosureData([supported, { ...unresolved, accession_number: "9999999999-26-999999" }]).incomplete, false, "accession filer prefix is not a chronology clock");
assert.equal(interimDisclosureData([supported, { ...unresolved, source_accepted_at: undefined }]).incomplete, true, "missing acceptance time stays conservative");
assert.equal(interimDisclosureData([{ ...supported, source_accepted_at: undefined }, unresolved]).incomplete, true);
assert.equal(interimDisclosureData([supported, { ...unresolved, source_accepted_at: supported.source_accepted_at }]).incomplete, true, "equal timestamps do not prove ordering");

async function main() {
  const submission: SecSubmission = { cik: "1737806", filings: { recent: {
    accessionNumber: ["0001104659-26-100534", "9999999999-26-999999", "0001104659-26-100533"],
    filingDate: ["2026-08-25", "2026-08-25", "2026-08-25"], reportDate: ["2026-06-30", "2026-08-25", "2026-06-30"],
    form: ["6-K", "4", "6-K"], primaryDocument: ["cover.htm", "owner.xml", "older.htm"],
    acceptanceDateTime: ["2026-08-25T19:00:00Z", "2026-08-25T20:00:00Z", "2026-08-25T10:00:00Z"],
  } } };
  const filings = filingsForInterimDiscovery("PDD", submission);
  assert.equal(filings[1].source_accepted_at, "2026-08-25T10:00:00.000Z", "metadata is joined by accession after form filtering");
  assert.ok(!("source_accepted_at" in (await import("../company-submissions")).normalizeRecentFilings("PDD", submission)[0]), "sec_filings payload keeps its existing schema");
  const doc = fs.readFileSync(path.join(__dirname, "fixtures/pdd-2026-q2.html"), "utf8");
  const oldCached = { ...unresolved, ticker: "PDD", cik: "0001737806", accession_number: filings[1].accession_number,
    source_filed_at: "2026-08-25", source_accepted_at: undefined };
  const currentCached = { ...supported, ticker: "PDD", cik: "0001737806", accession_number: filings[0].accession_number,
    source_filed_at: "2026-08-25", source_accepted_at: undefined, report_period_end: "2026-06-30" };
  const hydrated = await discoverInterimDisclosures("PDD", filings, [oldCached, currentCached], "2026-10-31", {
    json: async () => { throw Error("immutable cache must not refetch"); }, text: async () => { throw Error("immutable cache must not refetch"); },
  });
  assert.equal(hydrated.rows.length, 2, "hydrate both cached rows, even when newer supported filing stops discovery");
  assert.equal(interimDisclosureData(hydrated.rows).incomplete, false, "metadata hydration clears old permanent blocker");
  const reversedAcc = [{ ...filings[0], accession_number: "0000000001-26-000001" }, { ...filings[1], accession_number: "9999999999-26-999999" }];
  const sorted = await discoverInterimDisclosures("PDD", reversedAcc, [], "2026-10-31", { json: async () => ({ directory: { item: [] } }), text: async () => doc });
  assert.equal(sorted.rows[0].accession_number, reversedAcc[0].accession_number, "actual acceptance time outranks unrelated accession prefixes");
  const unknownTimes = await discoverInterimDisclosures("PDD", filings.map(f => ({ ...f, source_accepted_at: null })), [], "2026-10-31", {
    json: async () => ({ directory: { item: [] } }),
    text: async url => url.includes("100534") ? doc : doc.replaceAll("CONDENSED CONSOLIDATED STATEMENTS OF INCOME", "CONDENSED CONSOLIDATED STATEMENTS OF OPERATIONS"),
  });
  assert.ok(unknownTimes.rows.some(r => r.status === "supported") && unknownTimes.rows.some(r => r.status === "unsupported"));
  assert.equal(interimDisclosureData(unknownTimes.rows).incomplete, true, "a supported filing cannot hide unexamined same-day documents with missing chronology");
  console.log("interim acceptance chronology checks passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
