import assert from "node:assert/strict";
import { validateCapture, summarizeAudit } from "./valuation-evidence-audit";
assert.throws(
  () =>
    validateCapture(
      { source_rows: { securities: 2 } },
      { securities: [{ ticker: "ONE" }] },
    ),
  /securities/,
  "truncated inputs fail instead of shrinking the denominator",
);
validateCapture(
  { source_rows: { securities: 2 } },
  { securities: [{ ticker: "ONE" }, { ticker: "TWO" }] },
);
const summary = summarizeAudit([
  {
    ticker: "A",
    cik: "1",
    snapshot: true,
    status: "verdict",
    oldIv: 100,
    newIv: 50,
    gRaw: -0.1,
    g1: 0,
    oldG1: 0.2,
    cap: 10,
  },
  {
    ticker: "A.B",
    cik: "1",
    snapshot: true,
    status: "growth_evidence_incomplete",
    coverageGap: "missing_interim",
  },
  { ticker: "FAIL", status: "calculation_failure" },
  { ticker: "EMPTY", status: "no_SEC_data" },
]);
assert.equal(summary.total, 4);
assert.equal(summary.issuers, 3);
assert.equal(summary.status.calculation_failure, 1);
assert.equal(summary.status.no_SEC_data, 1);
assert.equal(summary.snapshotCount, 2);
assert.equal(summary.negativeHistoryPositiveGrowth, 0);
console.log("valuation evidence audit denominator checks passed");
