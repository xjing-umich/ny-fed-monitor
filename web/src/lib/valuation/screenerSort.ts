// screener 排序纯函数(无 "server-only", 可裸跑 .check.ts)。默认 margin(查询已按 margin 排, 原样透传);
// holders → 按持有机构数降序, 并列再按安全边际降序("最便宜且共识最强"置顶)。
export type ScreenSort = "margin" | "holders";

export function parseSort(v: string | undefined): ScreenSort {
  return v === "holders" ? "holders" : "margin";
}

export function sortScreenerRows<T extends { marginPct: number | null; holderCount: number }>(
  rows: T[],
  sort: ScreenSort,
): T[] {
  if (sort !== "holders") return rows;
  return [...rows].sort(
    (a, b) => b.holderCount - a.holderCount || (b.marginPct ?? -Infinity) - (a.marginPct ?? -Infinity),
  );
}
