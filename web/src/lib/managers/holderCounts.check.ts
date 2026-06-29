// 跑法(可裸跑, 无需 server-only 桩): cd web && npx tsx src/lib/managers/holderCounts.check.ts
import { strict as assert } from "node:assert";
import { mapHolderCountRows } from "./holderCounts";

// 1) 基本映射 + 大写归一
const m = mapHolderCountRows([
  { ticker: "AAPL", holder_count: 12 },
  { ticker: "msft", holder_count: 7 },
]);
assert.equal(m.get("AAPL"), 12, "AAPL count");
assert.equal(m.get("MSFT"), 7, "lowercase ticker → uppercase key");
assert.equal(m.get("aapl"), undefined, "keys are uppercase only");

// 2) 空输入 → 空 Map
assert.equal(mapHolderCountRows([]).size, 0, "empty rows → empty map");

// 3) 重复 ticker → 后者覆盖(或同值幂等), 不抛
const dup = mapHolderCountRows([
  { ticker: "AAPL", holder_count: 12 },
  { ticker: "AAPL", holder_count: 12 },
]);
assert.equal(dup.get("AAPL"), 12, "dup ticker tolerated");

console.log("holderCounts.check.ts: all assertions passed");
