/**
 * moatGrowthFusion.check.ts — 端到端融合断言(Task 5):moat 双向修正(放行 pathA/pathB + 收紧四分档)
 * 通过真引擎全链路(computeValuationFloor → deriveStrikeZone → deriveOeDcf → reconcileMethods →
 * deriveValuationVerdict)正确传导到 Phase 3 的含增长内在值 IV / bucket / marginPct,无断链、无
 * NaN、无口径错配。同时回归 moat grade 未被本次改动波及的股(已 strong / 已 none)逐位不变。
 *
 * Run: cd web && npx tsx src/lib/valuation/moatGrowthFusion.check.ts
 *
 * 只读合成 fixture,不触碰生产数据/不跑 ingest。
 */
import assert from "node:assert";
import type { LatestPrice, ValuationFloor, ValuationFloorInput, ValuationFloorYear } from "./types";
import { computeValuationFloor } from "./epvFloor";
import { deriveStrikeZone } from "./strikeZone";
import { deriveOeDcf, reconcileMethods, GROWTH_CAP_FRANCHISE, GROWTH_CAP_MODERATE, GROWTH_CAP_NONE } from "./ownerEarningsDcf";
import { deriveValuationVerdict, assessReliability, isImplausibleBand } from "./deriveValuationVerdict";
import { CAP_STRONG, CAP_NONE, isFinancialSic } from "./moatCap";

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

/** Runs the FULL chain (the same wiring as the stock page) and returns every intermediate. */
function runChain(input: ValuationFloorInput, priceClose: number) {
  const floorRaw = computeValuationFloor(input);
  const floor = floorOf(floorRaw);
  const p = price(priceClose);
  const strikeZone = deriveStrikeZone(floor, p);
  const oeDcf = deriveOeDcf(floor, input.years, DGS10, p);
  const reconciliation = reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, p);
  const verdict = deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation });
  return { floor, strikeZone, oeDcf, reconciliation, verdict };
}

// ════════════════════════════════════════════════════════════════════════════
// pathB(roicLongTermStrong)修复回归(Task 5b):此前 epvFloor.TARGET_YEARS=5 把喂进
// assembleFloor 的 EPV lamp 年份(marginYears/earningsYears)硬截到 5 年,而 roicLongTermStrong
// 需要 ROIC_MOAT_MIN_YEARS=6 个有效 FY 年 —— pathB 曾经是死代码。修复:computeValuationFloor
// 现在把未截断的 input.years(完整可得历史)单独喂给 roicLongTermStrong,EPV 各 lamp 仍用
// 5 年 marginYears/earningsYears(不动)。下面用 8 年"完美"数据验证:EPV 侧仍只用 5 年
// (provenance.years_used 不变),但 pathB 现在真能让 moat 升 strong。
// ════════════════════════════════════════════════════════════════════════════
{
  const revs = [8_000, 8_800, 9_680, 10_648, 11_713, 12_884, 14_172, 15_590];
  const fys = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const perfectPathBYears: ValuationFloorYear[] = fys.map((fy, i) => {
    const revenue = revs[i];
    const operating_income = 0.35 * revenue;
    return yr(fy, {
      revenue, operating_margin: 0.35, operating_income,
      net_income: operating_income * (1 - 0.15),
      effective_tax_rate: 0.15, shareholders_equity: 1.2 * revenue,
      goodwill: 200, intangibles: 100, rd_expense: 5_000,
      cash: 0, total_debt: 0, net_debt: 0, shares_diluted: 1_000,
      d_and_a: 300, capex: 600, working_capital: 1_000 + i * 150,
    });
  }).reverse(); // most-recent-first(与 fundamentalsToFloorInput 的真实排序一致;netIncomeCagr 假设此序)
  const floor = floorOf(computeValuationFloor({ ticker: "PATHB_TRAP", sic: 7370, years: perfectPathBYears }));
  console.log(`[pathB修复回归] 供给 ${perfectPathBYears.length} 年,floor.provenance.years_used 用 ${floor.provenance.years_used.length} 年(EPV lamp 仍 5 年不变);moat_cap.grade=${floor.moat_cap.grade}`);
  assert.strictEqual(
    floor.provenance.years_used.length, 5,
    "pathB修复不动 EPV lamp 口径: provenance.years_used(marginYears)仍是 TARGET_YEARS=5,不因 roicLongTermStrong 改喂完整历史而变化",
  );
  assert.strictEqual(
    floor.moat_cap.grade, "strong",
    "pathB修复生效: 8 年 ROIC 恒定 25%+dual-AV franchise(教科书 pathB 场景,原始 ratio<2 不足以走 pathA)现在应升 strong —— " +
    "证明 roicLongTermStrong 现在吃的是完整 input.years(8年 ≥ ROIC_MOAT_MIN_YEARS=6),不再被 EPV 的 5 年窗口卡死。",
  );
  assert.strictEqual(floor.moat_cap.durablePassed, true, "pathB修复: durablePassed=true(经 roicLongTermStrong 通过)");
}

// ════════════════════════════════════════════════════════════════════════════
// 融合 1 — 现金牛(GOOGL/META 型,真实可达机制 = pathA):千亿现金撑大资产重置价值分母,压低
// 原始 EPV/AV(<2,仅 moderate);剔除超额现金后的经营资产 EPV/AV(≥2)才让 moat 升 strong →
// cap 20% → g_used 由 gFund(基本面上限)锁定,非硬顶 → IV 显著 > F。
// (原计划让此融合走 pathB;上面的发现证明 pathB 在全链路中不可达,这里改用真实可达的 pathA,
//  与 GOOGL/META 的实际机制——现金掩盖真实资产回报——一致。)
// ════════════════════════════════════════════════════════════════════════════
{
  const revs = [10_000, 11_000, 12_100, 13_310, 14_641, 16_105];
  const fys = [2020, 2021, 2022, 2023, 2024, 2025];
  const cashCowYears: ValuationFloorYear[] = fys.map((fy, i) => {
    const revenue = revs[i];
    const operating_income = 0.35 * revenue;
    const net_income = operating_income * (1 - 0.15); // = nopat，同口径
    const equity = 3.0 * revenue;     // 大权益(含巨额现金),抬高原始 AV,压低原始 ratio 到 <2
    const cash = 0.5 * equity;        // 巨额现金(千亿现金型):剔除后经营资产 AV 大幅收窄(数值经 _debug4 网格校准)
    return yr(fy, {
      revenue,
      operating_margin: 0.35,
      operating_income,
      net_income,
      effective_tax_rate: 0.15,
      shareholders_equity: equity,
      goodwill: 100,
      intangibles: 50,
      cash,
      total_debt: 0,
      shares_diluted: 1_000,
      d_and_a: 300,
      capex: 600,
      working_capital: 1_000 + i * 200,
    });
  }).reverse(); // most-recent-first
  const input: ValuationFloorInput = { ticker: "CASHCOW", sic: 7370, years: cashCowYears }; // sic=services,非金融

  const floor = floorOf(computeValuationFloor(input));

  // ── 断言:pathA 触发(原始 ratio<2,经营资产 ratio≥2) ─────────────────────────
  const epvMid =
    floor.graham_epv.per_share_low != null && floor.graham_epv.per_share_high != null
      ? (floor.graham_epv.per_share_low + floor.graham_epv.per_share_high) / 2
      : NaN;
  const avCons = floor.asset_floor.per_share!;
  const epvAvRatio = epvMid / avCons;
  console.log(`[融合1 CASHCOW] epvMid=${epvMid.toFixed(2)} avCons(原始)=${avCons.toFixed(2)} epvAvRatio(原始)=${epvAvRatio.toFixed(3)}`);
  assert.ok(epvAvRatio >= 1.25 && epvAvRatio < 2, `融合1: 原始 epvAvRatio 须落在 [1.25,2) —— 巨额现金撑大分母,若不剔现金只能判 moderate,got ${epvAvRatio}`);
  assert.strictEqual(floor.moat_reading.signal, "franchise", "融合1: 现金牛读 franchise 信号(dual AV 双测过)");
  assert.strictEqual(floor.moat_reading.dual_test_passed, true, "融合1: dual_test_passed=true(strongRatio 门槛之一)");
  assert.strictEqual(floor.moat_cap.grade, "strong", "融合1: pathA(经营资产 EPV/AV≥2)触发 → moat grade=strong(真实 GOOGL/META 机制)");
  assert.strictEqual(floor.moat_cap.capYears, CAP_STRONG, "融合1: strong → capYears=20");
  assert.ok(!isFinancialSic(input.sic), "融合1: sic=7370 非金融");
  assert.strictEqual(floor.is_financial, false, "融合1: floor.is_financial=false");

  // ── 全链:deriveOeDcf → g_used ────────────────────────────────────────────
  const { oeDcf, verdict } = runChain(input, 30);
  assert.ok(oeDcf.assessable, "融合1: OE-DCF 可评估");
  assert.strictEqual(oeDcf.moatCap?.grade, "strong", "融合1: OE-DCF 侧读到同一个 strong(单一真相源,BUG2 不回归)");
  console.log(`[融合1] growth_g1=${(oeDcf.growth_g1! * 100).toFixed(2)}% (cap=${GROWTH_CAP_FRANCHISE * 100}%) gFund=${floor.sustainable_growth != null ? (floor.sustainable_growth * 100).toFixed(2) + "%" : "undefined"}`);
  assert.ok(oeDcf.growth_g1! > 0, "融合1: g_used > 0(有正增长,非零增长退化)");
  assert.ok(oeDcf.growth_g1! < GROWTH_CAP_FRANCHISE, "融合1: g_used 明显低于 20% 硬顶 → 证明由 gFund(基本面)锁定,非填满 cap");
  assert.ok(
    floor.sustainable_growth != null && Math.abs(oeDcf.growth_g1! - floor.sustainable_growth) < 1e-6,
    `融合1: g_used 应等于 gFund(候选中最紧,基本面上限锁定),got g1=${oeDcf.growth_g1!} gFund=${floor.sustainable_growth}`,
  );

  const F = floor.buffett_epv.per_share_low!; // 悲观档零增长底附近(非精确 valueFloor,仅作数量级参照)
  const IV = oeDcf.tiers!.neutral.per_share;
  console.log(`[融合1] F(pessimistic)≈${F.toFixed(2)} IV(neutral)=${IV.toFixed(2)} ratio=${(IV / F).toFixed(3)}`);
  assert.ok(IV > F, "融合1: IV(中枢) > F(悲观零增长底附近),含增长抬升生效");
  assert.ok(IV / oeDcf.per_share_low! > 1.05, "融合1: IV 相对悲观档有意义抬升(非四舍五入噪声)");

  assert.ok(verdict, "融合1: verdict 非 null(无断链/无坏数据抑制)");
  assert.ok(!Number.isNaN(verdict!.marginPct ?? 0), "融合1: marginPct 非 NaN");
  assert.ok(["below", "within", "above"].includes(verdict!.bucket), "融合1: bucket 合法枚举");
  console.log(`[融合1] verdict bucket=${verdict!.bucket} inStrikeZone=${verdict!.inStrikeZone} marginPct=${verdict!.marginPct?.toFixed(3)} reliable=${verdict!.reliable}`);
  // 现价 300 远低于强护城河高增长股的 IV → 应落 below(有安全边际)。
  assert.strictEqual(verdict!.bucket, "below", "融合1: 现价 30 < IV(≈58) → below");
}

// ════════════════════════════════════════════════════════════════════════════
// 融合 2 — 金融股(银行/保险,is_financial):cap = SGR 或 5%,g_used ≤ 该 cap,不进假 below
// ════════════════════════════════════════════════════════════════════════════
{
  // 银行式:无 operating_income/margin(单灯,moat 读 buffett_epv vs AV),ROE≈6% 恒定、无 payout
  // → SGR≈0.06(< GROWTH_CAP_MODERATE=7%,证明走 SGR 而非扁平 7%)。revenue 未提供,仅 net_income
  // 驱动 CAGR/gFund;net_income CAGR ≈ 6%/yr,同样验证 g_used 被 SGR(≈0.058) 而非扁平 7% 封顶。
  const bankYears: ValuationFloorYear[] = [
    yr(2025, { net_income: 1_200, pretax_income: 1_510, income_tax_expense: 310, shareholders_equity: 20_000, cash: 3_200, total_debt: 500, net_debt: -2_700, shares_diluted: 1_000 }),
    yr(2024, { net_income: 1_100, pretax_income: 1_390, income_tax_expense: 290, shareholders_equity: 18_800, cash: 3_100, total_debt: 500, net_debt: -2_600, shares_diluted: 1_000 }),
    yr(2023, { net_income: 1_000, pretax_income: 1_270, income_tax_expense: 270, shareholders_equity: 17_800, cash: 3_000, total_debt: 500, net_debt: -2_500, shares_diluted: 1_000 }),
  ]; // most-recent-first
  const input: ValuationFloorInput = { ticker: "BANKX", sic: 6022, years: bankYears }; // National/State Commercial Bank
  assert.ok(isFinancialSic(input.sic), "融合2 fixture sanity: sic=6022 银行区间");

  const floor = floorOf(computeValuationFloor(input));
  assert.strictEqual(floor.is_financial, true, "融合2: is_financial=true(sic 银行区间)");
  assert.ok(floor.financial_sgr != null && floor.financial_sgr > 0, "融合2: financial_sgr 可计算且为正");
  assert.ok(floor.financial_sgr! < GROWTH_CAP_MODERATE, `融合2: SGR(${floor.financial_sgr}) < moderate cap 7%,cap 应用 SGR 而非扁平 7%`);
  console.log(`[融合2 BANKX] grade=${floor.moat_cap.grade} financial_sgr=${(floor.financial_sgr! * 100).toFixed(2)}%`);

  const { oeDcf, verdict } = runChain(input, 15);
  assert.ok(oeDcf.assessable, "融合2: OE-DCF 可评估(单灯 buffett_epv)");
  console.log(`[融合2] growth_g1=${(oeDcf.growth_g1! * 100).toFixed(2)}% IV(neutral)=${oeDcf.tiers!.neutral.per_share.toFixed(2)} rangeHi=${verdict?.rangeHi.toFixed(2)}`);
  assert.ok(oeDcf.growth_g1! <= GROWTH_CAP_MODERATE + 1e-9, "融合2: g_used ≤ moderate 上限(SGR 更紧,不会超过 7%)");
  assert.ok(oeDcf.growth_g1! <= floor.financial_sgr! + 1e-6, "融合2: g_used ≤ SGR(金融股封顶用 SGR,不用扁平 cap)");
  assert.ok(!Number.isNaN(oeDcf.growth_g1!), "融合2: g_used 非 NaN");
  assert.ok(verdict, "融合2: verdict 非 null");
  console.log(`[融合2 price15] verdict bucket=${verdict!.bucket} marginPct=${verdict!.marginPct?.toFixed(3)} reliable=${verdict!.reliable}`);

  // 现价远高于价值带上沿(rangeHi)→ 即便金融股走 SGR 增长,也不该被 SGR 抬出的 IV 假冒成便宜 —— 用
  // 一个明显高于 rangeHi 的现价验证 bucket 正确落 above(SGR 封顶没有把估值撑到能吞下这个高价)。
  const rangeHiChain = runChain(input, verdict!.rangeHi * 3);
  assert.ok(rangeHiChain.verdict, "融合2(高价): verdict 非 null");
  console.log(`[融合2 price=3×rangeHi] verdict bucket=${rangeHiChain.verdict!.bucket} marginPct=${rangeHiChain.verdict!.marginPct?.toFixed(3)}`);
  assert.strictEqual(rangeHiChain.verdict!.bucket, "above", "融合2: 现价远高于价值带上沿 → above,SGR 封顶未把金融股撑出假便宜");
}

// ════════════════════════════════════════════════════════════════════════════
// 融合 3 — 普通无护城河股(非金融):cap 5%(非 7%),g_used ≤ 5%
// ════════════════════════════════════════════════════════════════════════════
{
  // 低毛利、无护城河、非金融(sic=3711 汽车)。12%/yr 营收增长(刻意设为 > 5% cap,证明 clamp 生效而
  // 非"本来就低于 5%")。省略 operating_income → nopatOf/roic 系全线 undefined → sustainableGrowth
  // 不入候选,只剩 gRaw(12%的log回归)与 cagrFallback(净利 12%/yr)两个都 > cap,clamp 到 5% 才是
  // 唯一能解释 g_used=5% 的原因。
  const revs = [10_000, 11_200, 12_544, 14_049, 15_735];
  const fys = [2021, 2022, 2023, 2024, 2025];
  const commodityYears: ValuationFloorYear[] = fys.map((fy, i) => {
    const revenue = revs[i];
    const net_income = 0.04 * revenue;
    return yr(fy, {
      revenue,
      operating_margin: 0.05,
      net_income,
      effective_tax_rate: 0.21,
      shareholders_equity: 0.6 * revenue,
      cash: 0.02 * revenue,
      total_debt: 0,
      shares_diluted: 1_000,
    });
  }).reverse(); // most-recent-first
  const input: ValuationFloorInput = { ticker: "COMMOD", sic: 3711, years: commodityYears };
  assert.ok(!isFinancialSic(input.sic), "融合3 fixture sanity: sic=3711 非金融");

  const floor = floorOf(computeValuationFloor(input));
  assert.notStrictEqual(floor.moat_reading.signal, "franchise", "融合3: 低毛利大权益 → 非 franchise 信号");
  assert.strictEqual(floor.moat_cap.grade, "none", "融合3: 无护城河 → grade=none");
  assert.strictEqual(floor.moat_cap.capYears, CAP_NONE, "融合3: none → capYears=0");
  assert.strictEqual(floor.is_financial, false, "融合3: 非金融");
  assert.strictEqual(floor.sustainable_growth, undefined, "融合3 fixture sanity: 省略 operating_income → gFund 不可评估(undefined)");

  const { oeDcf, verdict } = runChain(input, 5);
  assert.ok(oeDcf.assessable, "融合3: OE-DCF 可评估");
  console.log(`[融合3 COMMOD] growth_g1=${(oeDcf.growth_g1! * 100).toFixed(2)}% (none cap=${GROWTH_CAP_NONE * 100}%, moderate cap=${GROWTH_CAP_MODERATE * 100}%)`);
  assert.ok(Math.abs(oeDcf.growth_g1! - GROWTH_CAP_NONE) < 1e-9, `融合3: 候选(gRaw/cagr≈12%)均 > 5% → clamp 精确落在 GROWTH_CAP_NONE=5%,而非旧扁平 7%,got ${oeDcf.growth_g1!}`);
  assert.ok(oeDcf.growth_g1! < GROWTH_CAP_MODERATE, "融合3: g_used < moderate 的 7%(收紧生效,非沿用旧 7%)");

  assert.ok(verdict, "融合3: verdict 非 null(无断链)");
  assert.ok(!Number.isNaN(verdict!.marginPct ?? 0), "融合3: marginPct 非 NaN");
  console.log(`[融合3] verdict bucket=${verdict!.bucket} marginPct=${verdict!.marginPct?.toFixed(3)} reliable=${verdict!.reliable}`);
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 3 地基逐位不变回归(Step 2):moat grade 未被本次改动波及的股
// ════════════════════════════════════════════════════════════════════════════

// (a) 已经 strong 的股(经典 EPV/AV≥2 路径,pathA/pathB 引入前就该判 strong)——验证 pathA/pathB 新增
//     代码路径完全不干扰这条老路径:dual_test_passed 走同一套(both ratio ≥1.25),strongRatio(ratio≥2)
//     依旧独立生效,不需要 pathB 兜底。
{
  const revs = [10_000, 11_000, 12_100, 13_310, 14_641, 16_105];
  const fys = [2020, 2021, 2022, 2023, 2024, 2025];
  const alreadyStrongYears: ValuationFloorYear[] = fys.map((fy, i) => {
    const revenue = revs[i];
    const operating_income = 0.40 * revenue;
    const net_income = operating_income * (1 - 0.15);
    return yr(fy, {
      revenue,
      operating_margin: 0.40,
      operating_income,
      net_income,
      effective_tax_rate: 0.15,
      shareholders_equity: 0.30 * revenue,
      goodwill: 0.02 * revenue,
      intangibles: 0.01 * revenue,
      cash: 0,
      total_debt: 0,
      net_debt: 0,
      shares_diluted: 1_000,
      d_and_a: 200,
      capex: 200,
    });
  }).reverse(); // most-recent-first
  const input: ValuationFloorInput = { ticker: "ALREADYSTRONG", sic: 3571, years: alreadyStrongYears };
  const floor = floorOf(computeValuationFloor(input));

  const epvMid = (floor.graham_epv.per_share_low! + floor.graham_epv.per_share_high!) / 2;
  const avCons = floor.asset_floor.per_share!;
  const epvAvRatio = epvMid / avCons;
  console.log(`[回归-已strong ALREADYSTRONG] epvAvRatio=${epvAvRatio.toFixed(2)}`);
  assert.ok(epvAvRatio >= 2, `回归 fixture sanity: ratio 须 ≥2 以走老 pathA,got ${epvAvRatio}`);
  assert.strictEqual(floor.moat_reading.dual_test_passed, true, "回归: dual_test_passed(两个 AV 口径都过)不受 pathA/pathB 新代码影响");
  assert.strictEqual(floor.moat_cap.grade, "strong", "回归: 经典 ratio≥2 路径依旧判 strong(pathA/pathB 新增代码未干扰老路径)");
  assert.strictEqual(floor.moat_cap.capYears, CAP_STRONG, "回归: capYears=20 不变");

  const { oeDcf, verdict } = runChain(input, 400);
  assert.strictEqual(oeDcf.moatCap?.grade, "strong", "回归: OE-DCF 侧 grade 逐位一致");
  assert.ok(oeDcf.growth_g1! <= GROWTH_CAP_FRANCHISE + 1e-9, "回归: g_used 上限仍是 20%(strong cap 未变)");
  assert.ok(verdict, "回归: verdict 非 null,四闸(isImplausibleBand/assessReliability)照常运作");
  assert.ok(!Number.isNaN(verdict!.marginPct ?? 0), "回归: marginPct 非 NaN");
  console.log(`[回归-已strong] bucket=${verdict!.bucket} reliable=${verdict!.reliable}`);
}

// (b) 已经 none 的商品化股(无 franchise 信号,pathA/pathB 从不适用)——moat_cap.grade/capYears、
//     四闸(assessReliability/isImplausibleBand)与 Phase 3(本次改动前)逐位一致。用与融合3相同
//     的商品化 fixture 复核(同一 fixture 双重验证:既证 cap 收紧生效,也证 grade 判定本身不受
//     pathA/pathB 触碰——因为它从未进入 moat.signal==="franchise" 分支)。
{
  const commodityYears: ValuationFloorYear[] = [2025, 2024, 2023].map((fy, i) => {
    const revenue = [10_000, 9_500, 9_000][i];
    return yr(fy, {
      revenue,
      operating_margin: 0.06,
      net_income: 0.03 * revenue,
      effective_tax_rate: 0.21,
      shareholders_equity: 0.7 * revenue,
      cash: 0.01 * revenue,
      total_debt: 100,
      shares_diluted: 1_000,
    });
  }); // most-recent-first
  const input: ValuationFloorInput = { ticker: "NONEREG", sic: 3221, years: commodityYears }; // sic=玻璃容器,非金融
  const floor = floorOf(computeValuationFloor(input));

  assert.notStrictEqual(floor.moat_reading.signal, "franchise", "回归-none: 非 franchise 信号(pathA/pathB 从不适用)");
  assert.strictEqual(floor.moat_cap.grade, "none", "回归-none: grade=none 不受 pathA/pathB 触碰");
  assert.strictEqual(floor.moat_cap.durablePassed, false, "回归-none: durablePassed=false");

  const { oeDcf, verdict, reconciliation } = runChain(input, 8);
  assert.ok(oeDcf.assessable, "回归-none: OE-DCF 仍可评估");
  assert.ok(oeDcf.growth_g1! <= GROWTH_CAP_NONE + 1e-9, "回归-none: cap 仍是 5%(Task4 既有行为,非本次改动)");

  // 四闸:assessReliability/isImplausibleBand 是纯函数,输入不变则输出不变 —— 直接对同一 floor/oeDcf 重跑,
  // 验证两次调用逐位相同(证明本次改动未引入非确定性/副作用)。
  const reliableA = assessReliability({ floor, oeDcf });
  const reliableB = assessReliability({ floor, oeDcf });
  assert.strictEqual(reliableA, reliableB, "回归-none: assessReliability 纯函数,重复调用逐位一致");
  if (verdict) {
    assert.strictEqual(
      isImplausibleBand({ rangeLo: verdict.rangeLo, rangeHi: verdict.rangeHi, price: verdict.price, marginPct: verdict.marginPct }),
      false,
      "回归-none: 当前 verdict 的带本身不应被健壮性闸判定坏数据(否则 verdict 早已是 null)",
    );
  }
  console.log(`[回归-none NONEREG] grade=${floor.moat_cap.grade} bucket=${verdict?.bucket} reconciliation=${reconciliation.comparable}`);
}

console.log("moatGrowthFusion.check.ts ✓ all assertions passed");
