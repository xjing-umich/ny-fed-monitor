// 个股页持有人数趋势序列:按季升序取最近 N 季的持有人数,终点与全站展示季度对齐。
// 申报季内少数经理提前交了下一季时,那一季只有寥寥几份申报(比如 1 人),若把它当作
// 序列终点,会出现 "47 → 1" 这种假断崖。与 consensus/buys、"截至"同一口径
// (effectiveMovesPeriod):展示季度之后的季一律不计入,等过了截止日且覆盖率达标再纳入。
//
// 终点(展示季度那一点)再按共识榜口径改写:每位 active 经理按其最新一份申报计——最新申报
// 还停在上一季的落后者(如 Ackman 仍是 Q1)按最后一次披露的仓位计入,早申报者按新季计入。
// 逐季快照只数"该季申报里持有"的人,落后者在展示季度缺席,终点会比页面持有人数/共识榜少。

export const HOLDER_TREND_QUARTERS = 8;

export type HolderTrendPoint = { period: string; count: number };

/**
 * points: 任意顺序的 (period, 持有人数)。throughPeriod: 展示季度(YYYY-MM-DD);
 * 空 → 不截断(无全站口径时的回退)。endpoint: 共识口径的当前持有人数(= 页面持有人数),
 * 给定且有 throughPeriod 时作为展示季度那一点(覆盖或补上)。返回升序人数数组,长度 ≤ n。
 */
export function holderTrendSeries(
  points: readonly HolderTrendPoint[],
  throughPeriod: string | null | undefined,
  endpoint?: number,
  n = HOLDER_TREND_QUARTERS,
): number[] {
  const override = !!throughPeriod && endpoint != null;
  const kept = points.filter((p) => !throughPeriod || (override ? p.period < throughPeriod : p.period <= throughPeriod));
  if (throughPeriod && endpoint != null) kept.push({ period: throughPeriod, count: endpoint });
  return kept
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0))
    .slice(-n)
    .map((p) => p.count);
}
