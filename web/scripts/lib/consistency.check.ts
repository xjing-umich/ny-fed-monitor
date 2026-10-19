/** Run: cd web && npx tsx scripts/lib/consistency.check.ts */
import { compareCohorts } from "./consistency";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const base = { period: "2026-09-30", reportFiled: 90, siteCohort: 90, siteEffectivePeriod: "2026-09-30", cohortWithoutPrior: 0 };
assert(compareCohorts(base).comparable, "同一批人、有效季 = P → 可比(买卖不一致才算失败)");

const early = compareCohorts({ ...base, siteCohort: 88 });
assert(!early.comparable && early.notes.some((n) => n.includes("report 90 filers vs site 88")), "有 2 户已申报下一季 → cohort 不同,差异预期");

const late = compareCohorts({ ...base, reportFiled: 94, siteCohort: 90 });
assert(!late.comparable, "定稿后/之后才申报的户 → 不可比");

const eff = compareCohorts({ ...base, siteEffectivePeriod: "2026-06-30" });
assert(!eff.comparable && eff.notes[0].includes("2026-06-30"), "实时页有效季还不是 P → 不可比");

const noPrior = compareCohorts({ ...base, cohortWithoutPrior: 1 });
assert(!noPrior.comparable, "有新纳入、无上季的户 → 实时页算新建仓,报告不计 → 不可比");

console.log("consistency.check OK");
