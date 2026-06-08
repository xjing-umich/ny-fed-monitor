// 纯判定自检——node:assert,零新依赖。运行: npx tsx src/lib/health/checks.check.ts
// 项目无常驻测试套件(solo dev),此为 ad-hoc 自检,不接 CI。
import assert from "node:assert/strict";
import { evaluate13F, evaluateMacro, type MacroStatusInput } from "./checks";

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

// --- evaluateMacro ---
const mk = (o: Partial<MacroStatusInput>): MacroStatusInput => ({
  id: 1, name: "Src", isManual: false, freshnessStatus: "fresh",
  latestObservationDate: "2026-06-05", checkedAt: "2026-06-08T09:00:00Z", ...o,
});
// 全合成行(id=0) → freshness 从未写入
{
  const { problems } = evaluateMacro([mk({ id: 0 }), mk({ id: 0, name: "B" })], today);
  assert.equal(problems.length, 1, "全合成应 1 问题");
  assert.match(problems[0].message, /从未写入/);
}
// 真实行 checkedAt 7 天前 → 管道停跑
{
  const { problems } = evaluateMacro([mk({ checkedAt: "2026-06-01T09:00:00Z" })], today);
  assert.ok(problems.some((x) => /停跑/.test(x.message)), "7天未刷新应报停跑");
}
// 非手动 failed → 报; 手动 failed → 跳过; fresh → 不报
{
  const { problems } = evaluateMacro([
    mk({ name: "F", freshnessStatus: "failed" }),
    mk({ name: "M", freshnessStatus: "failed", isManual: true }),
    mk({ name: "OK", freshnessStatus: "fresh" }),
  ], today);
  const names = problems.filter((x) => x.source !== "宏观整体").map((x) => x.source);
  assert.ok(names.includes("F"), "非手动 failed 应报");
  assert.ok(!names.includes("M"), "手动源应跳过");
  assert.ok(!names.includes("OK"), "fresh 不应报");
}
// failed/empty 触发; stale 进 info 不告警; partial/unknown 不触发
{
  const { problems, info } = evaluateMacro([
    mk({ name: "E", freshnessStatus: "empty" }),
    mk({ name: "S", freshnessStatus: "stale" }),
    mk({ name: "P", freshnessStatus: "partial" }),
    mk({ name: "U", freshnessStatus: "unknown" }),
  ], today);
  const names = problems.map((x) => x.source);
  assert.ok(names.includes("E"), "empty 应报");
  assert.ok(!names.includes("S"), "stale 不应进 problems");
  assert.ok(!names.includes("P") && !names.includes("U"), "partial/unknown 不应报");
  assert.ok(info.some((s) => /滞后/.test(s) && /S/.test(s)), "stale 源应进 info");
}

console.log("checks.check.ts: all assertions passed ✓");
