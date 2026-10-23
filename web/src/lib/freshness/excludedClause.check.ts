// 运行: npx tsx src/lib/freshness/excludedClause.check.ts
import assert from "node:assert/strict";
import { excludedClause } from "./excludedClause";

assert.equal(excludedClause(0, "zh"), "");
assert.equal(excludedClause(0, "en"), "");
assert.equal(excludedClause(-1, "en"), "", "负数同 0");
assert.equal(excludedClause(1, "en"), " (1 more missed last quarter and isn't counted)", "en 单数");
assert.equal(excludedClause(3, "en"), " (3 more missed last quarter and aren't counted)");
assert.equal(excludedClause(3, "zh"), "（另有 3 位上季未申报，不计入）");
console.log("excludedClause.check OK");
