// 跑法(裸跑): cd web && npx tsx src/lib/valuation/screenerSort.check.ts
import { strict as assert } from "node:assert";
import { parseSort, sortScreenerRows } from "./screenerSort";

assert.equal(parseSort("holders"), "holders", "holders parsed");
assert.equal(parseSort("margin"), "margin", "margin parsed");
assert.equal(parseSort(undefined), "margin", "default margin");
assert.equal(parseSort("garbage"), "margin", "invalid → margin");

const rows = [
  { ticker: "A", marginPct: 0.5, holderCount: 2 },
  { ticker: "B", marginPct: 0.1, holderCount: 9 },
  { ticker: "C", marginPct: 0.3, holderCount: 9 },
];

// margin: 原样透传(不重排)
assert.deepEqual(sortScreenerRows(rows, "margin").map((r) => r.ticker), ["A", "B", "C"], "margin passthrough");

// holders: 9 在前, 9 并列里 margin 0.3 > 0.1 → C 在 B 前
assert.deepEqual(sortScreenerRows(rows, "holders").map((r) => r.ticker), ["C", "B", "A"], "holders desc, margin tiebreak");

// 不可变: 原数组未动
assert.equal(rows[0].ticker, "A", "input not mutated");

console.log("screenerSort.check.ts: all assertions passed");
