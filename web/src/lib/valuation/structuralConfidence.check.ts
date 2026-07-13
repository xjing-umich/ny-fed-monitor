import assert from "node:assert";
import type { ValuationFloorYear } from "./types";
import { logSlope, earningsTrendFittedLatest, revenueDrivenRatio, MIN_STRUCT_YEARS } from "./structuralConfidence";

function yr(fiscal_year: number, net_income: number): ValuationFloorYear {
  return { fiscal_year, net_income } as ValuationFloorYear;
}

// logSlope: ln(y)=x 的完美线性 → slope≈1
{
  const pts = [1, 2, 3, 4].map((x) => ({ x, y: x })); // y=x,非 log 这里直接给 y
  const r = logSlope(pts)!;
  assert.ok(Math.abs(r.slope - 1) < 1e-9, "slope=1");
  assert.ok(Math.abs(r.intercept - 0) < 1e-9, "intercept=0");
}
// logSlope: <2 点 → undefined
assert.strictEqual(logSlope([{ x: 1, y: 1 }]), undefined, "single point undefined");

// earningsTrendFittedLatest: 稳定 10% 复合增长的净利序列 → 拟合最新 ≈ 最新实际
{
  const years = [2020, 2021, 2022, 2023, 2024].map((y, i) => yr(y, 100 * Math.pow(1.1, i)));
  const fit = earningsTrendFittedLatest(years)!;
  const actualLatest = 100 * Math.pow(1.1, 4); // ~146.4
  assert.ok(Math.abs(fit - actualLatest) / actualLatest < 0.02, `fit≈latest, got ${fit}`);
}
// earningsTrendFittedLatest: 单年尖峰被回归平滑 → 拟合 < 尖峰
{
  const years = [yr(2020, 100), yr(2021, 105), yr(2022, 110), yr(2023, 115), yr(2024, 400)];
  const fit = earningsTrendFittedLatest(years)!;
  assert.ok(fit < 400, `spike smoothed, fit=${fit} < 400`);
}
// 正盈利守卫: 含 ≤0 年使正点 <3 → undefined
{
  const years = [yr(2022, -10), yr(2023, -5), yr(2024, 120)];
  assert.strictEqual(earningsTrendFittedLatest(years), undefined, "insufficient positive points");
}
console.log("Task1 structuralConfidence trend-fit: OK");

function yrRev(fiscal_year: number, revenue: number, net_income: number): ValuationFloorYear {
  return { fiscal_year, revenue, net_income } as ValuationFloorYear;
}

// 纯营收驱动(利润率恒定)→ ratio≈1
{
  const years = [2020, 2021, 2022, 2023].map((y, i) => yrRev(y, 1000 * Math.pow(1.2, i), 100 * Math.pow(1.2, i)));
  assert.ok(revenueDrivenRatio(years) > 0.95, "revenue-driven → ~1");
}
// 纯利润率驱动(营收恒定,净利涨)→ ratio≈0
{
  const years = [2020, 2021, 2022, 2023].map((y, i) => yrRev(y, 1000, 50 * Math.pow(1.3, i)));
  assert.ok(revenueDrivenRatio(years) < 0.05, "margin-driven → ~0");
}
// 营收驱动 + 利润率反而收缩 → 全归营收,clamp 到 1
{
  const years = [yrRev(2020, 1000, 200), yrRev(2021, 1500, 240), yrRev(2022, 2200, 300), yrRev(2023, 3200, 380)];
  assert.ok(revenueDrivenRatio(years) > 0.95, "margin drag → revenue ~1");
}
console.log("Task2 revenueDrivenRatio: OK");
