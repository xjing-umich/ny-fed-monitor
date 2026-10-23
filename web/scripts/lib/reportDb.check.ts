/** Run: cd web && npx tsx scripts/lib/reportDb.check.ts */
import { countSentIssues } from "./reportDb";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

assert(countSentIssues([], "2026-09-30") === 0, "无历史 → 0(首期)");
assert(countSentIssues([{ period: "2026-06-30", sends: {} }], "2026-09-30") === 0, "Q2 SQL 定稿未群发(sends={})不算一期");
assert(countSentIssues([{ period: "2026-06-30", sends: null }], "2026-09-30") === 0, "sends null 不算");
assert(countSentIssues([{ period: "2026-06-30", sends: { en: { broadcastId: "b", sentAt: null } } }], "2026-09-30") === 0, "只建了 broadcast 未确认发出不算");
assert(countSentIssues([{ period: "2026-06-30", sends: { zh: { broadcastId: "b", sentAt: "t" } } }], "2026-09-30") === 1, "任一语言已发出算一期");
assert(countSentIssues([{ period: "2026-09-30", sends: { en: { broadcastId: "b", sentAt: "t" } } }], "2026-09-30") === 0, "本季自身不算(重跑补发 zh 时 en 已发,zh 仍是首期)");

console.log("reportDb.check OK");
