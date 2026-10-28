// 运行: cd web && npx tsx src/lib/managers/quarterSummary.check.ts
import assert from "node:assert/strict";
import { summarizeQuarter, moveFlowUsd } from "./quarterSummary";
import { computeChanges } from "./assemble";
import type { Holding } from "./types";

const h = (cusip: string, shares: number, px: number, weight = 0, putCall?: string): Holding => ({ cusip, issuer: `${cusip} INC`, shares, value: shares * px, weight, putCall });
const prior = [h("A", 100, 10), h("B", 1000, 10), h("C", 50, 20), h("X", 10, 30), h("Y", 300, 10), h("P", 100, 10, 0, "Put")];
const latest = [h("A", 150, 12, 0.1), h("B", 400, 11, 0.3), h("C", 50, 25, 0.2), h("N", 100, 40, 0.4), h("P", 500, 10, 0, "Put")];
const changes = computeChanges(latest, prior);
const s = summarizeQuarter({ period: "2026-06-30", priorPeriod: "2026-03-31", latest, prior, changes });

// 单笔金额:新建=本季市值;清仓=−上季市值;增减=Δ股×本季末单价;期权不计。
assert.equal(moveFlowUsd(changes.find((c) => c.cusip === "A")!), 50 * 12);
assert.equal(moveFlowUsd(changes.find((c) => c.cusip === "B")!), -600 * 11);
assert.equal(moveFlowUsd(changes.find((c) => c.cusip === "N")!), 4000);
assert.equal(moveFlowUsd(changes.find((c) => c.cusip === "X")!), -300);
// 净额 = 600 − 6600 + 4000 − 300 − 3000 = −5300;上季正股市值 = 1000+10000+1000+300+3000 = 15300 → 净卖出。
assert.equal(s.netFlowUsd, -5300);
assert.equal(s.priorValue, 15300);
assert.equal(s.latestValue, 1800 + 4400 + 1250 + 4000);
assert.equal(s.latestCount, 4); assert.equal(s.priorCount, 5);
assert.equal(s.verdict, "selling");
// 只数口径(旧):买 2(A 增、N 新)vs 卖 3(B 减、X 清、Y 清)→ selling。
assert.equal(s.countVerdict, "selling");
assert.deepEqual(s.counts, { opened: 1, added: 1, trimmed: 1, exited: 2 });
// 前 5 笔按金额绝对值:B −6600、N 4000、Y −3000、A 600、X −300;期权 P 不进。
assert.deepEqual(s.topMoves.map((m) => m.cusip), ["B", "N", "Y", "A", "X"]);
assert.equal(s.topMoves[1].weightAfter, 0.4);
assert.equal(s.topMoves[2].weightAfter, null, "清仓无现占比");
// 清仓按上季市值降序。
assert.deepEqual(s.exits.map((e) => `${e.cusip}:${e.priorValue}`), ["Y:3000", "X:300"]);

// 持平阈值:净额不到上季正股市值 2% → mixed。
{
  const p = [h("A", 1000, 10)], l = [h("A", 1015, 10)];
  const q = summarizeQuarter({ period: "q", priorPeriod: "p", latest: l, prior: p, changes: computeChanges(l, p) });
  assert.equal(q.verdict, "mixed"); assert.equal(q.countVerdict, "buying");
}
// 只数说"加仓"、金额说"卖出"(Viking 形态):10 只小加仓 vs 1 只大清仓。
{
  const p = [...Array.from({ length: 10 }, (_, i) => h(`S${i}`, 10, 10)), h("BIG", 1000, 100)];
  const l = Array.from({ length: 10 }, (_, i) => h(`S${i}`, 11, 10));
  const q = summarizeQuarter({ period: "q", priorPeriod: "p", latest: l, prior: p, changes: computeChanges(l, p) });
  assert.equal(q.countVerdict, "buying"); assert.equal(q.verdict, "selling");
}
// 并列时按 issuer 字母序,结果确定。
{
  const p = [h("Z", 10, 10), h("A", 10, 10)], l = [h("Z", 20, 10), h("A", 20, 10)];
  const q = summarizeQuarter({ period: "q", priorPeriod: "p", latest: l, prior: p, changes: computeChanges(l, p) });
  assert.deepEqual(q.topMoves.map((m) => m.cusip), ["A", "Z"]);
}
// 拆股调整的行带出 splitFactor。
{
  const p = [{ ...h("K", 10000, 10), splitFactor: 10 }], l = [h("K", 8440, 10)];
  const q = summarizeQuarter({ period: "q", priorPeriod: "p", latest: l, prior: p, changes: computeChanges(l, p) });
  assert.equal(q.topMoves[0].splitFactor, 10); assert.equal(q.topMoves[0].kind, "decreased");
}
console.log("quarterSummary.check OK");
