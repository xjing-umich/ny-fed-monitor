import type { ValuationFloorYear } from "./types";

export const MIN_BASE_RATE_YEARS = 3;

/**
 * 稳健历史增长 base-rate：对 FY 营收做 log-线性回归的年化斜率(最小二乘)，
 * 而非端点对端点 CAGR——端点法对单个异常年(疫情谷/一次性)极敏感，是准确性最大风险。
 * 用营收(最不可篡改、端点最稳)而非净利：隐含盈利增长若超历史营收增长=还需利润率扩张，判「苛刻」正确。
 * 要求 ≥3 个正 FY 点，否则 undefined(→ 抑制，不出结论)。
 * 调用方须保证传入的是 fiscal_period=FY 行(非派生 Q4)——见 Global Constraints 数据准确性硬门。
 *
 * 独立于 impliedExpectations/ownerEarningsDcf，避免两者互相 import 成环
 * (impliedExpectations 消费 ownerEarningsDcf.dcfTier，ownerEarningsDcf 消费本函数)。
 */
export function historicalGrowthBaseRate(years: ValuationFloorYear[]): number | undefined {
  return revenueGrowthStandard(years)?.rate;
}

/**
 * 全站唯一的「历史营收增速」口径(2026-10-28 定):FY 营收 log-线性回归年化斜率,连同所用年份区间。
 * 估值引擎(OE-DCF 的 gRaw)、「价格在赌什么」、生意质量头条都引用这一个数,展示时带上区间
 * (如「2020–2025 年化 49.5%」),不再各算各的(PDD 曾同页出现 20% / 49.5% / +14.5% 三个"营收增速")。
 * 最近财年同比、模型假设增速是另外两个口径,展示时必须带各自的后缀。
 */
export type RevenueGrowth = { rate: number; fromYear: number; toYear: number; points: number };

export function revenueGrowthStandard(years: ValuationFloorYear[]): RevenueGrowth | undefined {
  const pts = years
    .filter((y) => y.revenue != null && Number.isFinite(y.revenue) && (y.revenue as number) > 0)
    .map((y) => ({ x: y.fiscal_year, displayYear: y.period_end ? Number(y.period_end.slice(0, 4)) : y.fiscal_year, y: Math.log(y.revenue as number) }));
  if (pts.length < MIN_BASE_RATE_YEARS) return undefined;
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (!(denom > 0)) return undefined;
  const slope = (n * sxy - sx * sy) / denom; // ln(revenue) 对 fiscal_year 的斜率
  const g = Math.exp(slope) - 1;             // 年化增长
  if (!Number.isFinite(g)) return undefined;
  const xs = pts.map((p) => p.displayYear);
  return { rate: g, fromYear: Math.min(...xs), toYear: Math.max(...xs), points: n };
}
