import type { ValuationFloorYear } from "./types";

// ── 待标定常量(Task 8 真数据确认;初值取 spec §9 建议)──
export const MIN_STRUCT_YEARS = 3;

export function logSlope(points: { x: number; y: number }[]): { slope: number; intercept: number } | undefined {
  const n = points.length;
  if (n < 2) return undefined;
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (!(denom > 0)) return undefined;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

/**
 * 盈利序列 log 回归拟合的最新财年水平(平滑单年尖峰),而非裸 latest。
 * 正盈利守卫:log 要求正值;正点 <MIN_STRUCT_YEARS → undefined(调用方回退 latest)。
 * 只吃传入的 FY 行(调用方保证 fiscal_period=FY)。刻意不复用 growthBaseRate(那是营收增长率、
 * 且处在 impliedExpectations↔ownerEarningsDcf 循环敏感模块,保持独立)。
 */
export function earningsTrendFittedLatest(years: ValuationFloorYear[]): number | undefined {
  const pts = years
    .filter((y) => y.net_income != null && Number.isFinite(y.net_income) && (y.net_income as number) > 0)
    .map((y) => ({ x: y.fiscal_year, y: Math.log(y.net_income as number) }));
  if (pts.length < MIN_STRUCT_YEARS) return undefined;
  const fit = logSlope(pts);
  if (!fit) return undefined;
  const maxYear = Math.max(...pts.map((p) => p.x));
  const v = Math.exp(fit.intercept + fit.slope * maxYear);
  return Number.isFinite(v) ? v : undefined;
}
