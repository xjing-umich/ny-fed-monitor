import { deriveBusinessQuality } from "./businessQuality";
import type { SecLatestSummary } from "@/lib/sec/read";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exit(1); } }

function latest(p: Partial<SecLatestSummary>): SecLatestSummary {
  return {
    ticker: "X", company_name: "X", latest_10k_period_end: null, latest_10q_period_end: null,
    latest_filing_date: null, latest_revenue: null, latest_net_income: null, latest_fcf: null,
    latest_cash: null, latest_debt: null, latest_equity: null, latest_revenue_yoy: null,
    latest_net_margin: null, latest_roe: null, latest_fcf_margin: null, quality_status: "high", ...p,
  } as SecLatestSummary;
}
const annual = [
  { revenue: 100, net_income: 10, period_end: "2023-12-31" }, // 净利率 0.10
  { revenue: 120, net_income: 18, period_end: "2024-12-31" }, // 0.15
  { revenue: 0, net_income: 5, period_end: "2022-12-31" },    // revenue<=0 跳过
  { revenue: 90, net_income: null, period_end: "2021-12-31" },// net_income null: 入 revenueSeries, 不入 marginSeries
];

// (a) 指标透传 + (c) 序列升序/派生/跳过
const bq = deriveBusinessQuality({
  latest: latest({ latest_revenue_yoy: 0.2, latest_net_margin: 0.15, latest_roe: 0.25, latest_fcf_margin: 0.12, latest_10k_period_end: "2024-12-31" }),
  annual,
});
assert(bq !== null, "有数据 → 非 null");
assert(bq!.revenueYoy === 0.2 && bq!.netMargin === 0.15 && bq!.roe === 0.25 && bq!.fcfMargin === 0.12, "四指标透传");
// 升序: 2021(90) → 2023(100) → 2024(120); 2022 revenue=0 跳过
assert(JSON.stringify(bq!.revenueSeries) === JSON.stringify([90, 100, 120]), `revenueSeries 升序去0, got ${JSON.stringify(bq!.revenueSeries)}`);
// marginSeries: 2021 net_income null 跳过 → [0.10, 0.15]
assert(bq!.marginSeries.length === 2 && Math.abs(bq!.marginSeries[0] - 0.10) < 1e-9 && Math.abs(bq!.marginSeries[1] - 0.15) < 1e-9, `marginSeries, got ${JSON.stringify(bq!.marginSeries)}`);
// (d) asOf 三级兜底: 10k 优先
assert(bq!.asOf === "2024-12-31", `asOf 10k 优先, got ${bq!.asOf}`);
// (b) 可信度闸
assert(bq!.reliable === true, "quality_status=high → reliable");
assert(deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, quality_status: "low" }), annual })!.reliable === false, "low → 不可信");
assert(deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, quality_status: null }), annual })!.reliable === false, "null → 不可信");
// asOf 兜底次级: 无 10k → 10q → filing
assert(deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, latest_10q_period_end: "2025-03-31" }), annual })!.asOf === "2025-03-31", "10q 次级");
assert(deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, latest_filing_date: "2025-05-01" }), annual })!.asOf === "2025-05-01", "filing 末级");
// (e) latest=null → null
assert(deriveBusinessQuality({ latest: null, annual }) === null, "latest=null → null");
// (f) 四指标全 null 且序列 <2 → null(降级)
assert(deriveBusinessQuality({ latest: latest({}), annual: [{ revenue: 100, net_income: 10, period_end: "2024-12-31" }] }) === null, "全空+序列<2 → null");
// 四指标全 null 但序列>=2 → 仍渲染(趋势有料)
assert(deriveBusinessQuality({ latest: latest({}), annual }) !== null, "全空但序列>=2 → 非 null");

console.log("businessQuality.check OK");
