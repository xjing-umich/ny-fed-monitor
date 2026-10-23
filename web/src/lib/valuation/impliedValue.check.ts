// 运行: npx tsx src/lib/valuation/impliedValue.check.ts
import assert from "node:assert/strict";
import { impliedValue } from "./impliedValue";

assert.equal(Math.round(impliedValue(79.17, 0.7692)!), 343, "PDD:$79 / (1−0.77) ≈ $343");
assert.equal(impliedValue(50, 0), 50, "边际 0 → 等于价格");
assert.equal(Math.round(impliedValue(150, -0.5)!), 100, "负边际(高于价值)也能反推");
assert.equal(impliedValue(10, null), null, "无边际 → null");
assert.equal(impliedValue(10, 1), null, "边际 = 1 → 无意义,null");
assert.equal(impliedValue(10, 1.2), null, "边际 > 1 → null");
assert.equal(impliedValue(0, 0.3), null, "价格非正 → null");
console.log("impliedValue.check OK");
