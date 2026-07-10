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
// 每行带 FY 口径算好的比率(与 company_fundamentals_periods 的 FY 行同形)。
const annual = [
  { revenue: 100, net_income: 10, period_end: "2023-12-31", net_margin: 0.10, roe: 0.20, fcf_margin: 0.08, revenue_yoy: 0.05 },
  { revenue: 120, net_income: 18, period_end: "2024-12-31", net_margin: 0.15, roe: 0.25, fcf_margin: 0.12, revenue_yoy: 0.20 }, // 最新 FY
  { revenue: 0, net_income: 5, period_end: "2022-12-31", net_margin: null, roe: null, fcf_margin: null, revenue_yoy: null },   // revenue<=0 跳过序列
  { revenue: 90, net_income: null, period_end: "2021-12-31", net_margin: null, roe: null, fcf_margin: null, revenue_yoy: null },// net_income null: 入 revenueSeries, 不入 marginSeries
];

// (a) 头条四指标取最新 FY 行, 忽略 latest.* 的单季字段(防一次性项目污染, 如 GOOGL 单季 56.9%)
const bq = deriveBusinessQuality({
  latest: latest({ latest_revenue_yoy: 0.9, latest_net_margin: 0.569, latest_roe: 0.13, latest_fcf_margin: 0.09, latest_10k_period_end: "2026-03-31" }),
  annual,
});
assert(bq !== null, "有数据 → 非 null");
assert(bq!.revenueYoy === 0.20 && bq!.netMargin === 0.15 && bq!.roe === 0.25 && bq!.fcfMargin === 0.12, "头条取最新FY行, 不被单季 latest.* 污染");
// (c) 序列升序/派生/跳过。升序: 2021(90) → 2023(100) → 2024(120); 2022 revenue=0 跳过
assert(JSON.stringify(bq!.revenueSeries) === JSON.stringify([90, 100, 120]), `revenueSeries 升序去0, got ${JSON.stringify(bq!.revenueSeries)}`);
// marginSeries: 2021 net_income null 跳过 → [0.10, 0.15]
assert(bq!.marginSeries.length === 2 && Math.abs(bq!.marginSeries[0] - 0.10) < 1e-9 && Math.abs(bq!.marginSeries[1] - 0.15) < 1e-9, `marginSeries, got ${JSON.stringify(bq!.marginSeries)}`);
// 头条净利率与折线尾同源自洽
assert(bq!.netMargin === bq!.marginSeries[bq!.marginSeries.length - 1], "头条净利率 === 折线尾");
// (d) asOf 取最新 FY 期末(非 latest_10k)
assert(bq!.asOf === "2024-12-31", `asOf 取最新FY期末, got ${bq!.asOf}`);
// (b) 可信度闸(独立于 FY 口径)
assert(bq!.reliable === true, "quality_status=high → reliable");
assert(deriveBusinessQuality({ latest: latest({ quality_status: "low" }), annual })!.reliable === false, "low → 不可信");
assert(deriveBusinessQuality({ latest: latest({ quality_status: null }), annual })!.reliable === false, "null → 不可信");

// 无 FY 行 → 回退 latest.* 单季字段 + asOf 三级兜底(保持薄覆盖名字既有行为)
const noFy = deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, latest_net_margin: 0.3, latest_roe: 0.2, latest_fcf_margin: 0.11, latest_10k_period_end: "2025-12-31" }), annual: [] });
assert(noFy!.netMargin === 0.3 && noFy!.revenueYoy === 0.1 && noFy!.roe === 0.2 && noFy!.fcfMargin === 0.11, "无FY行 → 回退 latest.* 单季字段");
assert(noFy!.asOf === "2025-12-31", "无FY行 → asOf 10k 兜底");
assert(deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, latest_10q_period_end: "2025-03-31" }), annual: [] })!.asOf === "2025-03-31", "无FY行 → 10q 次级");
assert(deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, latest_filing_date: "2025-05-01" }), annual: [] })!.asOf === "2025-05-01", "无FY行 → filing 末级");

// (e) latest=null → null
assert(deriveBusinessQuality({ latest: null, annual }) === null, "latest=null → null");
// (f) FY 行比率全 null 且序列 <2 → null(降级)
assert(
  deriveBusinessQuality({ latest: latest({}), annual: [{ revenue: 100, net_income: 10, period_end: "2024-12-31", net_margin: null, roe: null, fcf_margin: null, revenue_yoy: null }] }) === null,
  "FY比率全空+序列<2 → null"
);
// 四指标全 null 但序列>=2 → 仍渲染(趋势有料)
assert(
  deriveBusinessQuality({ latest: latest({}), annual: annual.map((r) => ({ ...r, net_margin: null, roe: null, fcf_margin: null, revenue_yoy: null })) }) !== null,
  "FY比率全空但序列>=2 → 非 null"
);

console.log("businessQuality.check OK");
