/**
 * structuralBasisFusion.check.ts — 端到端融合断言(Task 9,Phase 3.7 收尾):结构性置信分 s(连续
 * 加权基数抬升)通过真引擎全链路(computeValuationFloor → deriveStrikeZone → deriveOeDcf →
 * reconcileMethods → deriveValuationVerdict)正确传导,且不与 Phase 3 既有的四道下游闸(§7.1:
 * isImplausibleBand / SANE_MARGIN_MAX / assessReliability / net-net)相冲突。
 *
 * 断言清单(见 .superpowers/sdd/task-9-brief.md):
 *  A. NVDA 型(s≈0.5,基数半抬)跑全链路 → verdict 非 null(未被 80% 边际闸误杀)。
 *  B. capped=false 消费者审计:buffett_epv 基数抬升(s>0 生效);graham_epv(营业利润率灯)不受影响
 *     (它从不接收 lift 参数 —— 用 conservativeNormalizedForTest 逐位验证)。
 *  C. GOOGL 型(ai_capex + s≥0.8)→ reliable=true;NVDA 型(ai_capex + s≈0.5)→ reliable=false。
 *  D. 下行/周期 fixture(latest<avg)→ structural_confidence=0、buffett 基数=capped latest(逐字旧行为)。
 *  E. 单灯路径(operating_income 缺)→ structural_confidence 仍挂(非 undefined/0)、buffett 基数按 s 抬,不崩。
 *
 * Run: cd web && npx tsx src/lib/valuation/structuralBasisFusion.check.ts
 *
 * 只读合成 fixture,不触碰生产数据/不跑 ingest。
 */
import assert from "node:assert";
import type { LatestPrice, ValuationFloor, ValuationFloorInput, ValuationFloorYear } from "./types";
import { computeValuationFloor, conservativeNormalizedForTest } from "./epvFloor";
import { deriveStrikeZone } from "./strikeZone";
import { deriveOeDcf, reconcileMethods } from "./ownerEarningsDcf";
import { deriveValuationVerdict, assessReliability, isImplausibleBand, SANE_MARGIN_MAX, S_RELIABLE } from "./deriveValuationVerdict";
import { deriveValuationMethods } from "./deriveValuationMethods";

function floorOf(r: ReturnType<typeof computeValuationFloor>): ValuationFloor {
  assert.ok(r && "kind" in r && r.kind === "floor", "expected a full floor result");
  return r as ValuationFloor;
}

function yr(fy: number, o: Partial<ValuationFloorYear>): ValuationFloorYear {
  return { fiscal_year: fy, ...o };
}

const DGS10 = { value: 0.0425, date: "2026-07-10" };
function price(close: number): LatestPrice {
  return { close, date: "2026-07-10", currency: "USD" };
}

/** Runs the FULL chain (same wiring as the stock page) and returns every intermediate. */
function runChain(input: ValuationFloorInput, priceClose: number) {
  const floorRaw = computeValuationFloor(input);
  const floor = floorOf(floorRaw);
  const p = price(priceClose);
  const strikeZone = deriveStrikeZone(floor, p);
  const oeDcf = deriveOeDcf(floor, input.years, DGS10, p);
  const reconciliation = reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, p);
  const methods = deriveValuationMethods({ floor, strikeZone, oeDcf });
  const verdict = deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation, methods });
  return { floor, strikeZone, oeDcf, reconciliation, verdict };
}

function avg(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

// ════════════════════════════════════════════════════════════════════════════
// A + C — NVDA 型(s≈0.5,基数半抬,ai_capex distortion 挂):
//   A. 全链路 verdict 非 null,未被 isImplausibleBand/SANE_MARGIN_MAX(80%边际闸)误杀。
//   C. reliable=false(s<S_RELIABLE=0.8,ai_capex 一票否决未被 s 推翻)。
// 营收从 17,000 → 130,000(6 年 6.7×)、净利波动剧烈(2022→2023 跌 55%,一次真实下行年,建立"已验证水平"
// =9,800),随后 2024/2025 爆发到 30,000/73,000 — 拟合基数 target 远超 3×已验证水平 → untestedPeakCap 封顶
// 0.5(NVDA 真实机制:爆炸式盈利未经过第二次周期验证)。capex 两年内翻倍(400/150≈2.67×)触发 AI-hog 警告。
// ════════════════════════════════════════════════════════════════════════════
const nvdaYears: ValuationFloorYear[] = [
  yr(2026, { revenue: 200_000, operating_margin: 0.35, operating_income: 70_000, net_income: 100_000, effective_tax_rate: 0.15, shareholders_equity: 60_000, cash: 10_000, total_debt: 2_000, shares_diluted: 2_500, d_and_a: 2_000, capex: 600, working_capital: 5_000 }),
  yr(2025, { revenue: 130_000, operating_margin: 0.35, operating_income: 45_500, net_income: 73_000, effective_tax_rate: 0.15, shareholders_equity: 45_000, cash: 8_000, total_debt: 2_000, shares_diluted: 2_500, d_and_a: 1_800, capex: 400, working_capital: 4_000 }),
  yr(2024, { revenue: 60_000, operating_margin: 0.35, operating_income: 21_000, net_income: 30_000, effective_tax_rate: 0.15, shareholders_equity: 30_000, cash: 6_000, total_debt: 2_000, shares_diluted: 2_500, d_and_a: 1_200, capex: 250, working_capital: 3_000 }),
  yr(2023, { revenue: 27_000, operating_margin: 0.35, operating_income: 9_450, net_income: 4_400, effective_tax_rate: 0.15, shareholders_equity: 20_000, cash: 4_000, total_debt: 2_000, shares_diluted: 2_500, d_and_a: 900, capex: 150, working_capital: 2_000 }),
  yr(2022, { revenue: 27_000, operating_margin: 0.35, operating_income: 9_450, net_income: 9_800, effective_tax_rate: 0.15, shareholders_equity: 18_000, cash: 3_500, total_debt: 2_000, shares_diluted: 2_500, d_and_a: 800, capex: 100, working_capital: 1_800 }),
  yr(2021, { revenue: 17_000, operating_margin: 0.35, operating_income: 5_950, net_income: 4_300, effective_tax_rate: 0.15, shareholders_equity: 15_000, cash: 3_000, total_debt: 2_000, shares_diluted: 2_500, d_and_a: 700, capex: 80, working_capital: 1_500 }),
];
const nvdaInput: ValuationFloorInput = { ticker: "NVDA_LIKE", sic: 3674, years: nvdaYears };

{
  const floor = floorOf(computeValuationFloor(nvdaInput));
  console.log(`[A/C NVDA型] structural_confidence=${floor.structural_confidence?.toFixed(3)} ai_capex_distortion_warning=${floor.ai_capex_distortion_warning} high_leverage_warning=${floor.high_leverage_warning}`);
  assert.ok(floor.ai_capex_distortion_warning === true, "fixture sanity: capex 两年内翻倍 → ai_capex_distortion_warning=true");
  assert.strictEqual(floor.high_leverage_warning, false, "fixture sanity: 无高杠杆(排除干扰变量,单独隔离 ai_capex 判据)");
  assert.ok(
    floor.structural_confidence != null && floor.structural_confidence > 0.3 && floor.structural_confidence < S_RELIABLE,
    `NVDA 型 s 应'基数半抬'(0.3~0.8 区间,明显低于 S_RELIABLE=0.8),got ${floor.structural_confidence}`,
  );

  const { verdict } = runChain(nvdaInput, 300);
  assert.ok(verdict, "A: NVDA 型全链路 verdict 非 null(s 抬基数未被 isImplausibleBand/SANE_MARGIN_MAX 误杀)");
  assert.ok(!Number.isNaN(verdict!.marginPct ?? 0), "A: marginPct 非 NaN");
  assert.ok(
    verdict!.marginPct == null || verdict!.marginPct <= SANE_MARGIN_MAX,
    `A: marginPct(${verdict!.marginPct}) 未越过 80% 健壮性闸(证明抬基数没有把带撑成假深度低估)`,
  );
  assert.strictEqual(
    isImplausibleBand({ rangeLo: verdict!.rangeLo, rangeHi: verdict!.rangeHi, price: verdict!.price, marginPct: verdict!.marginPct }),
    false,
    "A: 当前带不应被健壮性闸判定坏数据",
  );
  console.log(`[A NVDA型] verdict bucket=${verdict!.bucket} marginPct=${verdict!.marginPct?.toFixed(3)} reliable=${verdict!.reliable}`);

  // C(NVDA 半): ai_capex 挂 + s(~0.5) < S_RELIABLE(0.8) → 一票否决不被推翻 → reliable=false。
  assert.strictEqual(verdict!.reliable, false, "C: NVDA 型(ai_capex 挂 + s<0.8)→ reliable=false,一票否决未被 s 推翻");
  assert.strictEqual(
    assessReliability({ floor, oeDcf: runChain(nvdaInput, 300).oeDcf }),
    false,
    "C: assessReliability 纯函数直调同样判 false(与 verdict.reliable 单一真相源一致)",
  );
}

// ════════════════════════════════════════════════════════════════════════════
// C(GOOGL 半)— 稳健复利股:营收/净利/税率/权益比例恒定复利增长(6 年 12%/yr),ROIC 恒定 ~25.5%
// (NOPAT/投入资本口径,cv=0)→ roicLongTermStrong=true;净利率(ni/revenue)全程恒定 → 收入驱动度
// ratio≈1;无下行年(validatedLevel=undefined)、target/avg 远低于 3× → untestedPeakCap 不封顶 →
// s≈1.0(≥S_RELIABLE=0.8)。capex 最近两年跳增(AI 数据中心式建设)触发同一个 ai_capex 警告,
// 但结构性高置信推翻一票否决 → reliable=true(真实 GOOGL/META 机制:AI 资本开支不否决高置信复利股)。
// ════════════════════════════════════════════════════════════════════════════
const googlFys = [2026, 2025, 2024, 2023, 2022, 2021];
const googlYears: ValuationFloorYear[] = googlFys.map((fy, i) => {
  const revenue = 300_000 / Math.pow(1.12, i);
  const operating_income = 0.30 * revenue;
  const net_income = operating_income * 0.85;
  const capex = i === 0 ? 40_000 : i === 1 ? 25_000 : 0.05 * revenue; // 最近两年跳增(AI-hog:40000/2023capex≈2.67×)
  return yr(fy, {
    revenue, operating_margin: 0.30, operating_income, net_income,
    effective_tax_rate: 0.15, shareholders_equity: revenue, cash: 0, total_debt: 0, net_debt: 0,
    shares_diluted: 5_000, d_and_a: 0.03 * revenue, capex, working_capital: 0.1 * revenue,
  });
});
const googlInput: ValuationFloorInput = { ticker: "GOOGL_LIKE", sic: 7370, years: googlYears };

{
  const floor = floorOf(computeValuationFloor(googlInput));
  console.log(`[C GOOGL型] structural_confidence=${floor.structural_confidence?.toFixed(3)} ai_capex_distortion_warning=${floor.ai_capex_distortion_warning}`);
  assert.ok(floor.ai_capex_distortion_warning === true, "fixture sanity: capex 两年内跳增 → ai_capex_distortion_warning=true(与 NVDA 型同一警告)");
  assert.ok(
    floor.structural_confidence != null && floor.structural_confidence >= S_RELIABLE,
    `GOOGL 型 s 应 ≥ S_RELIABLE=0.8,got ${floor.structural_confidence}`,
  );

  const { verdict, oeDcf } = runChain(googlInput, 100);
  assert.ok(verdict, "C: GOOGL 型全链路 verdict 非 null");
  assert.strictEqual(verdict!.reliable, true, "C: GOOGL 型(ai_capex 挂 + s≥0.8)→ reliable=true,结构性高置信推翻一票否决");
  assert.strictEqual(
    assessReliability({ floor, oeDcf }),
    true,
    "C: assessReliability 纯函数直调同样判 true",
  );
  console.log(`[C GOOGL型] verdict bucket=${verdict!.bucket} marginPct=${verdict!.marginPct?.toFixed(3)} reliable=${verdict!.reliable}`);
}

// ════════════════════════════════════════════════════════════════════════════
// B — capped=false 消费者审计:上行成长 fixture(净利 5 年 15%/yr 复利,latest≥avg,s>0 生效),
// 省略 capex/d_and_a(maintenanceCapex 不可评估 → canCorrect=false)以让两个 lamp 的 normalized_earnings
// 直接等于各自的"标准化基数"(无 D&A/维持性 capex 调整噪声),便于逐位断言:
//  1. buffett_epv.normalized_earnings > 纯 avg(net income)(s>0 抬基数生效)。
//  2. graham_epv.normalized_earnings 与"营业利润率序列平均、不传 lift"精确一致(营业利润率消费者
//     从未接收 lift 参数 —— buildGrahamLamp 调用 conservativeNormalized 时不传第三参,逐字验证)。
//  3. conservativeNormalizedForTest 钩子直接验证:同一序列有/无 lift 参数产出不同(证明 lift 机制本身
//     确有效力,graham 路径未受影响并非因为 lift 恰好无效,而是它从不消费该参数)。
// ════════════════════════════════════════════════════════════════════════════
const upsideFys = [2025, 2024, 2023, 2022, 2021];
const upsideYears: ValuationFloorYear[] = upsideFys.map((fy, i) => {
  const revenue = 100_000 / Math.pow(1.15, i);
  const net_income = 0.20 * revenue;
  return yr(fy, {
    revenue, operating_margin: 0.30, net_income, effective_tax_rate: 0.20,
    shareholders_equity: 0.5 * revenue, cash: 0.1 * revenue, total_debt: 0, shares_diluted: 1_000,
  }); // 无 capex/d_and_a → maintenanceCapex 不可评估 → 两 lamp 的 normalized_earnings 无额外调整
});
const upsideInput: ValuationFloorInput = { ticker: "UPSIDE", sic: 7370, years: upsideYears };

{
  const floor = floorOf(computeValuationFloor(upsideInput));
  console.log(`[B UPSIDE] structural_confidence=${floor.structural_confidence?.toFixed(3)}`);
  assert.ok(floor.structural_confidence != null && floor.structural_confidence > 0, "B fixture sanity: s>0(上行成长股,lift 生效前提)");

  const niSeries = upsideYears.map((y) => y.net_income!);
  const avgNi = avg(niSeries);
  console.log(`[B] avg(ni)=${avgNi.toFixed(1)} buffett_epv.normalized_earnings=${floor.buffett_epv.normalized_earnings?.toFixed(1)}`);
  assert.ok(
    floor.buffett_epv.normalized_earnings != null && floor.buffett_epv.normalized_earnings > avgNi,
    `B1: buffett_epv.normalized_earnings(${floor.buffett_epv.normalized_earnings}) 应 > 纯 avg(net income)(${avgNi}) —— s>0 抬基数生效`,
  );
  assert.ok(
    floor.buffett_epv.normalized_earnings! < Math.max(...niSeries),
    "B1: 抬升后的基数仍 < 最新峰值(连续加权,非直接拿 latest,守住 audit#2 纪律的另一半)",
  );

  const margins = upsideYears.map((y) => y.operating_margin!);
  const avgMargin = avg(margins);
  const latestRevenue = upsideYears[0].revenue!;
  const taxRate = floor.provenance.normalized_tax_rate;
  const expectedGrahamNormEarnings = avgMargin * latestRevenue * (1 - taxRate);
  console.log(`[B] expected graham normalized_earnings(avg margin,无lift)=${expectedGrahamNormEarnings.toFixed(3)} actual=${floor.graham_epv.normalized_earnings?.toFixed(3)}`);
  assert.ok(
    floor.graham_epv.normalized_earnings != null &&
      Math.abs(floor.graham_epv.normalized_earnings - expectedGrahamNormEarnings) < 1e-6,
    `B2: graham_epv.normalized_earnings 应精确等于"营业利润率序列平均 × latest revenue × (1−税率)"(无 lift 参与),` +
      `got ${floor.graham_epv.normalized_earnings} expected ${expectedGrahamNormEarnings}`,
  );

  // 直接钩子验证:同一 margin 序列,不传 lift vs 传 lift → 产出不同(证明 lift 机制本身有效力)。
  const noLift = conservativeNormalizedForTest(margins, margins[0]);
  const withLift = conservativeNormalizedForTest(margins, margins[0], { s: 0.5, target: avgMargin + 0.05 });
  assert.strictEqual(noLift.value, avgMargin, "B3: 不传 lift → 精确等于 avg(margins)(graham 路径实际调用形态)");
  assert.strictEqual(noLift.capped, false, "B3: 不传 lift 且 latest≥avg → capped=false");
  assert.ok(withLift.value > noLift.value, "B3: 传 lift(target>avg,s>0) → 值应高于不传 lift(证明参数确有效力,而非死代码)");
  assert.ok(
    Math.abs(floor.graham_epv.normalized_earnings! - expectedGrahamNormEarnings) < 1e-6 &&
      Math.abs(noLift.value * latestRevenue * (1 - taxRate) - floor.graham_epv.normalized_earnings!) < 1e-6,
    "B3: graham 实际产出与'不传 lift'钩子调用逐位一致(营业利润率消费者未被结构性置信分波及)",
  );
}

// ════════════════════════════════════════════════════════════════════════════
// D — 下行/周期 fixture(latest < avg):structural_confidence=0(target≤avg 守卫);
// buffett 基数 = capped latest(逐字旧行为,audit#2 纪律不因 Phase 3.7 改变)。
// ════════════════════════════════════════════════════════════════════════════
const downFys = [2025, 2024, 2023, 2022, 2021];
const downNis = [60, 100, 130, 110, 90]; // latest(60) < avg(98)
const downYears: ValuationFloorYear[] = downFys.map((fy, i) =>
  yr(fy, {
    revenue: 1_000, operating_margin: 0.10 + i * 0.005, net_income: downNis[i], effective_tax_rate: 0.20,
    shareholders_equity: 500, cash: 50, total_debt: 0, shares_diluted: 100,
  }),
);
const downInput: ValuationFloorInput = { ticker: "CYCLICAL", sic: 3711, years: downYears };

{
  const floor = floorOf(computeValuationFloor(downInput));
  const avgNi = avg(downNis);
  console.log(`[D CYCLICAL] avg(ni)=${avgNi} latest=${downNis[0]} structural_confidence=${floor.structural_confidence} buffett normalized_earnings=${floor.buffett_epv.normalized_earnings}`);
  assert.ok(downNis[0] < avgNi, "D fixture sanity: latest < avg(下行/周期前提)");
  assert.strictEqual(floor.structural_confidence, 0, "D: 下行股 target≤avg 守卫 → s=0");
  assert.strictEqual(
    floor.buffett_epv.normalized_earnings,
    downNis[0],
    `D: buffett 基数应精确等于 capped latest(=${downNis[0]},逐字旧行为,audit#2 纪律)`,
  );
}

// ════════════════════════════════════════════════════════════════════════════
// E — 单灯路径(operating_income 缺,revenue 存在但 operating_margin/operating_income 全无
// → marginOf 全年 undefined → 走 buildSingleLampFloor):structural_confidence 仍挂(非 undefined/0),
// buffett 基数按 s 抬升,不崩(graham 灯本身不可评估,与结构性置信分无关,是单灯前提本身)。
// ════════════════════════════════════════════════════════════════════════════
const eFys = [2026, 2025, 2024, 2023, 2022, 2021];
const eYears: ValuationFloorYear[] = eFys.map((fy, i) => {
  const revenue = 50_000 / Math.pow(1.10, i);
  const net_income = 0.15 * revenue;
  return yr(fy, {
    revenue, net_income, shares_diluted: 1_000, effective_tax_rate: 0.20,
    shareholders_equity: 0.6 * revenue, cash: 0.05 * revenue, total_debt: 0,
    // operating_margin / operating_income 刻意全部省略 → marginOf undefined → 单灯路径
  });
});
const eInput: ValuationFloorInput = { ticker: "SINGLE_LAMP", sic: 6022, years: eYears };

{
  const floor = floorOf(computeValuationFloor(eInput));
  const niSeries = eYears.map((y) => y.net_income!);
  const avgNi = avg(niSeries);
  console.log(`[E SINGLE_LAMP] graham.assessable=${floor.graham_epv.assessable} structural_confidence=${floor.structural_confidence?.toFixed(3)} avg(ni)=${avgNi.toFixed(1)} buffett normalized_earnings=${floor.buffett_epv.normalized_earnings?.toFixed(1)}`);
  assert.strictEqual(floor.graham_epv.assessable, false, "E fixture sanity: operating_income 缺 → graham lamp 不可评估(单灯前提)");
  assert.ok(
    floor.structural_confidence != null,
    "E: structural_confidence 在单灯路径仍挂(非 undefined)——buildSingleLampFloor 同样计算并传导 sc.s",
  );
  assert.ok(floor.structural_confidence! > 0, "E: 单灯路径下 s 仍能正常算出正值(不因缺 operating_income 而退化为 0/崩溃)");
  assert.ok(
    floor.buffett_epv.normalized_earnings != null && floor.buffett_epv.normalized_earnings > avgNi,
    `E: buffett 基数按 s 抬升(${floor.buffett_epv.normalized_earnings} > avg=${avgNi}),单灯路径不崩`,
  );

  // 全链路不崩:strikeZone/oeDcf/verdict 全程可跑通(single_lamp coverage,但不 throw、不 NaN)。
  const { verdict } = runChain(eInput, 50);
  if (verdict) {
    assert.ok(!Number.isNaN(verdict.marginPct ?? 0), "E: 若产出 verdict,marginPct 非 NaN");
    console.log(`[E] verdict coverage=${verdict.coverage} bucket=${verdict.bucket}`);
  } else {
    console.log("[E] verdict=null(单灯发散名可能被健壮性闸抑制,允许;关键断言是 floor 本身不崩)");
  }
}

console.log("structuralBasisFusion.check.ts ✓ all assertions passed");
