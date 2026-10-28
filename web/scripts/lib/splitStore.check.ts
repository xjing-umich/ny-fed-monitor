/** Run: cd web && npx tsx scripts/lib/splitStore.check.ts */
import assert from "node:assert/strict";
import { isMissingTable, splitRow, summaryRow, consensusChangesFor } from "./splitStore";
import { factorLookup } from "../../src/lib/managers/splitAdjust";

assert.ok(isMissingTable({ code: "42P01" }));
assert.ok(isMissingTable({ code: "PGRST205" }));
assert.ok(!isMissingTable({ code: "23505" }));
assert.ok(!isMissingTable(null));

const at = "2026-10-28T00:00:00.000Z";
assert.deepEqual(
  splitRow({ cusip: "C", ticker: "CC", fromPeriod: "2026-03-31", toPeriod: "2026-06-30", factor: 5, source: "table", evidence: { q: 0.2, r: 5, events: [], matching: 3, bothHolders: 4 } }, at),
  { cusip: "C", ticker: "CC", from_period: "2026-03-31", to_period: "2026-06-30", factor: 5, source: "table", evidence: { q: 0.2, r: 5, events: [], matching: 3, bothHolders: 4 }, computed_at: at },
);

const s = {
  period: "2026-06-30", priorPeriod: "2026-03-31", latestValue: 10, priorValue: 8, latestCount: 2, priorCount: 3,
  netFlowUsd: -1, verdict: "selling" as const, countVerdict: "buying" as const,
  counts: { opened: 1, added: 0, trimmed: 0, exited: 1 }, topMoves: [], exits: [],
};
assert.deepEqual(summaryRow("0001", s, at), {
  cik: "0001", period: "2026-06-30", prior_period: "2026-03-31", latest_value: 10, prior_value: 8, latest_count: 2, prior_count: 3,
  net_flow_usd: -1, verdict: "selling", count_verdict: "buying", counts: s.counts, top_moves: [], exits: [], computed_at: at,
});

// 共识动作:拆股换算后,纯拆股不再算买入;库里字符串数字照常处理。
{
  const look = factorLookup([{ cusip: "K", fromPeriod: "2026-03-31", toPeriod: "2026-06-30", factor: 5 }]);
  const L = [{ cusip: "K", issuer: "K", value: "500", shares: "500" }, { cusip: "A", issuer: "A", value: 20, shares: 20 }];
  const P = [{ cusip: "K", issuer: "K", value: "500", shares: "100" }, { cusip: "A", issuer: "A", value: 10, shares: 10 }];
  assert.deepEqual(consensusChangesFor(L, P, "2026-06-30", "2026-03-31", look).map((c) => `${c.cusip}:${c.kind}`), ["A:increased"]);
}
console.log("splitStore.check OK");
