// 运行: cd web && npx tsx src/lib/managers/splitAdjust.check.ts
import assert from "node:assert/strict";
import { isRealSplit, dedupeSplitEvents } from "./splitAdjust";

// ── 真拆股 vs 价格复权(Yahoo 把分拆上市/股票股息也记成小数"拆股",股数并不变) ──
for (const r of [2, 3, 4, 5, 10, 25, 1.5, 4 / 3, 0.5, 0.25, 0.1, 0.05, 1 / 12, 0.333333]) assert.ok(isRealSplit(r), `真拆股 ${r}`);
for (const r of [1.067, 1.241, 1.272, 1.01, 0.9535, 2.793, 6.665, 2.39, 1.472, 1.327, 0, -2, NaN, Infinity]) assert.ok(!isRealSplit(r), `非真拆股 ${r}`);

// ── 去重:同 ticker、同比例、30 天内只留最早一条;不同比例、不同 ticker、超过 30 天都保留 ──
const ev = dedupeSplitEvents([
  { ticker: "WLFC", date: "2026-07-21", ratio: 3 },
  { ticker: "WLFC", date: "2026-07-20", ratio: 3 },
  { ticker: "BRCC", date: "2026-08-21", ratio: 0.1 },
  { ticker: "BRCC", date: "2026-08-24", ratio: 0.1 },
  { ticker: "APH", date: "2026-05-01", ratio: 2 },
  { ticker: "APH", date: "2026-09-03", ratio: 2 },
  { ticker: "X", date: "2026-07-01", ratio: 2 },
  { ticker: "X", date: "2026-07-05", ratio: 3 },
]);
assert.deepEqual(
  ev.map((e) => `${e.ticker}@${e.date}x${e.ratio}`),
  ["APH@2026-05-01x2", "APH@2026-09-03x2", "BRCC@2026-08-21x0.1", "WLFC@2026-07-20x3", "X@2026-07-01x2", "X@2026-07-05x3"],
);
console.log("splitAdjust.check OK");
