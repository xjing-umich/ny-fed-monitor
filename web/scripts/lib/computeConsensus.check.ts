/**
 * latestDistinctPeriodFilings — 同 period 原件+修正件去重回归。
 * Run: cd web && npx tsx scripts/lib/computeConsensus.check.ts
 */
import { latestDistinctPeriodFilings } from "./computeConsensus";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}

// 同季 13F-HR + 13F-HR/A 并存:limit(2) 旧逻辑会把两行都当成 latest/prior
const rows = [
  { id: 10, period: "2025-12-31", filed_at: "2026-02-10" }, // 原件
  { id: 11, period: "2025-12-31", filed_at: "2026-02-20" }, // 修正件(更新)
  { id: 8, period: "2025-09-30", filed_at: "2025-11-14" },
  { id: 7, period: "2025-09-30", filed_at: "2025-11-20" }, // 上季修正件
  { id: 5, period: "2025-06-30", filed_at: "2025-08-14" },
];

const two = latestDistinctPeriodFilings(rows, 2);
assert(two.length === 2, `期望 2 个不同 period, got ${two.length}`);
assert(two[0].period !== two[1].period, `两期 period 必须互不相同: ${two[0].period} vs ${two[1].period}`);
assert(two[0].period === "2025-12-31" && two[0].id === 11, `latest 应取修正件 id=11, got id=${two[0].id} period=${two[0].period}`);
assert(two[1].period === "2025-09-30" && two[1].id === 7, `prior 应取上季修正件 id=7, got id=${two[1].id} period=${two[1].period}`);

// filed_at 并列 → 更大 id 胜出
const tie = latestDistinctPeriodFilings(
  [
    { id: 1, period: "2025-12-31", filed_at: "2026-02-15" },
    { id: 2, period: "2025-12-31", filed_at: "2026-02-15" },
  ],
  1
);
assert(tie[0].id === 2, `filed_at 并列取更大 id, got ${tie[0].id}`);

console.log("computeConsensus.check OK");
