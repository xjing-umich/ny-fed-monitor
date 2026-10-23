// 运行: npx tsx src/lib/entity/quarterMovesText.check.ts
import assert from "node:assert/strict";
import { quarterMovesCounts, splitNames } from "./quarterMovesText";

const m = { opened: 0, added: 4, trimmed: 12, exited: 1 };
assert.equal(quarterMovesCounts("Q2 2026", m, "zh"), "Q2 2026：新建 0 · 增持 4 · 减持 12 · 清仓 1");
assert.equal(quarterMovesCounts("Q2 2026", m, "en"), "Q2 2026: 0 opened · 4 added · 12 trimmed · 1 exited");
assert.deepEqual(splitNames(["a", "b", "c", "d", "e"]), { shown: ["a", "b", "c"], rest: 2 }, "超过 3 个折叠");
assert.deepEqual(splitNames(["a"]), { shown: ["a"], rest: 0 });
assert.deepEqual(splitNames([]), { shown: [], rest: 0 }, "清仓 0 → 空");
// 投资人页 Q2:巴菲特 新建 1 · 加仓 7 · 减仓 6 · 清仓 1 —— 减仓不能漏
assert.equal(
  quarterMovesCounts("Q2 2026", { opened: 1, added: 7, trimmed: 6, exited: 1 }, "zh"),
  "Q2 2026：新建 1 · 增持 7 · 减持 6 · 清仓 1",
);
console.log("quarterMovesText.check OK");
