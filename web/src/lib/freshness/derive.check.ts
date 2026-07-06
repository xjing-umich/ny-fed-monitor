// 纯逻辑自检——用 node:assert，零新依赖。运行: npx tsx src/lib/freshness/derive.check.ts
// 本项目无常驻测试套件(solo dev)，此文件为 ad-hoc 自检，不接入 CI。
import assert from "node:assert/strict";
import {
  priceFreshness,
  filingFreshness,
  tradingDaysBetween,
  mostRecentDueQuarter,
  globalLatestPeriod,
  quarterLag,
  freshness13F,
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

console.log("derive.check.ts: all assertions passed ✓ (incl. freshness13F)");
