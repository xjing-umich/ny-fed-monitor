/**
 * holdcoNotAssessable.check.ts — 件④ 断言(纯 fixture,无网络)。
 * 覆盖:①marks 未生效时权益证券不剔除(零漂移) ②marks 生效时剔除生效、比值上升
 *      ③三闸全中 → moat=not_assessable + holdco_not_assessable + verdict 抑制
 *      ④缺闸③(有 operating_income) → 不抑制 ⑤未修正与修正后比值皆进 franchise(同源)→ 不抑制
 *      ⑥assetOperating≤0(ratio undefined)→ 仍被抑制,不被闸②收紧后的反向误伤面漏放
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoNotAssessable.check.ts
 */
import { computeValuationFloor, MOAT_FRANCHISE_MULTIPLE } from "./epvFloor";
import { deriveValuationVerdict } from "./deriveValuationVerdict";
import type { ValuationFloorInput, ValuationFloorYear, MarksAdjustment } from "./types";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.error(`  ✗ ${msg}`); }
}

const B = 1e9;
/** BRK 形态:巨额权益证券 + 无营业利润(保险)+ 盈利相对有形净资产偏低。niMult 缩放盈利基数(场景 5 用)。 */
function holdcoYears(over?: Partial<ValuationFloorYear>, niMult = 1): ValuationFloorYear[] {
  return [2025, 2024, 2023, 2022, 2021].map((fy, i) => ({
    fiscal_year: fy,
    revenue: 240 * B,
    operating_income: undefined,      // 保险:不单独报营业利润
    net_income: (36 - i) * B * niMult,
    effective_tax_rate: 0.21,
    shareholders_equity: 700 * B,
    goodwill: 83 * B,
    cash: 52 * B,
    equity_securities_fv: 298 * B,
    shares_diluted: 2_157_000_000,
    d_and_a: 13 * B,
    capex: 20 * B,
    ppe_net: 180 * B,
    working_capital: 20 * B,
    total_liabilities: 500 * B,
    current_assets: 100 * B,
    current_liabilities: 60 * B,
    ...over,
  }));
}

const marks: MarksAdjustment = {
  tax_rate: 0.21,
  materiality: 0.53,
  per_year: [2025, 2024, 2023, 2022, 2021].map((fy, i) => ({
    fiscal_year: fy, pretax: 39 * B, net_income_reported: (67 - i) * B, net_income_adjusted: (36 - i) * B,
  })),
};

const floorOf = (input: ValuationFloorInput) => {
  const f = computeValuationFloor(input);
  if (!f || f.kind !== "floor") throw new Error(`expected floor, got ${f?.kind ?? "undefined"}`);
  return f;
};

console.log("场景 1: marks 未生效 → 权益证券不剔除(零漂移)");
const noMarks = floorOf({ ticker: "NOMARKS", years: holdcoYears(), sic: 6331 });
const withMarks = floorOf({ ticker: "HOLDCO", years: holdcoYears(), sic: 6331, marks_adjustment: marks });
assert(noMarks.holdco_not_assessable !== true, "marks 未生效 → 不触发抑制(闸①不满足)");
assert(noMarks.moat_reading.signal !== "not_assessable", "marks 未生效 → moat 判定不被改写");

console.log("场景 2: marks 生效 → 剔除生效、三闸全中");
assert(withMarks.holdco_not_assessable === true, "三闸全中 → holdco_not_assessable=true");
assert(withMarks.moat_reading.signal === "not_assessable", "moat 判为 not_assessable(不是 value_destruction)");
assert((withMarks.moat_reading.basis_note + withMarks.moat_reading.label).toLowerCase().includes("reproduction"), "说明句点明重置成本测试不适用");

console.log("场景 3: verdict 整条抑制");
const verdict = deriveValuationVerdict({
  floor: withMarks,
  strikeZone: { price: { close: 511, date: "2026-07-31", currency: "USD", source: "yahoo" }, stale: false,
    epv: { zone: "outside", floorConservative: 149, ceiling: 182, mosLow: -2.4, mosHigh: -1.8,
      valueFloor: 298.5, base: 298.5, position: "above_zero_growth", growthCollapsed: true } } as never,
  methods: { zeroGrowthEpv: true, oeDcf: false, greenwaldGrowthCeilings: false },
});
assert(verdict === null, "holdco_not_assessable → verdict 为 null(整条抑制)");

console.log("场景 4: 有营业利润 → 闸③不满足,不抑制");
const withOpInc = floorOf({ ticker: "OPINC", sic: 6331, marks_adjustment: marks,
  years: holdcoYears({ operating_income: 40 * B, operating_margin: 40 / 240 }) });
assert(withOpInc.holdco_not_assessable !== true, "有独立经营透镜(operating_income)→ 不抑制");

console.log("场景 5: 修正后进 franchise → 闸②不满足,不抑制");
// 终审修法(件④最终审):闸②须与实际发布的 moatReadingFinal.signal 同源 —— 既要求"未修正"
// 比值本就判 franchise(moatReading.signal==="franchise"),也要求"剔 marks 后"的经营比值仍
// ≥1.25(franchiseAfterFix)。原方案只放大 equity_securities_fv(单独调分母)无法同时满足两条:
// 未修正 av(=reproduction.per_share)不随 equity_securities_fv 变化(它由 shareholders_equity
// 等固定项算出,恒 ≈286.05/股),分子分母比值锁死在 0.475,永远到不了 franchise。
// 改为放大盈利基数(niMult=3×net_income)把 EPV 拉到 ≈454.24/股:未修正 epv/av=1.588≥1.25 →
// signal 本就是 franchise;剔除权益证券(298B/股≈138.16)与超额现金(21.88/股)后经营资产
// ≈126.01/股,修正后比值 ≈3.605,同样 ≥1.25 —— 两条件同时满足,真实命中"两路皆同意 franchise"
// 的场景,而不是只让修正后单路达标(那正是闸②收紧前的漏洞)。
const franchiseAfter = floorOf({ ticker: "FRAN", sic: 6331, marks_adjustment: marks,
  years: holdcoYears(undefined, 3) });
assert(franchiseAfter.holdco_not_assessable !== true, `未修正与修正后比值均 ≥${MOAT_FRANCHISE_MULTIPLE} → 不抑制`);
assert(franchiseAfter.moat_reading.signal === "franchise", "两路皆同意 franchise → 发布 signal 也是 franchise(同源)");

console.log("场景 6: assetOperating ≤ 0(权益证券吃穿整个重置基数)→ ratio 为 undefined → 仍被抑制");
// 闸②收紧后堵住的反向误伤面:权益证券远超未修正的重置基数(av≈286.05/股),剔除后
// assetOperating < 0 → epvAvRatioOperating 为 undefined。franchiseAfterFix 的
// `epvAvRatioOperating != null && epvAvRatioOperating >= MOAT_FRANCHISE_MULTIPLE` 对 undefined
// 直接判 false(不会被误当成"测不出所以不算 franchise 之外的情况"而漏抑制)——票仍被三闸①③
// 命中,继续 holdco_not_assessable=true。
const assetOperatingNegative = floorOf({ ticker: "NEGOP", sic: 6331, marks_adjustment: marks,
  years: holdcoYears({ equity_securities_fv: 600 * B }) });
assert(assetOperatingNegative.holdco_not_assessable === true, "assetOperating≤0(ratio undefined) → 仍被抑制(未被反向误伤)");
assert(assetOperatingNegative.moat_reading.signal === "not_assessable", "assetOperating≤0 → moat 仍判 not_assessable");

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
