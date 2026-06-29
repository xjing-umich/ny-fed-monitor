// 跑法: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/consensusRead.check.ts
// (consensusRead.ts 含 import "server-only", 需该 tsconfig 把 server-only 桩空; 见 tsx-ingest-server-only-stub)
import { strict as assert } from "node:assert";
import { mapHolderCountRows } from "./consensusRead";

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

console.log("consensusRead.check.ts: all assertions passed");
