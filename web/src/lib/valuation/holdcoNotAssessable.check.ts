/**
 * holdcoNotAssessable.check.ts — 件④ 断言(纯 fixture,无网络)。
 * 覆盖:①marks 未生效时权益证券不剔除(零漂移) ②marks 生效时剔除生效、比值上升
 *      ③三闸全中 → moat=not_assessable + holdco_not_assessable + verdict 抑制
 *      ④缺闸③(有 operating_income) → 不抑制 ⑤修正后进 franchise → 不抑制
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
/** BRK 形态:巨额权益证券 + 无营业利润(保险)+ 盈利相对有形净资产偏低。 */
function holdcoYears(over?: Partial<ValuationFloorYear>): ValuationFloorYear[] {
  return [2025, 2024, 2023, 2022, 2021].map((fy, i) => ({
    fiscal_year: fy,
    revenue: 240 * B,
    operating_income: undefined,      // 保险:不单独报营业利润
    net_income: (36 - i) * B,
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
// 权益证券逼近(但不超过)有形净资产 → 剔除后经营资产极小但仍为正 → 比值远超 1.25。
// 注:600B(brief 原始值)会把 assetOperating 推为负(实测 -14.0,基础重置值 286.05/股 −
// 现金 21.88 − 权益证券 278.16 < 0),导致 epvAvRatioOperating=undefined,三闸②反而判定
// "仍进不了 franchise"(未清 undefined != 达标 的语义),与本场景"修正后应进 franchise"的
// 描述意图相悖 —— 已用 550B 把 assetOperating 校正为小额正数(实测 9.18,ratio 实测 14.79),
// 真实命中"极小正分母 → 高比值"的场景。见 task-2-report.md 附「fixture 校准」。
const franchiseAfter = floorOf({ ticker: "FRAN", sic: 6331, marks_adjustment: marks,
  years: holdcoYears({ equity_securities_fv: 550 * B }) });
assert(franchiseAfter.holdco_not_assessable !== true, `修正后进 franchise(≥${MOAT_FRANCHISE_MULTIPLE})→ 不抑制`);

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
