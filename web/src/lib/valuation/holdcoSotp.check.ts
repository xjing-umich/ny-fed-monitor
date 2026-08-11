/**
 * holdcoSotp.check.ts — 件⑤ Task 4 断言(纯 fixture,无网络)。
 * ★ 用 BRK FY2023–25 的真实分部数字当 fixture,断言三档 = spec §3 的 458/496/534。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.check.ts
 */
import {
  computeHoldcoSotp, OPERATING_MULTIPLES, UNDERWRITING_MULTIPLES, SOTP_MIN_YEARS,
  SOTP_RECONCILE_TOLERANCE, SOTP_SEGMENT_IDENTITY_TOLERANCE,
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

// BRK 真实数字(spec §1.2/§1.3)。
// segments_pretax_sum 用真实的顶层分部逐项之和(FY2025:保险 24.72 + BNSF 7.17 + BHE 2.34 +
// 制造 12.57 + 服务零售 4.04 + McLane 0.68 + Pilot 0.19 = 51.71),与合计行分毫不差。
// consolidatedPretaxByYear 用**库里的真值**:合并税前 − 投资重估(82.459−39.078 / 110.376−52.799 /
// 120.166−74.855),偏差实测 +19.2% / −6.3% / −3.7%。
const BRK = {
  shares: SHARES,
  investments: { total: 704.73 * B, unrealized_gain: 212.39 * B },
  years: [
    { period_end: "2025-12-31", total_pretax: 51.71 * B, total_tax: 8.57 * B,
      insurance_pretax: 24.72 * B, insurance_tax: 4.95 * B, underwriting_pretax: 9.46 * B,
      segments_pretax_sum: (24.72 + 7.17 + 2.34 + 12.57 + 4.04 + 0.68 + 0.19) * B },
    { period_end: "2024-12-31", total_pretax: 53.94 * B, total_tax: 8.87 * B,
      insurance_pretax: 28.15 * B, insurance_tax: 5.46 * B, underwriting_pretax: 11.40 * B,
      segments_pretax_sum: 53.94 * B },
    { period_end: "2023-12-31", total_pretax: 43.64 * B, total_tax: 6.91 * B,
      insurance_pretax: 18.49 * B, insurance_tax: 3.50 * B, underwriting_pretax: 6.91 * B,
      segments_pretax_sum: 43.64 * B },
  ],
  consolidatedPretaxByYear: {
    "2025-12-31": (82.459 - 39.078) * B,
    "2024-12-31": (110.376 - 52.799) * B,
    "2023-12-31": (120.166 - 74.855) * B,
  },
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

console.log("⑦ 对账闸(两条,都必须真的会触发)");
assert(SOTP_SEGMENT_IDENTITY_TOLERANCE === 0.01, "段内恒等式容差 1%");
assert(SOTP_RECONCILE_TOLERANCE === 0.35, "跨管线量级对账容差 35%(实测 BRK 最坏 +19.2%)");

// ⑦-1 段内恒等式:漏掉一个分部(Σ 少了 BNSF 的 7.17B)→ 与合计行对不上 → fail-closed。
const missingSegment = computeHoldcoSotp({
  ...BRK,
  years: BRK.years.map((y, i) =>
    i === 0 ? { ...y, segments_pretax_sum: (y.segments_pretax_sum as number) - 7.17 * B } : y,
  ),
});
assert(missingSegment.assessable === false, "Σ 顶层分部漏一个 → 不可评估");
assert((missingSegment as { reason: string }).reason === "segment_identity_failed", "原因为 segment_identity_failed");

// Σ 取不到(申报结构不同的 filer)→ 同样 fail-closed,不得当「不查」放行。
const noSum = computeHoldcoSotp({
  ...BRK,
  years: BRK.years.map((y) => ({ ...y, segments_pretax_sum: null })),
});
assert(noSum.assessable === false, "Σ 顶层分部不可得 → fail-closed");
assert((noSum as { reason: string }).reason === "segment_identity_failed", "原因为 segment_identity_failed");

// ⑦-2 跨管线量级对账:把某年的合并口径打到 20B(分部 51.71B,偏差 159%)→ 拦下。
const badReconcile = computeHoldcoSotp({
  ...BRK,
  consolidatedPretaxByYear: { ...BRK.consolidatedPretaxByYear, "2025-12-31": 20 * B },
});
assert(badReconcile.assessable === false, "分部合计与合并口径偏差超容差 → 不可评估");
assert((badReconcile as { reason: string }).reason === "reconciliation_failed", "原因为 reconciliation_failed");

// 真正的事故形态:误把**合并税前**当成分部合计(BRK FY2025 是 +90%)→ 必须被拦下。
const wrongTotal = computeHoldcoSotp({
  ...BRK,
  years: BRK.years.map((y, i) =>
    i === 0 ? { ...y, total_pretax: 82.459 * B, segments_pretax_sum: 82.459 * B } : y,
  ),
});
assert(wrongTotal.assessable === false, "错把合并税前当分部合计(+90%)→ 不可评估");

// ★ 缺值不得当「不查」:这条闸此前包在 `if (consolidatedPretaxByYear)` 里,而唯一的调用方
//   不传它 —— 于是它在生产上从未触发过一次。现在缺一年就 fail-closed。
const missingOneYear = computeHoldcoSotp({
  ...BRK,
  consolidatedPretaxByYear: { "2024-12-31": 57.577 * B, "2023-12-31": 45.311 * B },
});
assert(missingOneYear.assessable === false, "入算年份里有一年拿不到合并口径 → fail-closed");
assert((missingOneYear as { reason: string }).reason === "reconciliation_unavailable",
  "原因为 reconciliation_unavailable");
const emptyMap = computeHoldcoSotp({ ...BRK, consolidatedPretaxByYear: {} });
assert(emptyMap.assessable === false, "整张合并口径表为空 → fail-closed(不是「不查」)");
// 真数据本身必须过闸 —— 否则伯克希尔会被自己的对账闸误抑制(件④的老结论回来)。
assert(computeHoldcoSotp(BRK).assessable === true, "★ BRK 真实的合并口径偏差(+19.2/−6.3/−3.7%)在容差内 → 放行");

console.log("⑧ 递延税缺失时不静默按 0");
const noGain = computeHoldcoSotp({ ...BRK, investments: { total: 704.73 * B, unrealized_gain: null } });
assert(noGain.assessable === false, "递延税基数不可得 → fail-closed(不得少扣一项抬高估值)");
assert((noGain as { reason: string }).reason === "investments_unavailable", "原因为 investments_unavailable");

console.log("⑨ 非保险经营三年税后均值 ≤0 → no_operating_earnings");
// 让 total_pretax/total_tax 与保险集团口径相等 → 补集(非保险经营)恒为 0,均值不 >0。
// 段内恒等式与对账闸在此之前,故 fixture 要保持自洽(Σ 分部 = 合计,合并口径同量级),
// 否则测不到 no_operating_earnings 而是先被前面的闸拦下。
const noOperating = computeHoldcoSotp({
  ...BRK,
  years: BRK.years.map((y) => ({
    ...y,
    total_pretax: y.insurance_pretax,
    total_tax: y.insurance_tax,
    segments_pretax_sum: y.insurance_pretax,
  })),
  consolidatedPretaxByYear: Object.fromEntries(
    BRK.years.map((y) => [y.period_end, y.insurance_pretax]),
  ),
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

  // 复审 Minor:锁住短路条件本身 —— 未被抑制(holdco_not_assessable=false)但 holdco_sotp 恰好
  // 挂着,必须走原有路径而非误用 SOTP 带。验收标准:把 :164 的短路条件改成
  // `if (floor.holdco_sotp)` 时,这条断言必须变红(见下方专门验证记录于 report)。
  assert(
    deriveValuationVerdict({
      floor: { kind: "floor", holdco_not_assessable: false, holdco_sotp: sotp, net_net: { assessable: false } } as never,
      strikeZone: zone(511.54),
      methods: {} as never,
    }) === null,
    "holdco_not_assessable=false(未被抑制)但 holdco_sotp 存在 → 短路条件只认 holdco_not_assessable,不误用 SOTP 带",
  );

  // per_share 退化:三档乱序(pessimistic > optimistic)→ fail-closed。
  assert(
    deriveValuationVerdict({
      floor: {
        kind: "floor", holdco_not_assessable: true,
        holdco_sotp: { ...sotp, per_share: { pessimistic: 600, base: 496, optimistic: 400 } },
      } as never,
      strikeZone: zone(511.54),
      methods: {} as never,
    }) === null,
    "per_share 三档乱序(pessimistic>optimistic)→ fail-closed",
  );

  // per_share 退化:base<=0 → fail-closed。
  assert(
    deriveValuationVerdict({
      floor: {
        kind: "floor", holdco_not_assessable: true,
        holdco_sotp: { ...sotp, per_share: { pessimistic: 458, base: 0, optimistic: 534 } },
      } as never,
      strikeZone: zone(511.54),
      methods: {} as never,
    }) === null,
    "per_share.base<=0 → fail-closed",
  );

  // 价格 ≤0 → fail-closed。
  assert(mk(0) === null, "价格 ≤0 → fail-closed");
  assert(mk(-1) === null, "价格为负 → fail-closed");

  // Important #1 覆盖:货币不匹配 → 整条抑制,不得拿外币原值去比美元价值带。
  assert(
    deriveValuationVerdict({
      floor: { kind: "floor", holdco_not_assessable: true, holdco_sotp: sotp } as never,
      strikeZone: { price: { close: 511.54, date: "2026-08-10" }, currencyMismatch: true } as never,
      methods: {} as never,
    }) === null,
    "货币不匹配(currencyMismatch=true)→ fail-closed,不得用外币价格比美元 SOTP 带",
  );

  // Important #2 覆盖:80% 边际闸。把三档整体放大 10 倍(模拟股数错一个数量级),真实价格
  // 相对放大后的基础档产生 >80% 的假深度低估 → isImplausibleBand 必须拦下。
  const inflated = {
    ...sotp,
    per_share: {
      pessimistic: sotp.per_share.pessimistic * 10,
      base: sotp.per_share.base * 10,
      optimistic: sotp.per_share.optimistic * 10,
    },
  };
  const inflatedMargin = (inflated.per_share.base - 511.54) / inflated.per_share.base;
  assert(inflatedMargin > 0.8, `fixture 前提:放大后 marginPct(${inflatedMargin.toFixed(2)}) 确实 >0.8`);
  assert(
    deriveValuationVerdict({
      floor: { kind: "floor", holdco_not_assessable: true, holdco_sotp: inflated } as never,
      strikeZone: zone(511.54),
      methods: {} as never,
    }) === null,
    "股数错一个数量级导致假深度低估(marginPct>0.8)→ isImplausibleBand 拦下,fail-closed",
  );
}

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
