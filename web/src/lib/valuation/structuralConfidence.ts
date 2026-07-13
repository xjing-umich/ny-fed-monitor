import type { ValuationFloorYear } from "./types";

// ── 待标定常量(Task 8 真数据确认;初值取 spec §9 建议)──
export const MIN_STRUCT_YEARS = 3;

export const DOWNTURN_DROP = 0.20;          // 盈利 YoY 跌 ≥20% = 一次"下行年"
export const UNVALIDATED_JUMP_RATIO = 3.0;  // target > 3× 已验证水平 = 未验证爆炸峰值 → 封
export const UNTESTED_S_CAP = 0.5;          // 陡跳且未验证 → s 封 0.5

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

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * 已验证盈利水平 = 扛过一次 ≥downturnDrop 下行年的最高盈利(见过周期另一面的水平)。
 * 按财年升序遍历,下行年 i: ni[i] < ni[i-1]×(1−downturnDrop);取所有下行年"前一年"盈利的最大值。
 * 无下行年 → undefined(调用方拿 avg 当参照)。
 */
export function validatedEarningsLevel(years: ValuationFloorYear[], downturnDrop: number): number | undefined {
  const seq = years
    .filter((y) => y.net_income != null && Number.isFinite(y.net_income))
    .slice()
    .sort((a, b) => a.fiscal_year - b.fiscal_year)
    .map((y) => y.net_income as number);
  let validated: number | undefined = undefined;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] < seq[i - 1] * (1 - downturnDrop)) {
      const peak = seq[i - 1];
      validated = validated == null ? peak : Math.max(validated, peak);
    }
  }
  return validated;
}

/**
 * 未验证峰值顶:s 上限。ref = 已验证水平 ?? avg;当前拟合水平 target 若 > UNVALIDATED_JUMP_RATIO×ref
 * = 未验证爆炸峰值 → 封 UNTESTED_S_CAP;否则不封(=1)。
 * ★ GOOGL/NVDA 都高于各自验证水平,靠"跳升倍数"(GOOGL~1.7× vs NVDA~12×)才分得开——不是"是否高于"。
 * 注:spec §5.2 曾列"温和抬幅豁免"(target≤1.3×avg 不封)为第二条子句;实现中省略,因跳升倍数判据
 * 已包含它——平滑复利股 target 通常 ~1.1–1.3×avg,远不及 UNVALIDATED_JUMP_RATIO×ref,天然不封(校准 AAPL 坐实)。
 */
export function untestedPeakCap(input: { target: number; avg: number; validatedLevel: number | undefined }): number {
  const ref = input.validatedLevel ?? input.avg;
  if (ref > 0 && input.target > UNVALIDATED_JUMP_RATIO * ref) return UNTESTED_S_CAP;
  return 1;
}

/**
 * 收入驱动度 ∈[0,1]:盈利上行来自营收扩张(真需求,结构性)还是净利润率扩张(可能是周期定价峰值)。
 * gRev=营收 log 斜率,gMar=净利润率(ni/rev)log 斜率;ratio=clamp01(gRev/(gRev+max(0,gMar)))。
 * 利润率收缩(gMar<0,营收扛起增长)→ 分母=gRev → ratio=1。营收不增(gRev≤0)或点不足 → 0(保守)。
 */
export function revenueDrivenRatio(years: ValuationFloorYear[]): number {
  const revPts = years
    .filter((y) => y.revenue != null && (y.revenue as number) > 0)
    .map((y) => ({ x: y.fiscal_year, y: Math.log(y.revenue as number) }));
  const marPts = years
    .filter((y) => y.revenue != null && (y.revenue as number) > 0 && y.net_income != null && (y.net_income as number) > 0)
    .map((y) => ({ x: y.fiscal_year, y: Math.log((y.net_income as number) / (y.revenue as number)) }));
  if (revPts.length < MIN_STRUCT_YEARS || marPts.length < MIN_STRUCT_YEARS) return 0;
  const rev = logSlope(revPts);
  const mar = logSlope(marPts);
  if (!rev || !mar) return 0;
  const gRev = rev.slope;
  const gMar = mar.slope;
  if (gRev <= 0) return 0;
  return clamp01(gRev / (gRev + Math.max(0, gMar)));
}

export const W_REVENUE_DRIVEN = 0.6;
export const W_ROIC_DURABILITY = 0.4;

function avg(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

/**
 * 结构性置信分 s∈[0,1](连续加权基数用)。s 高 = 当前盈利结构性、可作正常化基数 + ai_capex 未扭曲可靠性。
 * 加分:收入驱动度 + ROIC 久期(roicLongTermStrong,调用方从原始 ROIC 算好传入)。
 * 硬顶:未验证峰值跳升倍数(NVDA 半放)。全部输入为原始 revenue/net_income/ROIC 序列——不碰 normalized/moat/EPV(破循环依赖)。
 * target(连续加权用)= max(avg, min(latest, trendFit)),保证 ≥avg(单调、只上不下);trendFit 不可算 → 回退 latest。
 */
export function structuralConfidence(input: {
  years: ValuationFloorYear[];
  allYears: ValuationFloorYear[];
  roicLongTermStrong: boolean;
}): { s: number; target: number | undefined } {
  const nis = input.years.map((y) => y.net_income).filter((v): v is number => v != null && Number.isFinite(v));
  if (nis.length === 0) return { s: 0, target: undefined };
  const a = avg(nis);
  const latest = input.years[0]?.net_income;
  const trendFit = earningsTrendFittedLatest(input.years);
  let target: number | undefined;
  if (trendFit != null) target = Math.max(a, Math.min(latest ?? trendFit, trendFit));
  else if (latest != null && Number.isFinite(latest)) target = Math.max(a, latest);
  else target = undefined;

  if (target == null || target <= a) return { s: 0, target };

  const rawScore =
    W_REVENUE_DRIVEN * revenueDrivenRatio(input.years) + W_ROIC_DURABILITY * (input.roicLongTermStrong ? 1 : 0);
  const cap = untestedPeakCap({
    target,
    avg: a,
    validatedLevel: validatedEarningsLevel(input.allYears, DOWNTURN_DROP),
  });
  return { s: clamp01(Math.min(rawScore, cap)), target };
}
