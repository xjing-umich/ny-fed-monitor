import { deriveExpectations, solveImpliedGrowth, IMPLIED_G_MIN, IMPLIED_G_MAX, DEMANDING_BUFFER, historicalGrowthBaseRate, MIN_BASE_RATE_YEARS } from "./impliedExpectations";
import { dcfTier } from "./ownerEarningsDcf";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
  else console.log("ok:", msg);
}

const base = { oe0: 100, shares: 10, r: 0.09, gTerminal: 0.03 };

// 1) 一致性/反解正确：解出的 g 使 perShare ≈ price
{
  const priceAtG = dcfTier(base.oe0, 0.06, base.r, base.shares, base.gTerminal).perShare;
  const { g } = solveImpliedGrowth({ ...base, price: priceAtG });
  const recovered = dcfTier(base.oe0, g, base.r, base.shares, base.gTerminal).perShare;
  assert(Math.abs(recovered - priceAtG) / priceAtG < 1e-3, "二分反解回到原价 (<0.1%)");
  assert(Math.abs(g - 0.06) < 1e-3, "解出的 g 接近真值 0.06");
}

// 2) 单调：price 越高 → 隐含 g 越高
{
  const lo = solveImpliedGrowth({ ...base, price: dcfTier(base.oe0, 0.04, base.r, base.shares, base.gTerminal).perShare }).g;
  const hi = solveImpliedGrowth({ ...base, price: dcfTier(base.oe0, 0.12, base.r, base.shares, base.gTerminal).perShare }).g;
  assert(hi > lo, "price↑ → 隐含 g↑");
}

// 3) 越界不外插
{
  const rHi = solveImpliedGrowth({ ...base, price: 1e9 });
  assert(rHi.bounded === "above" && rHi.g === IMPLIED_G_MAX, "超高价 → bounded above, g=上限");
  const rLo = solveImpliedGrowth({ ...base, price: 0.01 });
  assert(rLo.bounded === "below" && rLo.g === IMPLIED_G_MIN, "超低价 → bounded below, g=下限");
}

// 4) 三态阈值（历史 h=0.08）
{
  const h = 0.08;
  const mk = (g: number) => deriveExpectations({ ...base, price: dcfTier(base.oe0, g, base.r, base.shares, base.gTerminal).perShare, historicalGrowth: h, suppressed: false });
  assert(mk(0.06).tier === "modest", "g*<h → modest");
  assert(mk(0.09).tier === "fair", "h<g*≤h·1.25 → fair");
  assert(mk(0.15).tier === "demanding", "g*>h·1.25 → demanding");
}

// 5) 抑制闸 / 缺历史
{
  assert(deriveExpectations({ ...base, price: 300, historicalGrowth: 0.08, suppressed: true }).assessable === false, "suppressed → 不可评估");
  assert(deriveExpectations({ ...base, oe0: -5, price: 300, historicalGrowth: 0.08, suppressed: false }).assessable === false, "oe0<=0 → 不可评估");
  assert(deriveExpectations({ ...base, price: 300, historicalGrowth: undefined, suppressed: false }).assessable === false, "缺历史 CAGR → 不可评估（无对照不出结论）");
  assert(deriveExpectations({ ...base, price: 300, historicalGrowth: -0.05, suppressed: false }).assessable === false, "历史增长≤0 → 不可评估(base-rate无意义)");
  assert(deriveExpectations({ ...base, price: 300, historicalGrowth: 0, suppressed: false }).assessable === false, "历史增长=0 → 不可评估");
}

// 5b) 次级量 impliedCapYears（solveImpliedCap 覆盖）
{
  const h = 0.08;
  const priceLo = dcfTier(base.oe0, 0.10, base.r, base.shares, base.gTerminal).perShare;
  const priceHi = dcfTier(base.oe0, 0.16, base.r, base.shares, base.gTerminal).perShare;
  const lo = deriveExpectations({ ...base, price: priceLo, historicalGrowth: h, suppressed: false });
  const hi = deriveExpectations({ ...base, price: priceHi, historicalGrowth: h, suppressed: false });
  assert(lo.impliedCapYears != null && Number.isInteger(lo.impliedCapYears) && lo.impliedCapYears > 0, "impliedCapYears 为正整数");
  assert(hi.impliedCapYears != null && lo.impliedCapYears != null && hi.impliedCapYears >= lo.impliedCapYears, "price↑ → 隐含 CAP 年数不减");
}

// 6) base-rate：干净 10%/年营收序列 → ≈0.10
{
  const yrs = [2019, 2020, 2021, 2022, 2023, 2024].map((fy, i) => ({
    fiscal_year: fy, revenue: 100 * Math.pow(1.10, i),
  })) as unknown as import("./types").ValuationFloorYear[];
  const g = historicalGrowthBaseRate(yrs);
  assert(g != null && Math.abs(g - 0.10) < 5e-3, "回归 base-rate 复原 10%/年");
}
// 7) base-rate 稳健性：中间插一个异常年，斜率仍接近真值(端点法会崩，回归不会)
{
  const rev = [100, 110, 55, 133, 146, 161]; // 第三年异常腰斩
  const yrs = rev.map((r, i) => ({ fiscal_year: 2019 + i, revenue: r })) as unknown as import("./types").ValuationFloorYear[];
  const g = historicalGrowthBaseRate(yrs)!;
  assert(g > 0.03 && g < 0.13, "单异常年不把回归 base-rate 带偏到离谱");
}
// 8) 不足 3 点 → undefined
{
  const yrs = [{ fiscal_year: 2023, revenue: 100 }, { fiscal_year: 2024, revenue: 110 }] as unknown as import("./types").ValuationFloorYear[];
  assert(historicalGrowthBaseRate(yrs) === undefined, "少于3个FY点→undefined→抑制");
}
assert(MIN_BASE_RATE_YEARS === 3, "MIN_BASE_RATE_YEARS=3");

console.log(process.exitCode ? "SOME TESTS FAILED" : "ALL PASS");
