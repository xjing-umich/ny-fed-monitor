// 运行: npx tsx src/lib/learn.check.ts
import assert from "node:assert/strict";
import { getArticle } from "./learn";

const en = getArticle("q2-2026-superinvestor-consensus", "en")!;
const zh = getArticle("q2-2026-superinvestor-consensus", "zh")!;
assert.ok(en.snapshotNote?.includes("94"), "en 快照说明写明实时页现为 94 位");
assert.ok(zh.snapshotNote?.includes("94 位"), "zh 快照说明写明实时页现为 94 位");
assert.ok(!en.intro.includes("due November 14"), "en 不再写 Q3 11/14 截止");
assert.ok(en.intro.includes("November 16"), "en 写顺延后的 11/16");
assert.ok(!zh.intro.includes("11 月 14 日截止"), "zh 不再写 11/14 截止");
console.log("learn.check OK");
