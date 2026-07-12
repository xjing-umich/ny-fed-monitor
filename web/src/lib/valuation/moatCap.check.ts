import { deriveMoatCap, CAP_STRONG, CAP_MODERATE, roicStability, ROIC_MIN_YEARS, durabilityDeclined, ROIC_SANITY, roicTrend, ROIC_TREND_MIN_YEARS, sustainableGrowth, SUSTAINABLE_MIN_YEARS } from "./moatCap";
import type { ValuationFloorYear } from "./types";
function assert(c: boolean, m: string){ if(!c){console.error("FAIL:",m);process.exitCode=1;} else console.log("ok:",m); }
const strongMoat = { signal: "franchise", epv_per_share_compared: 30, asset_per_share_compared: 10, dual_test_passed: true } as any; // ratio 3.0

// 强档：强franchise + 未下滑 + 无红旗 + ROIC 稳定 → CAP_STRONG
{ const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: false, suppressedFlags: false, roicStable: true });
  assert(r.grade==="strong" && r.capYears===CAP_STRONG && r.durablePassed, "强franchise+稳定 → CAP 20"); }

// 强比率但盈利下滑 → 降中档
{ const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: true, suppressedFlags: false, roicStable: true });
  assert(r.grade==="moderate" && r.capYears===CAP_MODERATE, "强比率但 declined → 降中档 10"); }

// 强比率但 ROIC 不稳 → 降中档
{ const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: false, suppressedFlags: false, roicStable: false });
  assert(r.grade==="moderate", "强比率但 ROIC 不稳 → 降中档"); }

// 有红旗 → 降中档（franchise 仍在）
{ const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 3.0, declined: false, suppressedFlags: true, roicStable: true });
  assert(r.grade==="moderate", "红旗 → 不给强档 CAP"); }

// 中franchise（ratio 1.5）→ 中档
{ const mid = { signal:"franchise", epv_per_share_compared:15, asset_per_share_compared:10, dual_test_passed:true } as any;
  const r = deriveMoatCap({ moat: mid, epvAvRatio: 1.5, declined:false, suppressedFlags:false, roicStable:true });
  assert(r.grade==="moderate" && r.capYears===CAP_MODERATE, "中franchise → CAP 10"); }

// 非 franchise → CAP 0
{ const commodity = { signal:"commodity" } as any;
  const r = deriveMoatCap({ moat: commodity, epvAvRatio: 0.9, declined:false, suppressedFlags:false, roicStable:undefined });
  assert(r.grade==="none" && r.capYears===0, "commodity → CAP 0"); }

// ── roicStability (Step 5) ──────────────────────────────────────────────────

function fyYears(n: number): ValuationFloorYear[] {
  return Array.from({ length: n }, (_, i) => ({ fiscal_year: 2020 + i }));
}

// 全部 ROIC 高于贴现率 → true
{ const years = fyYears(4);
  const icMap = new Map(years.map((y, i) => [y.fiscal_year, 100]));
  const npMap = new Map(years.map((y, i) => [y.fiscal_year, 15])); // ROIC 0.15 每年，贴现率 0.09
  const r = roicStability({
    fyYears: years,
    investedCapitalOf: (y) => icMap.get(y.fiscal_year),
    nopatOf: (y) => npMap.get(y.fiscal_year),
    discountRate: 0.09,
  });
  assert(r === true, "全部年份 ROIC>贴现率 → true"); }

// 半数以下高于贴现率 → false
{ const years = fyYears(4);
  const npByYear = [5, 5, 15, 15]; // 只有 2 of 4 (50%, < 2/3) 高于贴现率 0.09 (ROIC 0.05 vs 0.15)
  const icMap = new Map(years.map((y) => [y.fiscal_year, 100]));
  const npMap = new Map(years.map((y, i) => [y.fiscal_year, npByYear[i]]));
  const r = roicStability({
    fyYears: years,
    investedCapitalOf: (y) => icMap.get(y.fiscal_year),
    nopatOf: (y) => npMap.get(y.fiscal_year),
    discountRate: 0.09,
  });
  assert(r === false, "半数以下 ROIC>贴现率 → false"); }

// <3 年 → undefined
{ const years = fyYears(2);
  const icMap = new Map(years.map((y) => [y.fiscal_year, 100]));
  const npMap = new Map(years.map((y) => [y.fiscal_year, 15]));
  const r = roicStability({
    fyYears: years,
    investedCapitalOf: (y) => icMap.get(y.fiscal_year),
    nopatOf: (y) => npMap.get(y.fiscal_year),
    discountRate: 0.09,
  });
  assert(r === undefined, `<${ROIC_MIN_YEARS} 年 → undefined`); }

// ── BUG1: negative-equity invested-capital → investedCapitalOf undefined → all years skipped ──
// (This is the epvFloor-layer investedCapitalOf contract under test, not roicStability's own
// filtering — roicStability just proves it degrades gracefully when the caller supplies undefined
// consistently, exactly as epvFloor's fixed investedCapitalOf now does for equity<=0.)
{
  const years = fyYears(4);
  // Simulate the FIXED investedCapitalOf: equity<=0 (buyback-driven negative equity, e.g. AZO/HD/MCD/DPZ)
  // → undefined for every year, never a tiny/negative denominator that would blow up ROIC.
  const negativeEquityInvestedCapitalOf = () => undefined;
  const npMap = new Map(years.map((y) => [y.fiscal_year, 15]));
  const r = roicStability({
    fyYears: years,
    investedCapitalOf: negativeEquityInvestedCapitalOf,
    nopatOf: (y) => npMap.get(y.fiscal_year),
    discountRate: 0.10,
  });
  assert(r === undefined, "BUG1: all-negative-equity years → investedCapitalOf undefined throughout → roicStability undefined (not a false-positive stable=true)");
}

// ── BUG1: ROIC sanity — a year with ROIC > 300% (tiny positive invested capital, the
// near-zero-equity edge just before it flips negative) is culled from the stability sample ────
{
  const years = fyYears(4);
  // 3 normal years (ROIC 15% > hurdle) + 1 distorted year (IC=1, NOPAT=50 → ROIC 5000% >> ROIC_SANITY).
  const icByYear = [100, 100, 100, 1];
  const npByYear = [15, 15, 15, 50];
  const icMap = new Map(years.map((y, i) => [y.fiscal_year, icByYear[i]]));
  const npMap = new Map(years.map((y, i) => [y.fiscal_year, npByYear[i]]));
  const r = roicStability({
    fyYears: years,
    investedCapitalOf: (y) => icMap.get(y.fiscal_year),
    nopatOf: (y) => npMap.get(y.fiscal_year),
    discountRate: 0.10,
  });
  // The distorted year (ROIC 5000% > ROIC_SANITY=300%) is culled → only 3 (all-stable) years remain → true.
  // Without the BUG1 sanity fix, that year would count toward "above" and still read true, masking
  // that the underlying IC=1 was a basis-distortion artifact rather than a real capital-light franchise.
  assert(r === true, `BUG1 sanity: >${ROIC_SANITY * 100}% ROIC year culled, remaining 3 normal years → stable=true`);
}

// ── BUG2: durabilityDeclined — single-source endpoint comparison (max/min fiscal_year, order-agnostic) ──
{
  const rising: ValuationFloorYear[] = [
    { fiscal_year: 2021, net_income: 100 },
    { fiscal_year: 2022, net_income: 110 },
    { fiscal_year: 2023, net_income: 121 },
  ];
  assert(durabilityDeclined(rising) === false, "durabilityDeclined: rising NI (latest > oldest) → false");

  const declining: ValuationFloorYear[] = [
    { fiscal_year: 2023, net_income: 80 }, // out of order on purpose — function must not assume sorted input
    { fiscal_year: 2021, net_income: 100 },
    { fiscal_year: 2022, net_income: 90 },
  ];
  assert(durabilityDeclined(declining) === true, "durabilityDeclined: latest NI (80) < oldest (100) → true, order-agnostic");

  const missing: ValuationFloorYear[] = [{ fiscal_year: 2023, net_income: 80 }, { fiscal_year: 2021 }];
  assert(durabilityDeclined(missing) === false, "durabilityDeclined: missing endpoint net_income → false (no false decline)");

  assert(durabilityDeclined([]) === false, "durabilityDeclined: empty input → false, no crash");
}

// ── roicTrend(Phase 2.5:回报型久期闸,排除最新2年 surge) ──────────────────────
// 用固定 IC=100 的合成序列;nopat 映射直接给 ROIC(nopat/100)。fyYears(n) 造 2020..2020+n-1。
function roicYears(nopatByFyDesc: number[]): { years: ValuationFloorYear[]; np: Map<number, number> } {
  // nopatByFyDesc 为 most-recent-first;构造升序 fiscal_year 的 years,np 按 fiscal_year 映射。
  const n = nopatByFyDesc.length;
  const years = Array.from({ length: n }, (_, i) => ({ fiscal_year: 2020 + i })) as ValuationFloorYear[];
  const np = new Map<number, number>();
  years.forEach((y, i) => { np.set(y.fiscal_year, nopatByFyDesc[n - 1 - i]); }); // 升序索引 ↔ most-recent-first 值
  return { years, np };
}
const ic100 = () => 100;

// A) 稳定但最新2年 surge(分母压低)→ 排除后成熟段全稳 → "stable"
{ const { years, np } = roicYears([5, 5, 20, 20, 20, 20]); // most-recent-first:2025,2024 surge;2023..2020 稳
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic100, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === "stable", "roicTrend: 最新2年 surge 被排除,成熟段稳 → stable(不自我拆台)"); }

// B) 成熟段真下滑 → "declining"
{ const { years, np } = roicYears([5, 5, 10, 11, 20, 22]); // 成熟 most-recent-first:0.10,0.11,0.20,0.22
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic100, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === "declining", "roicTrend: 成熟段较新均值 << 较旧均值 → declining"); }

// C) 成熟段 <4 年(总5年,去2 → 3)→ undefined
{ const { years, np } = roicYears([5, 5, 20, 20, 20]);
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic100, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === undefined, "roicTrend: 成熟段<ROIC_TREND_MIN_YEARS → undefined(不可评估→不压)"); }

// D) 成熟段小幅波动(未过阈值)→ "stable"
{ const { years, np } = roicYears([5, 5, 18, 20, 19, 21]); // 成熟 newer 0.19 vs older 0.20,跌幅<15%
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic100, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === "stable", "roicTrend: 成熟段小幅波动未破 ROIC_TREND_DROP → stable"); }

// E) 较旧段均值 ≤ 0(历史即不盈利)→ "stable"(不做负值比值,交给 roicStable/signal 兜)
{ const { years, np } = roicYears([5, 5, -3, -4, -5, -6]);
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic100, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === "stable", "roicTrend: 较旧段 ROIC≤0 → stable(负基不判下滑)"); }

// F) 有效性过滤:一年 IC≤0(投入资本无效)被跳过,不破坏趋势判定
{ const { years, np } = roicYears([5, 5, 20, 20, 20, 20]);
  const ic = (y: ValuationFloorYear) => (y.fiscal_year === 2022 ? undefined : 100); // 跳过一年
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === undefined || r === "stable", "roicTrend: 无效年跳过后仍不误报 declining"); }

// ── sustainableGrowth(Task 1:g = ROIC × 净再投资率,基本面上限) ──────────────

// G) 稳健:ROIC 20% × 净再投资率 40% → g ≈ 8%
{ const years = [2020,2021,2022,2023].map((fy,i)=>({ fiscal_year: fy,
    operating_income: 20, income_tax_expense: 0, capex: 12, d_and_a: 4, working_capital: 0,
  })) as ValuationFloorYear[];
  const r = sustainableGrowth({ fyYears: years,
    nopatOf: () => 20, investedCapitalOf: () => 100 });
  assert(r != null && Math.abs(r - 0.20*((12-4)/20)) < 1e-6, "sustainableGrowth = ROIC×净再投资率 (0.20×0.40=0.08)"); }
// H) NOPAT≤0 的年被有效性过滤;有效年 <SUSTAINABLE_MIN_YEARS → undefined
{ const years = [2022,2023].map((fy)=>({ fiscal_year: fy, capex: 10, d_and_a: 3 })) as ValuationFloorYear[];
  const r = sustainableGrowth({ fyYears: years, nopatOf: () => 20, investedCapitalOf: () => 100 });
  assert(r === undefined, `<${SUSTAINABLE_MIN_YEARS} 有效年 → undefined`); }
// I) 再投资率为负(D&A>capex,净收缩)→ clamp 到 0(不给负增长,交给 declined 处理)
{ const years = [2020,2021,2022,2023].map((fy)=>({ fiscal_year: fy, capex: 2, d_and_a: 8, working_capital: 0 })) as ValuationFloorYear[];
  const r = sustainableGrowth({ fyYears: years, nopatOf: () => 20, investedCapitalOf: () => 100 });
  assert(r === 0, "净再投资率<0 → g clamp 到 0"); }
// J) investedCapital 全 undefined(负权益)→ undefined
{ const years = [2020,2021,2022,2023].map((fy)=>({ fiscal_year: fy, capex: 12, d_and_a: 4 })) as ValuationFloorYear[];
  const r = sustainableGrowth({ fyYears: years, nopatOf: () => 20, investedCapitalOf: () => undefined });
  assert(r === undefined, "investedCapital 不可得 → undefined"); }

console.log(process.exitCode ? "SOME TESTS FAILED" : "ALL PASS");
