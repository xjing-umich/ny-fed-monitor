// 基本面过期闸 —— 与 price.stale 同类的时效护栏。
//
// 引擎只用最新 FY 年报行估值。若一家公司最新年报已远超正常年度申报周期(停报/退市/
// 被并购,或 SEC companyfacts 覆盖不了的外股 ADR),仍拿今天的价配多年前的基本面,会
// 造出"陈旧幻觉"verdict。此闸把最新 FY 期末距今超过阈值的票判为过期,估值侧据此抑制。
//
// 阈值 18 个月:健康公司最新 FY 期末至多 ~15 月(12 月周期 + ~3 月申报滞后),18 月留 3
// 月宽限给晚报的正常票,只抑制真正掉队的。

export const FUNDAMENTALS_MAX_AGE_MONTHS = 18;

const MS_PER_MONTH = 30.44 * 86_400_000; // 平均月长

/**
 * 最新 FY 年报期末是否已过期(距 asOf 超过 FUNDAMENTALS_MAX_AGE_MONTHS)。
 * 无年报数据(null/空)按无法背书新鲜度处理 → 过期。
 */
export function isFundamentalsStale(
  latestFyPeriodEnd: string | null | undefined,
  asOfISO: string,
): boolean {
  if (!latestFyPeriodEnd) return true; // 无年报 → 无法背书新鲜度
  const end = Date.parse(latestFyPeriodEnd);
  const asOf = Date.parse(asOfISO);
  if (Number.isNaN(end) || Number.isNaN(asOf)) return false; // 解析不了不误伤
  const ageMonths = (asOf - end) / MS_PER_MONTH;
  return ageMonths > FUNDAMENTALS_MAX_AGE_MONTHS;
}
