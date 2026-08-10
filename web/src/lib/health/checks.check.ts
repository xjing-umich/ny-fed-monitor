// 纯判定自检——node:assert,零新依赖。运行: npx tsx src/lib/health/checks.check.ts
// 项目无常驻测试套件(solo dev),此为 ad-hoc 自检,不接 CI。
import assert from "node:assert/strict";
import { evaluate13F, evaluateDbSize } from "./checks";

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

// --- evaluateDbSize ---
// null(取数不可用) → 0 问题, info 含"跳过"
{
  const r = evaluateDbSize(null, 500, 0.8);
  assert.equal(r.problems.length, 0, "null 应 0 问题(降级)");
  assert.match(r.info[0], /跳过/);
}
// 60% (300MB/500) < 80% → 0 问题, info 含百分比
{
  const r = evaluateDbSize(300 * 1_048_576, 500, 0.8);
  assert.equal(r.problems.length, 0, "60% 应 0 问题");
  assert.match(r.info[0], /60%/);
}
// 正好 80% (400MB/500) ≥ 阈值 → 1 问题, pipeline "cost", message 含百分比
{
  const r = evaluateDbSize(400 * 1_048_576, 500, 0.8);
  assert.equal(r.problems.length, 1, "80% 边界应 1 问题");
  assert.equal(r.problems[0].pipeline, "cost");
  assert.match(r.problems[0].message, /80%/);
}
// 90% (450MB/500) 超阈 → 1 问题
{
  const r = evaluateDbSize(450 * 1_048_576, 500, 0.8);
  assert.equal(r.problems.length, 1, "90% 应 1 问题");
  assert.match(r.problems[0].message, /90%/);
}

console.log("checks.check.ts: all assertions passed ✓");
