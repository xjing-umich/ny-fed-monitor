/** Run: cd web && npx tsx src/lib/reports/period.check.ts */
import { reportPeriodFor, reportSlug, parseReportSlug, priorQuarter } from "./period";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

assert(reportPeriodFor(new Date("2026-10-19T00:00:00Z")) === "2026-09-30", "10/19 → Q3");
assert(reportPeriodFor(new Date("2026-09-30T12:00:00Z")) === "2026-09-30", "季末当天即该季");
assert(reportPeriodFor(new Date("2026-09-29T00:00:00Z")) === "2026-06-30", "季末前一天 → 上一季");
assert(reportPeriodFor(new Date("2026-01-05T00:00:00Z")) === "2025-12-31", "跨年 → Q4 上年");

assert(reportSlug("2026-09-30") === "q3-2026-superinvestor-consensus", "slug Q3");
assert(reportSlug("2025-12-31") === "q4-2025-superinvestor-consensus", "slug Q4");
assert(parseReportSlug("q2-2026-superinvestor-consensus") === "2026-06-30", "parse Q2");
assert(parseReportSlug("q1-2026-superinvestor-consensus") === "2026-03-31", "parse Q1");
assert(parseReportSlug("q5-2026-superinvestor-consensus") === null, "Q5 非法");
assert(parseReportSlug("how-to-read-a-13f") === null, "普通文章不是报告");
assert(parseReportSlug("q3-2026-superinvestor-consensus-x") === null, "尾巴多余");

assert(priorQuarter("2026-09-30") === "2026-06-30", "prior Q3");
assert(priorQuarter("2026-03-31") === "2025-12-31", "prior 跨年");

console.log("period.check OK");
