// 运行: npx tsx src/components/common/qoqDirection.check.ts
import assert from "node:assert/strict";
import { moveMarkText, fmtPct1 } from "./qoqDirection";

assert.equal(moveMarkText("new", "zh"), "新建");
assert.equal(moveMarkText("increased", "en"), "Added");
assert.equal(moveMarkText("decreased", "zh"), "减持");
assert.equal(moveMarkText(undefined, "zh"), null, "无动作(持平或不同期行)→ 不标");
assert.equal(moveMarkText("exited", "en"), null, "清仓不在持有人表里");
assert.equal(fmtPct1(0.2204), "22.0%");
console.log("qoqDirection.check OK");
