// 纯判定自检——node:assert,零新依赖。运行: npx tsx src/lib/health/checks.check.ts
// 项目无常驻测试套件(solo dev),此为 ad-hoc 自检,不接 CI。
import assert from "node:assert/strict";
import { evaluate13F } from "./checks";

const today = new Date("2026-06-08T12:00:00Z"); // mostRecentDueQuarter → 2026-03-31

// --- evaluate13F ---
// 空库 → 1 个问题
{
  const r = evaluate13F(null, [], today);
  assert.equal(r.problems.length, 1, "空库应 1 问题");
  assert.equal(r.problems[0].pipeline, "13f");
}
// 整体落后(最新只到 2025-12-31 < 2026-03-31) → 1 问题
{
  const r = evaluate13F("2025-12-31", ["2025-12-31"], today);
  assert.equal(r.problems.length, 1, "落后应 1 问题");
  assert.match(r.problems[0].expected, /2026-03-31/);
}
// 当季已到(2026-03-31) → 0 问题, info 带覆盖率
{
  const r = evaluate13F("2026-03-31", ["2026-03-31", "2025-09-30"], today);
  assert.equal(r.problems.length, 0, "当季到位不应告警(Burry 个体晚报不触发)");
  assert.equal(r.info.length, 1);
  assert.match(r.info[0], /1\/2/, "覆盖率应 1/2 户到位");
}

console.log("checks.check.ts: all assertions passed ✓");
