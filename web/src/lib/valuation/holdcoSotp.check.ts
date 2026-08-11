/**
 * holdcoSotp.check.ts — 件⑤ Task 4 断言(纯 fixture,无网络)。
 * ★ 用 BRK FY2023–25 的真实分部数字当 fixture,断言三档 = spec §3 的 458/496/534。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.check.ts
 */
import {
  computeHoldcoSotp, OPERATING_MULTIPLES, UNDERWRITING_MULTIPLES, SOTP_MIN_YEARS,
} from "./holdcoSotp";

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
assert(computeHoldcoSotp({ ...BRK, investments: null }).assessable === false,
  "第一栏不可得 → 不可评估");
assert(computeHoldcoSotp({ ...BRK, shares: 0 }).assessable === false,
  "股数不可得 → 不可评估");

console.log("⑦ 对账闸");
const badReconcile = computeHoldcoSotp({
  ...BRK,
  consolidatedPretaxByYear: { "2025-12-31": 20 * B, "2024-12-31": 53.94 * B, "2023-12-31": 43.64 * B },
});
assert(badReconcile.assessable === false, "分部合计与合并口径偏差 >10% → 不可评估");
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

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
