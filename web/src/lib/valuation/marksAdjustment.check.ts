/**
 * marksAdjustment.check.ts — 件③盈利基数调整断言(纯 fixture,无网络)。
 * 覆盖:BRK 真数字对账(Buffett op earnings ±1%)/整窗覆盖闸/材料性闸(24% vs 26%)/
 * 对称性(负 gains 抬升)/TTM 不一致丢弃/引擎端到端(基数切换+披露发布)。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/marksAdjustment.check.ts
 */
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
import { deriveMarksAdjustment, fundamentalsToFloorInput, MARKS_TAX_RATE, shouldDropTtmForMarks } from "./fundamentalsToFloorInput";
import { computeValuationFloor } from "./epvFloor";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.error(`  ✗ ${msg}`); }
}

/** FundamentalPeriod 全键工厂:未给字段一律 null(与 DB 可空列一致)。 */
function mkRow(over: Partial<FundamentalPeriod> & { fiscal_year: number; period_end: string }): FundamentalPeriod {
  return {
    ticker: "TEST", cik: "0000000000", form: "10-K", fiscal_period: "FY", filing_date: null, accession_number: null,
    revenue: null, gross_profit: null, operating_income: null, net_income: null, eps_diluted: null, shares_diluted: null,
    operating_cash_flow: null, capex: null, free_cash_flow: null, d_and_a: null, stock_based_comp: null,
    rd_expense: null, sga_expense: null, interest_expense: null, pretax_income: null, income_tax_expense: null,
    dividends_paid: null, share_repurchases: null, cash_and_equivalents: null, short_term_investments: null,
    current_assets: null, current_liabilities: null, total_assets: null, total_liabilities: null, total_debt: null,
    ppe_net: null, goodwill: null, intangibles: null, shareholders_equity: null, minority_interest: null,
    preferred_equity: null, shares_outstanding: null, ebitda: null, working_capital: null, effective_tax_rate: null,
    revenue_yoy: null, net_income_yoy: null, fcf_yoy: null, gross_margin: null, operating_margin: null,
    net_margin: null, fcf_margin: null, roe: null, debt_to_equity: null, net_debt: null,
    is_derived: false, data_quality: "high", missing_fields: {}, raw_facts: {},
    investment_fv_gain_loss: null,
    ...over,
  } as FundamentalPeriod;
}

const B = 1e9;
// BRK 真实 FY2020-2025(净利 / GainLossOnInvestments,单位 B):
const BRK: [number, number, number][] = [
  [2025, 66.968, 39.1], [2024, 88.995, 52.8], [2023, 96.223, 74.9],
  [2022, -22.819, -67.9], [2021, 89.795, 77.6], [2020, 42.521, 40.9],
];
const brkRows = BRK.map(([fy, ni, g]) => mkRow({ fiscal_year: fy, period_end: `${fy}-12-31`, net_income: ni * B, investment_fv_gain_loss: g * B, shares_diluted: 2_157_000_000, shareholders_equity: 700 * B }));

console.log("场景 1: BRK 真数字对账");
const brkAdj = deriveMarksAdjustment(brkRows);
assert(brkAdj != null, "BRK 材料性 ~53% ≥ 25% → 调整启用");
const byFy = new Map(brkAdj!.per_year.map((p) => [p.fiscal_year, p.net_income_adjusted]));
// Buffett 股东信 operating earnings: FY2022=30.8B / FY2023=37.4B / FY2024=47.4B(±1B 容差,tag 口径差异)
assert(Math.abs(byFy.get(2022)! - 30.8 * B) < 1 * B, `FY2022 GAAP 亏损年还原 ≈30.8B(实际 ${(byFy.get(2022)! / B).toFixed(1)}B)`);
assert(Math.abs(byFy.get(2023)! - 37.4 * B) < 1.5 * B, `FY2023 ≈37.4B(实际 ${(byFy.get(2023)! / B).toFixed(1)}B)`);
assert(Math.abs(byFy.get(2024)! - 47.4 * B) < 1.5 * B, `FY2024 ≈47.4B(实际 ${(byFy.get(2024)! / B).toFixed(1)}B)`);
assert(Math.abs(brkAdj!.materiality - 0.534) < 0.03, `材料性 ≈53.4%(实际 ${(brkAdj!.materiality * 100).toFixed(1)}%)`);

console.log("场景 2: 整窗覆盖闸");
const gapRows = brkRows.map((r, i) => (i === 3 ? { ...r, investment_fv_gain_loss: null } : r));
assert(deriveMarksAdjustment(gapRows) === undefined, "任一有净利年缺 gains → 整体不调(fail-closed)");

console.log("场景 3: 材料性闸 24% vs 26%");
const mk = (ratio: number) => [0, 1, 2].map((i) => mkRow({ fiscal_year: 2025 - i, period_end: `${2025 - i}-12-31`, net_income: 10 * B, investment_fv_gain_loss: ratio * 10 * B }));
assert(deriveMarksAdjustment(mk(0.24)) === undefined, "24% < 25% → 不调");
assert(deriveMarksAdjustment(mk(0.26)) != null, "26% ≥ 25% → 调");

console.log("场景 4: 对称性(负 gains 抬升)");
const neg = deriveMarksAdjustment(mk(-0.30));
assert(neg != null && neg.per_year[0].net_income_adjusted > 10 * B, "gains 均值为负 → NI_adj 抬升(对称口径)");

console.log("场景 5: 引擎端到端(基数切换+披露)");
const input = fundamentalsToFloorInput("BRK.B", "BRK.B", brkRows, 1, 6331);
assert(input.marks_adjustment != null, "floorInput 带 marks_adjustment");
assert(Math.abs((input.years[1].net_income ?? 0) - byFy.get(2024)!) < 1, "years 序列吃的是调整后 NI");
const floor = computeValuationFloor(input);
assert(floor != null && floor.kind === "floor", "floor 可算");
if (floor && floor.kind === "floor") {
  assert(floor.marks_adjustment != null, "floor 发布 marks_adjustment");
  assert((floor.provenance.earnings_basis_note ?? "").toLowerCase().includes("investment"), "earnings_basis_note 含 marks 披露句");
}

console.log("场景 6: 未启用时零披露零改动");
const plain = fundamentalsToFloorInput("PLAIN", "PLAIN", brkRows.map((r) => ({ ...r, investment_fv_gain_loss: null })), 1, 6331);
assert(plain.marks_adjustment == null, "无 gains 数据 → 不调");
assert(plain.years[0].net_income === 66.968 * B, "NI 保持 GAAP 原值");

console.log("场景 7: TTM 丢弃谓词直测");
const baseRow = mkRow({ fiscal_year: 2026, period_end: "2026-09-30", net_income: 10 * B, investment_fv_gain_loss: 3 * B });
assert(
  shouldDropTtmForMarks({ degraded_fields: ["investment_fv_gain_loss"], row: baseRow }),
  "degraded_fields 含 investment_fv_gain_loss → 丢 TTM",
);
assert(
  shouldDropTtmForMarks({ degraded_fields: [], row: { ...baseRow, investment_fv_gain_loss: null } }),
  "TTM 行 investment_fv_gain_loss 为 null → 丢 TTM",
);
assert(
  !shouldDropTtmForMarks({ degraded_fields: [], row: baseRow }),
  "degraded_fields 不含该字段且行值非 null → 不丢 TTM",
);

console.log("场景 8: fiscal_year 标签碰撞(两行同 fiscal_year 不同 period_end)不串值");
const collideRows = [
  mkRow({ fiscal_year: 2023, period_end: "2023-06-30", net_income: 10 * B, investment_fv_gain_loss: 5 * B }),
  mkRow({ fiscal_year: 2023, period_end: "2023-12-31", net_income: 20 * B, investment_fv_gain_loss: 8 * B }),
  mkRow({ fiscal_year: 2024, period_end: "2024-12-31", net_income: 15 * B, investment_fv_gain_loss: 6 * B }),
  mkRow({ fiscal_year: 2025, period_end: "2025-12-31", net_income: 12 * B, investment_fv_gain_loss: 5 * B }),
];
const collideInput = fundamentalsToFloorInput("COLLIDE", "COLLIDE", collideRows, 1, 6331);
assert(collideInput.marks_adjustment != null, "碰撞场景材料性达标 → 调整启用");
// years 按 period_end 降序:2025-12-31 / 2024-12-31 / 2023-12-31 / 2023-06-30
const yOld = collideInput.years.find((y) => y.fiscal_year === 2023 && Math.abs((y.net_income ?? 0) - (10 * B - 5 * B * (1 - MARKS_TAX_RATE))) < 1);
const yNew = collideInput.years[2]; // period_end 2023-12-31
const yOldest = collideInput.years[3]; // period_end 2023-06-30
assert(
  Math.abs((yNew.net_income ?? 0) - (20 * B - 8 * B * (1 - MARKS_TAX_RATE))) < 1,
  `2023-12-31 行用自身字段调整(实际 ${((yNew.net_income ?? 0) / B).toFixed(3)}B,期望 ${((20 * B - 8 * B * (1 - MARKS_TAX_RATE)) / B).toFixed(3)}B)`,
);
assert(
  Math.abs((yOldest.net_income ?? 0) - (10 * B - 5 * B * (1 - MARKS_TAX_RATE))) < 1,
  `2023-06-30 行用自身字段调整,不被 2023-12-31 行覆盖(实际 ${((yOldest.net_income ?? 0) / B).toFixed(3)}B)`,
);
assert(yOld != null, "sanity: 至少一行 fiscal_year=2023 且值匹配自身口径");

// 捕获:FY 材料性低时,真实 TTM 突增的投资收益不能穿透盈利基数。
console.log("场景 9: FY 未达门槛,TTM 大额投资收益触发一致调整");
const smallMarksFy = [2025, 2024, 2023].map((year) => mkRow({
  fiscal_year: year, period_end: `${year}-12-31`, revenue: 500, net_income: 100,
  investment_fv_gain_loss: 10, shares_diluted: 10,
}));
const oldQ = mkRow({ fiscal_year: 2025, fiscal_period: "Q1", form: "10-Q", period_end: "2025-03-31", revenue: 100, net_income: 20, investment_fv_gain_loss: 2 });
const newQ = mkRow({ fiscal_year: 2026, fiscal_period: "Q1", form: "10-Q", period_end: "2026-03-31", revenue: 120, net_income: 120, investment_fv_gain_loss: 112, shares_diluted: 10 });
const recent = (quarter = newQ, history = smallMarksFy) => fundamentalsToFloorInput("RECENT", "Recent", history, 1, undefined, [quarter, oldQ]);
// 手算 TTM:NI = 100+120−20 = 200;gains = 10+112−2 = 120;税后 NI = 105.2。
const ttmAdjusted = recent();
assert(ttmAdjusted.marks_adjustment != null, "TTM gains/NI=60% → 启用调整,不受 FY 10% 漏判");
assert(ttmAdjusted.marks_adjustment?.materiality === 0.6 && ttmAdjusted.marks_adjustment?.trigger_period_end === "2026-03-31", "调整溯源记录真实 TTM 的材料性和期末");
assert(Math.abs((ttmAdjusted.ttm?.year.net_income ?? NaN) - 105.2) < 1e-9, "TTM 税后剔除收益:200−120×79%=105.2");
assert(ttmAdjusted.years.every((y) => Math.abs((y.net_income ?? NaN) - 92.1) < 1e-9), "FY 与 TTM 同口径调整,不混用 GAAP/FV 调整盈利");
assert(smallMarksFy[0].net_income === 100 && newQ.net_income === 120, "原始 FY/季度行不被改写");
const recentFloor = computeValuationFloor(ttmAdjusted);
assert(recentFloor?.kind === "floor" && recentFloor.marks_adjustment?.trigger_period_end === "2026-03-31"
  && (recentFloor.provenance.earnings_basis_note ?? "").includes("investment"), "引擎输出保留 TTM 调整溯源和盈利口径披露");

console.log("场景 10: TTM 门槛边界与负收益对称性");
const threshold = recent({ ...newQ, investment_fv_gain_loss: 42 }); // gains = 50, NI = 200
assert(threshold.marks_adjustment != null, "TTM 恰好 25% → 调整");
const under = recent({ ...newQ, investment_fv_gain_loss: 40 }); // gains = 48, NI = 200
assert(under.marks_adjustment == null && under.ttm?.year.net_income === 200, "TTM 24% 且 FY 10% → 完全保持原值");
const loss = recent({ ...newQ, investment_fv_gain_loss: -128 }); // gains = −120
assert(Math.abs((loss.ttm?.year.net_income ?? NaN) - 294.8) < 1e-9, "重大投资亏损按同式税后剔除:200+120×79%=294.8");

console.log("场景 11: 缺历史、非有限值与降级 TTM 不能伪装成一致口径");
const gapHistory = smallMarksFy.map((r, i) => i === 2 ? { ...r, investment_fv_gain_loss: null } : r);
const missingHistory = recent(newQ, gapHistory);
assert(missingHistory.ttm == null && missingHistory.marks_adjustment == null, "重大 TTM gains 但历史覆盖不全 → 丢 TTM,回退纯 FY");
const tooShort = recent(newQ, smallMarksFy.slice(0, 2));
assert(tooShort.ttm == null && tooShort.years.length === 2, "不足 3 年时不放宽既有覆盖闸,也不把污染 TTM 带入");
const nonfiniteHistory = recent(newQ, smallMarksFy.map((r, i) => i === 2 ? { ...r, investment_fv_gain_loss: NaN } : r));
assert(nonfiniteHistory.ttm == null && nonfiniteHistory.marks_adjustment == null, "NaN 历史值视为缺数,不能产生 NaN 调整序列");
const degraded = recent({ ...newQ, investment_fv_gain_loss: null }, smallMarksFy.map((r) => ({ ...r, investment_fv_gain_loss: 30 })));
assert(degraded.ttm == null && degraded.marks_adjustment != null, "FY 原已调整且 TTM gains 降级 → 仍回退 FY");
const staleGain = recent({ ...newQ, net_income: -70, investment_fv_gain_loss: null });
assert(staleGain.marks_adjustment == null && staleGain.ttm?.year.net_income === 10, "降级回填的 FY gains 不得作为真实 TTM 触发调整");
const zeroNi = recent({ ...newQ, net_income: -80 });
assert(zeroNi.ttm == null, "TTM 净利为零但有重大投资损益 → 不把未调整 TTM 带入");

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
