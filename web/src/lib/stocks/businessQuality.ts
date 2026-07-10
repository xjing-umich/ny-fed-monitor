import type { SecLatestSummary } from "@/lib/sec/read";

export type BusinessQuality = {
  revenueYoy: number | null; // 分数
  netMargin: number | null;
  roe: number | null;
  fcfMargin: number | null;
  asOf: string;              // 基本面 as-of; 无则 ""
  reliable: boolean;         // quality_status ∉ {low, unresolved, missing, null}
  revenueSeries: number[];   // 营收, 升序(最早→最新)
  marginSeries: number[];    // 净利率 = net_income/revenue, 升序
};

const LOW_QUALITY = new Set(["low", "unresolved", "missing"]);

/** 一条年报期(FY)行 —— 头条指标与趋势折线都从这里派生。 */
type AnnualRow = {
  revenue: number | null;
  net_income: number | null;
  period_end: string | null;
  net_margin: number | null;
  roe: number | null;
  fcf_margin: number | null;
  revenue_yoy: number | null;
};

/**
 * 从已加载的 sec.latest + sec.annual 派生生意质量读数。纯函数、零 IO。
 * quality_status 仅作可信度闸(reliable), 不作质量评级。
 *
 * 头条四指标取**最新完整财年(FY)**行, 不用 latest.latest_* 的单季字段: 单季会被
 * 一次性项目污染(如 GOOGL Q1 含 ~$37.7B 持股市值计价收益 → 净利率虚高到 56.9%,
 * 而 FY 口径 32.8% 才是常态盈利能力), 且单季净利÷期末权益的 roe 会欠算约 4 倍。
 * 用 FY 口径让头条与下方 marginSeries 折线同源自洽。无 FY 行时回退单季字段(保持
 * 薄覆盖名字的既有行为)。
 * latest=null, 或四指标全 null 且趋势序列<2 → 返回 null(整节不渲染)。
 */
export function deriveBusinessQuality(input: {
  latest: SecLatestSummary | null;
  annual: AnnualRow[];
}): BusinessQuality | null {
  const { latest, annual } = input;
  if (latest == null) return null;

  const asc = [...annual]
    .filter((r) => r.period_end != null)
    .sort((a, b) => (a.period_end as string).localeCompare(b.period_end as string));
  const revenueSeries: number[] = [];
  const marginSeries: number[] = [];
  for (const r of asc) {
    if (r.revenue != null && r.revenue > 0) {
      revenueSeries.push(r.revenue);
      if (r.net_income != null) marginSeries.push(r.net_income / r.revenue);
    }
  }

  // 头条口径: 最新 FY 行优先, 无则回退 latest.* 单季字段。
  const latestFy = asc.length ? asc[asc.length - 1] : null;
  const revenueYoy = latestFy?.revenue_yoy ?? (latestFy ? null : latest.latest_revenue_yoy);
  const netMargin = latestFy?.net_margin ?? (latestFy ? null : latest.latest_net_margin);
  const roe = latestFy?.roe ?? (latestFy ? null : latest.latest_roe);
  const fcfMargin = latestFy?.fcf_margin ?? (latestFy ? null : latest.latest_fcf_margin);
  const noMetrics = revenueYoy == null && netMargin == null && roe == null && fcfMargin == null;
  if (noMetrics && revenueSeries.length < 2) return null;

  const asOf =
    latestFy?.period_end ??
    latest.latest_10k_period_end ??
    latest.latest_10q_period_end ??
    latest.latest_filing_date ??
    "";
  const qs = latest.quality_status;
  const reliable = !(qs == null || LOW_QUALITY.has(qs));

  return { revenueYoy, netMargin, roe, fcfMargin, asOf, reliable, revenueSeries, marginSeries };
}
