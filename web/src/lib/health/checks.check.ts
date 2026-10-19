// 纯判定自检——node:assert,零新依赖。运行: npx tsx src/lib/health/checks.check.ts
// 项目无常驻测试套件(solo dev),此为 ad-hoc 自检,不接 CI。
import assert from "node:assert/strict";
import { evaluate13F, evaluateDbSize, evaluateReport } from "./checks";

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

// --- evaluateReport ---
// period 2026-09-30 → 名义截止 11/14(周六)→ 顺延 11/16(周一)→ 宽限 10 天到 11/26(含当天)
{
  const live = { period: "2026-09-30", status: "live" as const };
  assert.equal(evaluateReport(live, new Date("2026-11-20T00:00:00Z")).problems.length, 0, "截止后 4 天未定稿:不告警");
  assert.equal(evaluateReport(live, new Date("2026-11-25T12:00:00Z")).problems.length, 0, "11/25:按顺延后的截止日还在宽限期");
  assert.equal(evaluateReport(live, new Date("2026-11-26T23:59:00Z")).problems.length, 0, "11/26 当天(=11/16+10d)仍不告警");
  const late = evaluateReport(live, new Date("2026-11-27T00:00:00Z"));
  assert.equal(late.problems.length, 1, "11/27 起仍未定稿:告警");
  assert.equal(late.problems[0].pipeline, "report");
  assert.equal(
    late.problems[0].expected,
    "若已收到预览：运行 Report finalize & send；若没有预览（覆盖率不足）：先运行 action=preview 或检查覆盖率",
    "告警分两种情况给出下一步",
  );
  assert.equal(evaluateReport({ ...live, status: "final" }, new Date("2026-12-30T00:00:00Z")).problems.length, 0, "已定稿不告警");
  assert.equal(evaluateReport(null, new Date("2026-11-25T00:00:00Z")).problems.length, 0, "无行不告警(只 info)");
}

console.log("checks.check.ts: all assertions passed ✓");
