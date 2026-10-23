// 运行: npx tsx "src/app/[lang]/investors/[slug]/movesCount.check.ts"
import assert from "node:assert/strict";
import { countMoves } from "./movesCount";

const changes = [
  { kind: "new" }, { kind: "increased" }, { kind: "increased" }, { kind: "decreased" }, { kind: "exited" },
] as Array<{ kind: "new" | "increased" | "decreased" | "exited" }>;
assert.deepEqual(countMoves(changes), { opened: 1, added: 2, trimmed: 1, exited: 1 });
assert.deepEqual(countMoves([]), { opened: 0, added: 0, trimmed: 0, exited: 0 });
console.log("movesCount.check OK");
