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

/**
 * 从已加载的 sec.latest + sec.annual 派生生意质量读数。纯函数、零 IO。
 * quality_status 仅作可信度闸(reliable), 不作质量评级。
 * latest=null, 或四指标全 null 且趋势序列<2 → 返回 null(整节不渲染)。
 */
export function deriveBusinessQuality(input: {
  latest: SecLatestSummary | null;
  annual: { revenue: number | null; net_income: number | null; period_end: string | null }[];
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

  const revenueYoy = latest.latest_revenue_yoy;
  const netMargin = latest.latest_net_margin;
  const roe = latest.latest_roe;
  const fcfMargin = latest.latest_fcf_margin;
  const noMetrics = revenueYoy == null && netMargin == null && roe == null && fcfMargin == null;
  if (noMetrics && revenueSeries.length < 2) return null;

  const asOf = latest.latest_10k_period_end ?? latest.latest_10q_period_end ?? latest.latest_filing_date ?? "";
  const qs = latest.quality_status;
  const reliable = !(qs == null || LOW_QUALITY.has(qs));

  return { revenueYoy, netMargin, roe, fcfMargin, asOf, reliable, revenueSeries, marginSeries };
}
