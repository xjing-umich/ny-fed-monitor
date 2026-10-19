// 个股页持有人数趋势序列:按季升序取最近 N 季的持有人数,终点与全站展示季度对齐。
// 申报季内少数经理提前交了下一季时,那一季只有寥寥几份申报(比如 1 人),若把它当作
// 序列终点,会出现 "47 → 1" 这种假断崖。与 consensus/buys、"截至"同一口径
// (effectiveMovesPeriod):展示季度之后的季一律不计入,等过了截止日且覆盖率达标再纳入。

export const HOLDER_TREND_QUARTERS = 8;

export type HolderTrendPoint = { period: string; count: number };

/**
 * points: 任意顺序的 (period, 持有人数)。throughPeriod: 展示季度(YYYY-MM-DD);
 * 空 → 不截断(无全站口径时的回退)。返回升序人数数组,长度 ≤ n。
 */
export function holderTrendSeries(
  points: readonly HolderTrendPoint[],
  throughPeriod: string | null | undefined,
  n = HOLDER_TREND_QUARTERS,
): number[] {
  return points
    .filter((p) => !throughPeriod || p.period <= throughPeriod)
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0))
    .slice(-n)
    .map((p) => p.count);
}
