/**
 * holdcoSotp.check.ts — 件⑤ Task 4 断言(纯 fixture,无网络)。
 * ★ 用 BRK FY2023–25 的真实分部数字当 fixture,断言三档 = spec §3 的 458/496/534。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.check.ts
 */
import {
  computeHoldcoSotp, OPERATING_MULTIPLES, UNDERWRITING_MULTIPLES, SOTP_MIN_YEARS,
} from "./holdcoSotp";
import { deriveValuationVerdict } from "./deriveValuationVerdict";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) / Math.abs(b) <= tol;

const B = 1e9;
const SHARES = 2_157_335_139; // A 511,820×1500 + B 1,389,605,139

// BRK 真实数字(spec §1.2/§1.3)
const BRK = {
  shares: SHARES,
  investments: { total: 704.73 * B, unrealized_gain: 212.39 * B },
  years: [
    { period_end: "2025-12-31", total_pretax: 51.71 * B, total_tax: 8.57 * B,
      insurance_pretax: 24.72 * B, insurance_tax: 4.95 * B, underwriting_pretax: 9.46 * B },
    { period_end: "2024-12-31", total_pretax: 53.94 * B, total_tax: 8.87 * B,
      insurance_pretax: 28.15 * B, insurance_tax: 5.46 * B, underwriting_pretax: 11.40 * B },
    { period_end: "2023-12-31", total_pretax: 43.64 * B, total_tax: 6.91 * B,
      insurance_pretax: 18.49 * B, insurance_tax: 3.50 * B, underwriting_pretax: 6.91 * B },
  ],
};

console.log("① 常量");
assert(OPERATING_MULTIPLES.join(",") === "12,15,18", "非保险经营倍数 12/15/18");
assert(UNDERWRITING_MULTIPLES.join(",") === "8,10,12", "承保倍数 8/10/12");
assert(SOTP_MIN_YEARS === 3, "至少 3 年");

console.log("② BRK 三档(spec §3)");
const r = computeHoldcoSotp(BRK);
assert(r.assessable, "可评估");
if (r.assessable) {
  assert(near(r.columns.investments, 326.7), `第一栏 $326.7(实得 ${r.columns.investments.toFixed(1)})`);
  assert(near(r.basis.operating_after_tax_mean / B, 22.50), `非保险经营税后三年均 22.50B(实得 ${(r.basis.operating_after_tax_mean / B).toFixed(2)})`);
  assert(near(r.basis.underwriting_after_tax_mean / B, 7.31), `承保税后三年均 7.31B(实得 ${(r.basis.underwriting_after_tax_mean / B).toFixed(2)})`);
  assert(near(r.columns.deferred_tax, 20.7), `递延税 $20.7/股(实得 ${r.columns.deferred_tax.toFixed(1)})`);
  assert(near(r.per_share.pessimistic, 458, 0.015), `悲观档 ≈$458(实得 ${r.per_share.pessimistic.toFixed(0)})`);
  assert(near(r.per_share.base, 496, 0.015), `基础档 ≈$496(实得 ${r.per_share.base.toFixed(0)})`);
  assert(near(r.per_share.optimistic, 534, 0.015), `乐观档 ≈$534(实得 ${r.per_share.optimistic.toFixed(0)})`);

  console.log("③ 现价落在带内(本件的产品级结论)");
  const price = 511.54;
  assert(price >= r.per_share.pessimistic && price <= r.per_share.optimistic,
    `现价 $${price} 落在 [${r.per_share.pessimistic.toFixed(0)}, ${r.per_share.optimistic.toFixed(0)}] 内`);

  console.log("④ 三档单调");
  assert(r.per_share.pessimistic < r.per_share.base && r.per_share.base < r.per_share.optimistic,
    "悲观 < 基础 < 乐观");
}

console.log("⑤ 投资分部不得计入第二/三栏");
// 若把投资分部(FY2025 15.26B)误当经营分部,第二栏均值会从 22.50B 跳到 ~35B。
if (r.assessable) {
  assert(r.basis.operating_after_tax_mean / B < 26,
    "第二栏均值 <26B —— 保险投资分部未被误计入(误计入会跳到 ~35B)");
}

console.log("⑥ fail-closed");
assert(computeHoldcoSotp({ ...BRK, years: BRK.years.slice(0, 2) }).assessable === false,
  "只有 2 年 → 不可评估");
assert((computeHoldcoSotp({ ...BRK, years: BRK.years.slice(0, 2) }) as { reason: string }).reason === "insufficient_years",
  "原因为 insufficient_years");
const noShares = computeHoldcoSotp({ ...BRK, shares: 0 });
assert(noShares.assessable === false, "股数不可得 → 不可评估");
assert((noShares as { reason: string }).reason === "shares_unavailable", "原因为 shares_unavailable");
const noInvestments = computeHoldcoSotp({ ...BRK, investments: null });
assert(noInvestments.assessable === false, "第一栏不可得 → 不可评估");
assert((noInvestments as { reason: string }).reason === "investments_unavailable", "原因为 investments_unavailable");

console.log("⑦ 对账闸");
const badReconcile = computeHoldcoSotp({
  ...BRK,
  consolidatedPretaxByYear: { "2025-12-31": 20 * B, "2024-12-31": 53.94 * B, "2023-12-31": 43.64 * B },
});
assert(badReconcile.assessable === false, "分部合计与合并口径偏差 >10% → 不可评估");
assert((badReconcile as { reason: string }).reason === "reconciliation_failed", "原因为 reconciliation_failed");
const goodReconcile = computeHoldcoSotp({
  ...BRK,
  // 合并税前 92.05B 含投资重估损益,与分部合计 51.71B 不可比 → 调用方应传经营口径;
  // 这里给一个在容差内的值验证放行。
  consolidatedPretaxByYear: { "2025-12-31": 52.0 * B, "2024-12-31": 54.0 * B, "2023-12-31": 44.0 * B },
});
assert(goodReconcile.assessable === true, "偏差在 10% 内 → 放行");

console.log("⑧ 递延税缺失时不静默按 0");
const noGain = computeHoldcoSotp({ ...BRK, investments: { total: 704.73 * B, unrealized_gain: null } });
assert(noGain.assessable === false, "递延税基数不可得 → fail-closed(不得少扣一项抬高估值)");
assert((noGain as { reason: string }).reason === "investments_unavailable", "原因为 investments_unavailable");

console.log("⑨ 非保险经营三年税后均值 ≤0 → no_operating_earnings");
// 让 total_pretax/total_tax 与保险集团口径相等 → 补集(非保险经营)恒为 0,均值不 >0。
const noOperating = computeHoldcoSotp({
  ...BRK,
  years: BRK.years.map((y) => ({ ...y, total_pretax: y.insurance_pretax, total_tax: y.insurance_tax })),
});
assert(noOperating.assessable === false, "非保险经营税后三年均 ≤0 → 不可评估");
assert((noOperating as { reason: string }).reason === "no_operating_earnings", "原因为 no_operating_earnings");

console.log("⑩ 承保三年为负时,三档排序仍需生效(brief 专门写的反序修正)");
// 只翻转承保为负,经营分部(第二栏)不受影响,保持整体可评估。
const negUnderwriting = computeHoldcoSotp({
  ...BRK,
  years: BRK.years.map((y) => ({ ...y, underwriting_pretax: -Math.abs(y.underwriting_pretax as number) })),
});
assert(negUnderwriting.assessable, "承保连年亏损,经营分部仍盈利 → 仍可评估");
if (negUnderwriting.assessable) {
  const uw = negUnderwriting.columns.underwriting;
  assert(uw.pessimistic < uw.base && uw.base < uw.optimistic,
    `承保三档排序生效(扣得最狠的是悲观档): pessimistic(${uw.pessimistic.toFixed(1)}) < base(${uw.base.toFixed(1)}) < optimistic(${uw.optimistic.toFixed(1)})`);
  const ps = negUnderwriting.per_share;
  assert(ps.pessimistic < ps.base && ps.base < ps.optimistic,
    "承保为负时,整体 per_share 三档仍单调递增");
}

console.log("⑪ 接线:verdict 用 SOTP 带判定");
{
  const sotp = computeHoldcoSotp(BRK);
  if (!sotp.assessable) throw new Error("fixture 应可评估");
  const zone = (close: number) => ({ price: { close, date: "2026-08-10" } }) as never;
  const mk = (price: number) =>
    deriveValuationVerdict({
      floor: { kind: "floor", holdco_not_assessable: true, holdco_sotp: sotp } as never,
      strikeZone: zone(price),
      methods: {} as never,
    });
  assert(mk(511.54)?.bucket === "within", "现价 $511.54 → within");
  assert(mk(400)?.bucket === "below", "$400(低于悲观档)→ below");
  assert(mk(600)?.bucket === "above", "$600(高于乐观档)→ above");
  assert(mk(511.54)?.reliable === true, "四闸已过 → reliable");
  assert(mk(300)?.inStrikeZone === true, "$300 ≤ 基础档 × 2/3 → 进击球区");
  assert(mk(511.54)?.inStrikeZone === false, "现价未到基础档的 2/3 → 不进击球区");
  assert(
    deriveValuationVerdict({
      floor: { kind: "floor", holdco_not_assessable: true } as never,
      strikeZone: zone(511.54),
      methods: {} as never,
    }) === null,
    "无 SOTP → 仍退回件④的整条抑制(fail-closed)",
  );
}

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
