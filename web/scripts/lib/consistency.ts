// 报告 vs 实时共识表:两边的“投资人集合”(cohort)是否相同。不同则逐数差异是预期的,不能判失败。
// 实时页的买卖只算“最新申报 == 有效变动季”的应申报投资人;报告算所有已申报 P 的应申报投资人。
// 早申报下一季的户(实时页已不按 P 算)、或截止后才申报的户,都会让两边合理地不一样。

export type CohortInput = {
  period: string;
  /** payload.coverage.filed:报告里已申报 P 的应申报投资人数。 */
  reportFiled: number;
  /** 应申报投资人中最新申报季 === P 的人数(实时页按 P 计算买卖的那批人)。 */
  siteCohort: number;
  /** effectiveMovesPeriod(...).period:实时页当前的有效变动季。 */
  siteEffectivePeriod: string | null;
  /** siteCohort 中没有任何早于 P 的申报的人数:实时页把其全部持仓算作新建仓,报告不计入买卖。 */
  cohortWithoutPrior: number;
};

export function compareCohorts(i: CohortInput): { comparable: boolean; notes: string[] } {
  const notes: string[] = [];
  if (i.siteEffectivePeriod !== i.period) {
    notes.push(`实时共识页的有效变动季是 ${i.siteEffectivePeriod ?? "无"},不是 ${i.period}:diffs below are expected`);
  }
  if (i.siteCohort !== i.reportFiled) {
    notes.push(`cohort differs: report ${i.reportFiled} filers vs site ${i.siteCohort} — diffs below are expected`);
  }
  if (i.cohortWithoutPrior > 0) {
    notes.push(`${i.cohortWithoutPrior} 位已申报 ${i.period} 的投资人没有更早申报:实时页把其全部持仓算作新建仓,报告不计 — diffs below are expected`);
  }
  return { comparable: notes.length === 0, notes };
}
