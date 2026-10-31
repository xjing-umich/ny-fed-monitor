// 纯逻辑自检——用 node:assert，零新依赖。运行: npx tsx src/lib/freshness/derive.check.ts
// Included in check:facts; all dates below are fixed fixtures, no production reads.
import assert from "node:assert/strict";
import {
  priceFreshness,
  filingFreshness,
  tradingDaysBetween,
  mostRecentDueQuarter,
  globalLatestPeriod,
  quarterLag,
  freshness13F,
  effectiveMovesPeriod,
  priorQuarterEnd,
  MOVES_COVERAGE_MIN,
  filingDeadline,
  effectiveFilingDeadline,
  countsAsCurrentHolder,
  isScopeChange,
  isExpectedFiler,
} from "./derive";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

// --- tradingDaysBetween: 只数周一~周五 ---
assert.equal(tradingDaysBetween(d("2026-06-08"), d("2026-06-08")), 0, "同日=0");
assert.equal(tradingDaysBetween(d("2026-06-08"), d("2026-06-09")), 1, "周一→周二=1");
// 周五(06-05) → 下周一(06-08): 跨周末, 只数周一 = 1
assert.equal(tradingDaysBetween(d("2026-06-05"), d("2026-06-08")), 1, "跨周末只数1个工作日");
// 周五(06-05) → 周五(06-12): 6/8,9,10,11,12 = 5 个工作日
assert.equal(tradingDaysBetween(d("2026-06-05"), d("2026-06-12")), 5, "整周=5");

// --- priceFreshness ---
assert.equal(priceFreshness(null, d("2026-06-08")), "empty", "无价=empty");
assert.equal(priceFreshness("2026-06-08", d("2026-06-08")), "fresh", "当天=fresh");
// 周五的价格, 到下周一(隔周末) → 1 个工作日 ≤ 3 → fresh
assert.equal(priceFreshness("2026-06-05", d("2026-06-08")), "fresh", "隔周末仍fresh");
// 落后 4 个工作日 → stale
assert.equal(priceFreshness("2026-06-05", d("2026-06-12")), "stale", ">3工作日=stale");

// --- mostRecentDueQuarter: 最近一个已过 45 天截止的季度末 ---
// 2026-06-08: Q1(03-31)+45=05-15 已过, Q2(06-30) 未到 → 03-31
assert.equal(
  mostRecentDueQuarter(d("2026-06-08")).toISOString().slice(0, 10),
  "2026-03-31",
  "6月初最近到期季=Q1",
);
// 2026-05-14: 还差一天到 Q1 截止(05-15) → 退回 Q4 2025(12-31)
assert.equal(
  mostRecentDueQuarter(d("2026-05-14")).toISOString().slice(0, 10),
  "2025-12-31",
  "Q1截止前一天=上年Q4",
);
// 跨年: 2026-02-20, Q4 2025(12-31)+45=2026-02-14 已过 → 2025-12-31
assert.equal(
  mostRecentDueQuarter(d("2026-02-20")).toISOString().slice(0, 10),
  "2025-12-31",
  "2月下旬=上年Q4",
);

// --- filingFreshness ---
assert.equal(filingFreshness(null, d("2026-06-08")), "empty", "无filing=empty");
// 当季已报: 最近到期季是 03-31, 申报期=03-31 → fresh
assert.equal(filingFreshness("2026-03-31", d("2026-06-08")), "fresh", "当季已报=fresh");
// 晚一季: 最新只报到 2025-12-31 < 2026-03-31 → stale
assert.equal(filingFreshness("2025-12-31", d("2026-06-08")), "stale", "晚一季=stale");
// 晚三季(Scion 场景): 报到 2025-06-30 → stale
assert.equal(filingFreshness("2025-06-30", d("2026-06-08")), "stale", "晚三季=stale");
// 2026-05-15 = Mar-31 + 45 天,恰为 SEC 截止日当天,当天数据尚未逾期。
assert.equal(filingFreshness("2025-12-31", new Date("2026-05-15T00:00:00Z")), "fresh", "截止日当天Q4持仓仍fresh");
assert.equal(filingFreshness("2025-12-31", new Date("2026-05-16T00:00:00Z")), "stale", "截止日次日才stale");

// --- 13F 三档新鲜度 ---
assert.equal(globalLatestPeriod(["2025-12-31", "2026-03-31", null]), "2026-03-31", "取最大季");
assert.equal(globalLatestPeriod([]), null, "空=null");

assert.equal(quarterLag("2026-03-31", "2026-03-31"), 0, "同季=0");
assert.equal(quarterLag("2025-12-31", "2026-03-31"), 1, "跨年1季");
assert.equal(quarterLag("2025-09-30", "2026-03-31"), 2, "2季");
assert.equal(quarterLag("2022-06-30", "2026-03-31"), 15, "aquamarine 量级");
assert.equal(quarterLag("2026-03-31", "2025-12-31"), 0, "超前夹到0");
assert.equal(quarterLag(null, "2026-03-31"), null, "缺失=null");

assert.equal(freshness13F("2026-03-31", "2026-03-31"), "current", "0季=current");
assert.equal(freshness13F("2025-12-31", "2026-03-31"), "current", "1季=current(正常申报节奏)");
assert.equal(freshness13F("2025-09-30", "2026-03-31"), "stale", "2季=stale(scion 现状)");
assert.equal(freshness13F("2025-06-30", "2026-03-31"), "stale", "3季=stale");
assert.equal(freshness13F("2025-03-31", "2026-03-31"), "inactive", "4季=inactive");
assert.equal(freshness13F(null, "2026-03-31"), "inactive", "缺失按最严");

assert.equal(MOVES_COVERAGE_MIN, 0.5, "coverage min");
assert.equal(priorQuarterEnd("2026-06-30"), "2026-03-31");
assert.equal(priorQuarterEnd("2026-03-31"), "2025-12-31");
assert.equal(priorQuarterEnd("2025-12-31"), "2025-09-30");
assert.equal(priorQuarterEnd("2025-09-30"), "2025-06-30");

// Production-like: 12 filed Q2, 64 on Q1; today 2026-07-12 → before Q2 deadline (06-30+45=08-14)
{
  const periods = [
    ...Array(12).fill("2026-06-30"),
    ...Array(64).fill("2026-03-31"),
  ];
  const r = effectiveMovesPeriod(periods, d("2026-07-12"));
  assert.equal(r.period, "2026-03-31", "before deadline → prior");
  assert.equal(r.reason, "before_deadline");
  assert.equal(r.maxPeriod, "2026-06-30");
  assert.equal(r.coverage.filed, 12);
  assert.equal(r.coverage.total, 76);
}

// After deadline, still low coverage → low_coverage
{
  const periods = [
    ...Array(20).fill("2026-06-30"),
    ...Array(56).fill("2026-03-31"),
  ];
  const r = effectiveMovesPeriod(periods, d("2026-08-15")); // day after 08-14
  assert.equal(r.period, "2026-03-31");
  assert.equal(r.reason, "low_coverage");
}

// After deadline, ≥50% → due_and_covered
{
  const periods = [
    ...Array(40).fill("2026-06-30"),
    ...Array(36).fill("2026-03-31"),
  ];
  const r = effectiveMovesPeriod(periods, d("2026-08-15"));
  assert.equal(r.period, "2026-06-30");
  assert.equal(r.reason, "due_and_covered");
}

// Empty
{
  const r = effectiveMovesPeriod([], d("2026-07-12"));
  assert.equal(r.period, null);
  assert.equal(r.reason, "empty");
}

// --- effectiveFilingDeadline: 周末及联邦假日顺延;filingDeadline 本身不变 ---
assert.equal(filingDeadline("2026-09-30")!.toISOString().slice(0, 10), "2026-11-14", "filingDeadline 仍是 +45 天(周六)");
assert.equal(effectiveFilingDeadline("2026-09-30")!.toISOString().slice(0, 10), "2026-11-16", "Q3 2026:周六 11/14 → 周一 11/16");
assert.equal(effectiveFilingDeadline("2026-06-30")!.toISOString().slice(0, 10), "2026-08-14", "Q2 2026:周五 8/14 不顺延");
assert.equal(effectiveFilingDeadline("2027-03-31")!.toISOString().slice(0, 10), "2027-05-17", "Q1 2027:周六 5/15 → 周一 5/17");
assert.equal(effectiveFilingDeadline("2026-03-31")!.toISOString().slice(0, 10), "2026-05-15", "Q1 2026:周五 5/15 不顺延");
assert.equal(effectiveFilingDeadline("2025-06-30")!.toISOString().slice(0, 10), "2025-08-14", "Q2 2025:周四 8/14");
assert.equal(effectiveFilingDeadline("2026-12-31")!.toISOString().slice(0, 10), "2027-02-16", "Q4 2026:周日后接联邦假日,顺延到周二 2/16");
assert.equal(effectiveFilingDeadline(null), null, "空 → null");

// --- countsAsCurrentHolder: 截止日过后停在上一季 → 不计入当前持有人 ---
// 2026-10-19: 最近到期季 = 2026-06-30(Q2 截止 08-14 已过;Q3 截止 11-14 未到)
assert.equal(countsAsCurrentHolder("2026-06-30", d("2026-10-19")), true, "已交 Q2 = 计入");
assert.equal(countsAsCurrentHolder("2026-09-30", d("2026-10-19")), true, "早申报 Q3 = 计入");
assert.equal(countsAsCurrentHolder("2026-03-31", d("2026-10-19")), false, "Q2 截止已过仍停在 Q1(Pershing/Olstein)= 不计入");
assert.equal(countsAsCurrentHolder("2025-12-31", d("2026-10-19")), false, "落后 3 季(Makaira)= 不计入");
assert.equal(countsAsCurrentHolder(null, d("2026-10-19")), false, "无申报 = 不计入");
// 申报季内(Q2 截止 08-14 前)停在 Q1 是正常节奏,照常计入;截止日次日起不计入
assert.equal(countsAsCurrentHolder("2026-03-31", d("2026-08-01")), true, "申报季内 Q1 仍计入");
assert.equal(countsAsCurrentHolder("2026-03-31", d("2026-08-14")), true, "截止日当天仍计入");
assert.equal(countsAsCurrentHolder("2026-03-31", d("2026-08-15")), false, "截止日次日起不计入");

// --- 周末截止顺延:Q3 2026 的 +45 天是周六 11/14,SEC 顺延到周一 11/16;11/17 起才算到期 ---
// 否则 11/15–11/16 会把合规地周一才交 Q3 的投资人踢出当前持有人,并提前切季。
assert.equal(mostRecentDueQuarter(d("2026-11-15")).toISOString().slice(0, 10), "2026-06-30", "周六截止的次日(周日)Q3 未到期");
assert.equal(mostRecentDueQuarter(d("2026-11-16")).toISOString().slice(0, 10), "2026-06-30", "顺延后的截止日当天 Q3 未到期");
assert.equal(mostRecentDueQuarter(d("2026-11-17")).toISOString().slice(0, 10), "2026-09-30", "顺延截止日次日 Q3 到期");
assert.equal(mostRecentDueQuarter(d("2027-02-15")).toISOString().slice(0, 10), "2026-09-30", "Q4 2026 假日 2/15 尚未到期");
assert.equal(mostRecentDueQuarter(d("2027-02-16")).toISOString().slice(0, 10), "2026-09-30", "Q4 2026 实际截止日 2/16 当天未到期");
assert.equal(countsAsCurrentHolder("2026-06-30", d("2026-11-15")), true, "11/15 停在 Q2 仍计入");
assert.equal(countsAsCurrentHolder("2026-06-30", d("2026-11-16")), true, "11/16 周一当天交 Q3 合规,仍计入");
assert.equal(countsAsCurrentHolder("2026-06-30", d("2026-11-17")), false, "顺延截止次日起停在 Q2 不计入");
{
  const periods = [...Array(70).fill("2026-09-30"), ...Array(27).fill("2026-06-30")];
  const sat = effectiveMovesPeriod(periods, d("2026-11-15"));
  assert.equal(sat.period, "2026-06-30", "11/15 不提前切到 Q3");
  assert.equal(sat.reason, "before_deadline");
  const mon = effectiveMovesPeriod(periods, d("2026-11-16"));
  assert.equal(mon.reason, "before_deadline", "11/16 顺延截止日当天仍未到期");
  const tue = effectiveMovesPeriod(periods, d("2026-11-17"));
  assert.equal(tue.period, "2026-09-30", "11/17 覆盖 ≥50% → 切到 Q3");
  assert.equal(tue.reason, "due_and_covered");
}

// --- 应申报名单 M:最新申报期 ≥ 该季上一季;停在更早季度或从未申报的人不计入分母 ---
assert.equal(isExpectedFiler("2026-06-30", "2026-09-30"), true, "交了 Q2 → Q3 应申报");
assert.equal(isExpectedFiler("2026-09-30", "2026-09-30"), true, "已交 Q3 → 应申报");
assert.equal(isExpectedFiler("2026-03-31", "2026-09-30"), false, "停在 Q1(Bancroft)→ Q3 不计入分母");
assert.equal(isExpectedFiler("2025-09-30", "2026-09-30"), false, "停报一年(Burry)→ 不计入");
assert.equal(isExpectedFiler(null, "2026-09-30"), false, "从未申报 → 不计入");
assert.equal(isExpectedFiler("2026-03-31", "2026-06-30"), true, "Q2 报告:交了 Q1 → 应申报");
{
  // 2026-10-23 线上形态:2 位已交 Q3、92 位停在 Q2、Bancroft 停在 Q1、Bares/Burry 停在 2025Q3
  const periods = [
    ...Array(2).fill("2026-09-30"),
    ...Array(92).fill("2026-06-30"),
    "2026-03-31",
    "2025-09-30",
    "2025-09-30",
  ];
  const r = effectiveMovesPeriod(periods, d("2026-10-23"));
  assert.equal(r.coverage.filed, 2, "已交 Q3 = 2");
  assert.equal(r.coverage.total, 94, "分母 M = 94(不是 97)");
  assert.equal(r.coverage.excluded, 3, "上季未申报 3 位");
}
{
  // 名单里有人没有任何申报:计入 excluded,不出现负数
  const r = effectiveMovesPeriod(["2026-09-30", "2026-06-30", null, undefined], d("2026-10-23"));
  assert.equal(r.coverage.total, 2);
  assert.equal(r.coverage.excluded, 2, "null/undefined 期也算上季未申报");
}
{
  // 切季门槛按 M 算:50 位应申报中 26 位已交 → ≥50%,即使名单 97 人
  const periods = [
    ...Array(26).fill("2026-09-30"),
    ...Array(24).fill("2026-06-30"),
    ...Array(47).fill("2025-12-31"),
  ];
  const r = effectiveMovesPeriod(periods, d("2026-11-17"));
  assert.equal(r.coverage.total, 50);
  assert.equal(r.reason, "due_and_covered", "26/50 ≥ 50% → 切到 Q3");
}

// --- isScopeChange: 组合市值环比量级异常 ---
assert.equal(isScopeChange(-0.956), true, "Cantillon Q2 2026 −96%");
assert.equal(isScopeChange(-0.5), true, "−50% 边界计入");
assert.equal(isScopeChange(-0.3), false, "−30% 属价格/调仓范围");
assert.equal(isScopeChange(0.8), false, "+80% 不算");
assert.equal(isScopeChange(1), true, "+100% 计入");
assert.equal(isScopeChange(null), false, "无环比");


// SEC Form 13F FAQ Q25, verified 2026-10-31: complete published 2026–2028 schedule.
for (const [period, deadline] of [
  ["2025-12-31", "2026-02-17"],
  ["2026-03-31", "2026-05-15"], ["2026-06-30", "2026-08-14"],
  ["2026-09-30", "2026-11-16"], ["2026-12-31", "2027-02-16"],
  ["2027-03-31", "2027-05-17"], ["2027-06-30", "2027-08-16"],
  ["2027-09-30", "2027-11-15"], ["2027-12-31", "2028-02-14"],
  ["2028-03-31", "2028-05-15"], ["2028-06-30", "2028-08-14"],
  ["2028-09-30", "2028-11-14"], ["2028-12-31", "2029-02-14"],
]) assert.equal(effectiveFilingDeadline(period)!.toISOString().slice(0, 10), deadline, `SEC schedule: ${period}`);

// Holiday extension must govern holder eligibility, moves and health, not just the displayed date.
for (const [period, prior, eve, deadline, after] of [
  ["2025-12-31", "2025-09-30", "2026-02-16", "2026-02-17", "2026-02-18"],
  ["2026-12-31", "2026-09-30", "2027-02-15", "2027-02-16", "2027-02-17"],
]) {
  for (const day of [eve, deadline]) {
    assert.equal(mostRecentDueQuarter(d(day)).toISOString().slice(0, 10), prior);
    assert.equal(countsAsCurrentHolder(prior, d(day)), true, "prior-quarter holders remain eligible through the actual deadline");
    const moves = effectiveMovesPeriod([period, period, prior], d(day));
    assert.equal(moves.period, prior);
    assert.equal(moves.reason, "before_deadline");
  }
  assert.equal(mostRecentDueQuarter(d(after)).toISOString().slice(0, 10), period);
  assert.equal(countsAsCurrentHolder(prior, d(after)), false);
  assert.equal(effectiveMovesPeriod([period, period, prior], d(after)).reason, "due_and_covered");
  assert.equal(effectiveMovesPeriod([period, prior, prior], d(after)).reason, "low_coverage", "coverage gate still applies after the extended deadline");
}

console.log("derive.check.ts: all assertions passed ✓ (incl. freshness13F, effectiveMovesPeriod, countsAsCurrentHolder, isScopeChange, effectiveFilingDeadline)");
