import assert from "node:assert/strict";
import { financialPublicationFingerprint as hash } from "./publicationFingerprint";
const base = {
  period_end: "2026-06-30",
  fiscal_year: 2026,
  capex: 10,
  raw_facts: { tag: "old" },
};
assert.equal(
  hash("1", [base], []),
  hash("1", [{ ...base, raw_facts: { tag: "new" } }], []),
  "provenance-only changes do not invalidate pages",
);
assert.notEqual(
  hash("1", [base], []),
  hash("1", [{ ...base, capex: 20 }], []),
  "same-period cash-flow revisions must publish",
);
assert.notEqual(
  hash("1", [base], []),
  hash("1", [{ ...base, fiscal_year: 2025 }], []),
  "corrected fiscal labels must publish",
);
assert.notEqual(
  hash("1", [base], []),
  hash("1", [base], [{ form: "10-Q", report_date: "2026-09-30" }]),
  "new filings publish before annual metrics change",
);
assert.equal(
  hash("1", [base, { period_end: "2025-06-30" }], []),
  hash("1", [{ period_end: "2025-06-30" }, base], []),
  "query/source ordering is immaterial",
);
console.log("financial content fingerprint checks OK");
