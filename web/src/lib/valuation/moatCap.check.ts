import { deriveMoatCap, CAP_STRONG, CAP_MODERATE, roicStability, ROIC_MIN_YEARS } from "./moatCap";
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

console.log(process.exitCode ? "SOME TESTS FAILED" : "ALL PASS");
