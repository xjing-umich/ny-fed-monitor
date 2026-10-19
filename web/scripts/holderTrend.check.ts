import { holderTrendSeries, HOLDER_TREND_QUARTERS } from "@/lib/stocks/holderTrend";
import { effectiveMovesPeriod } from "@/lib/freshness/derive";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}
const eq = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// MSFT 2026-10-19 线上形态:8 个完整季 + 1 位早申报者交了 Q3 2026(只有 1 人)。
const quarters = ["2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30"];
const counts = [47, 46, 45, 45, 44, 44, 43, 43];
const points = [...quarters.map((period, i) => ({ period, count: counts[i] })), { period: "2026-09-30", count: 1 }];

// 展示季度按全站口径推出来:97 位经理里 96 位停在 Q2、1 位已交 Q3,截止日(11/14)前 → Q2。
const managerPeriods = [...Array(96).fill("2026-06-30"), "2026-09-30"];
const display = effectiveMovesPeriod(managerPeriods, new Date("2026-10-19T00:00:00Z")).period;
assert(display === "2026-06-30", `早申报期展示季度应为 Q2 2026,实际 ${display}`);

const s = holderTrendSeries(points, display);
assert(s[s.length - 1] === 43, `终点应为展示季度的 43,不是早申报季的 1,实际 ${s[s.length - 1]}`);
assert(eq(s, counts), `应为完整 8 季 47 → 43,实际 ${s.join(",")}`);

// 乱序输入也按季升序。
assert(eq(holderTrendSeries([...points].reverse(), display), counts), "乱序输入应按 period 升序");

// 截止日已过且覆盖达标 → 展示季度推进到 Q3,新季才纳入,窗口仍是最近 8 季。
const full = [...points.slice(0, -1), { period: "2026-09-30", count: 42 }];
assert(eq(holderTrendSeries(full, "2026-09-30"), [...counts.slice(1), 42]), "Q3 成为展示季度后应纳入并保持 8 季窗口");

// 终点按共识口径:MSFT 线上(2026-10-19)逐季快照 Q2 = 41(40 位交了 Q2 + 早申报者的 Q2 申报),
// 但页面持有人数 / 共识榜 = 43 = 40(Q2)+ 2 位仍停在 Q1 的落后者(按最后一次披露)+ 1 位 Q3 早申报者。
const msft = ["2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"]
  .map((period, i) => ({ period, count: [1, 46, 47, 49, 48, 48, 48, 45, 41, 1][i] }));
const latestPeriods = [...Array(40).fill("2026-06-30"), "2026-03-31", "2026-03-31", "2026-09-30"];
const consensusCount = latestPeriods.length;
const m = holderTrendSeries(msft, display, consensusCount);
assert(eq(m, [46, 47, 49, 48, 48, 48, 45, 43]), `MSFT 应为 46 → 43(终点 = 共识榜 43),实际 ${m.join(",")}`);
assert(holderTrendSeries(msft, display).at(-1) === 41, "不给 endpoint 时仍是逐季快照的 41");

// 展示季度在快照里缺席(本票当季只剩落后者持有):补上终点,而不是停在上一季。
const lagOnly = [{ period: "2026-03-31", count: 3 }, { period: "2025-12-31", count: 3 }];
assert(eq(holderTrendSeries(lagOnly, display, 2), [3, 3, 2]), "展示季度缺席时应补上共识口径终点");

// 无展示季度 → endpoint 不生效(没有可对齐的季)。
assert(holderTrendSeries(msft, null, 43).at(-1) === 1, "无展示季度时不改写终点");

// 无全站口径(空)→ 不截断,行为与旧版一致。
assert(holderTrendSeries(points, null).at(-1) === 1, "无展示季度时不截断");
assert(holderTrendSeries(points, "").length === HOLDER_TREND_QUARTERS, "最多 8 季");

console.log("holderTrend.check OK");
