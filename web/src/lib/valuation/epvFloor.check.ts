/**
 * epvFloor.check.ts — self-check for the deterministic valuation-floor engine.
 * Run: cd web && npx tsx src/lib/valuation/epvFloor.check.ts
 * (No test framework — pure logic verified with node:assert.)
 *
 * Covers: lens-specific bridge (NOPAT +cash−debt vs owner-earnings none),
 * levered no-double-count, real averaged effective tax (capped 0–21%, fallback),
 * real tangible book (goodwill/intangibles removal + fallbacks), moat 3-band,
 * high-leverage, N<3 degradation, negative-earnings / negative-book branches.
 */
import assert from "node:assert";
import type { ValuationFloor, ValuationFloorInput, ValuationFloorYear } from "./types";
import { computeValuationFloor, DISCOUNT_RATE_HIGH, DISCOUNT_RATE_LOW, conservativeNormalizedForTest } from "./epvFloor";
import { maintenanceCapex } from "./maintenanceCapex";
import { deriveOeDcf } from "./ownerEarningsDcf";
import { CAP_STRONG, CAP_MODERATE } from "./moatCap";
import { LEVERAGE_L0, LEVERAGE_SLOPE, LEVERAGE_PREMIUM_CAP } from "./leveragePremium";

function year(fy: number, o: Partial<ValuationFloorYear>): ValuationFloorYear {
  return { fiscal_year: fy, ...o };
}

// computeValuationFloor 现返回联合类型；这个助手在断言里收窄到完整 floor。
function floorOf(r: ReturnType<typeof computeValuationFloor>): ValuationFloor {
  assert.ok(r && "kind" in r && r.kind === "floor", "expected a full floor result");
  return r;
}

// Net-cash compounder: ~43% op margin, effective tax 15%/yr, intangibles present.
const compounder: ValuationFloorInput = {
  ticker: "TEST",
  years: [
    year(2025, { revenue: 10_000, operating_margin: 0.45, net_income: 3_000, effective_tax_rate: 0.15, shareholders_equity: 5_000, goodwill: 500, intangibles: 300, cash: 2_000, total_debt: 1_000, net_debt: -1_000, shares_diluted: 1_000 }),
    year(2024, { revenue: 9_000, operating_margin: 0.44, net_income: 2_700, effective_tax_rate: 0.15, shareholders_equity: 4_500, goodwill: 500, intangibles: 300, cash: 1_800, total_debt: 1_000, net_debt: -800, shares_diluted: 1_000 }),
    year(2023, { revenue: 8_000, operating_margin: 0.42, net_income: 2_400, effective_tax_rate: 0.15, shareholders_equity: 4_000, goodwill: 500, intangibles: 300, cash: 1_600, total_debt: 1_000, net_debt: -600, shares_diluted: 1_000 }),
    year(2022, { revenue: 7_000, operating_margin: 0.43, net_income: 2_100, effective_tax_rate: 0.15, shareholders_equity: 3_500, goodwill: 500, intangibles: 300, cash: 1_400, total_debt: 1_000, net_debt: -400, shares_diluted: 1_000 }),
    year(2021, { revenue: 6_000, operating_margin: 0.41, net_income: 1_800, effective_tax_rate: 0.15, shareholders_equity: 3_000, goodwill: 500, intangibles: 300, cash: 1_200, total_debt: 1_000, net_debt: -200, shares_diluted: 1_000 }),
  ],
};

// ── degradation ───────────────────────────────────────────────────────────────
assert.strictEqual(computeValuationFloor({ ticker: "EMPTY", years: [] }), undefined, "no years → undefined");
assert.strictEqual(computeValuationFloor({ ticker: "THIN", years: compounder.years.slice(0, 2) }), undefined, "N<3 → undefined");

const floor = floorOf(computeValuationFloor(compounder));
assert.ok(floor, "compounder produces a floor");
assert.strictEqual(floor.provenance.years_used.length, 5, "5 years used");
assert.deepStrictEqual(floor.provenance.discount_rate_band, [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH], "band recorded");
assert.strictEqual(floor.provenance.share_count_basis, "diluted", "diluted basis");

// ── Graham NOPAT lamp + bridge, at REAL 15% tax ──────────────────────────────
// avg margin 0.43 × rev 10000 × (1−0.15) = 3_655
const g = floor.graham_epv;
assert.ok(g.assessable, "graham assessable");
assert.ok(Math.abs(g.normalized_earnings! - 3_655) < 1, `nopat≈3655 (15% tax) got ${g.normalized_earnings}`);
// equity_high uses LOW rate: 3655/r_low + cash2000 − debt1000
const gHigh = 3_655 / DISCOUNT_RATE_LOW + 2_000 - 1_000;
assert.ok(Math.abs(g.equity_value_high! - gHigh) < 1, `graham eq_high≈${gHigh.toFixed(0)} got ${g.equity_value_high}`);
// equity_low uses HIGH rate: 3655/r_high + 1000
const gLow = 3_655 / DISCOUNT_RATE_HIGH + 2_000 - 1_000;
assert.ok(Math.abs(g.equity_value_low! - gLow) < 1, `graham eq_low≈${gLow.toFixed(0)} got ${g.equity_value_low}`);
assert.ok(Math.abs(g.per_share_high! - gHigh / 1_000) < 0.01, `graham ps_high≈${(gHigh / 1_000).toFixed(2)} got ${g.per_share_high}`);
assert.ok(g.method.bridge.includes("cash") && g.method.bridge.includes("debt"), "graham bridges +cash −debt");
assert.ok(/unlevered/i.test(g.method.leverage_treatment), "graham unlevered");

// ── Buffett owner-earnings lamp, NO bridge ───────────────────────────────────
// avg net income 2_400, latest 3_000 (upward branch). This fixture is a textbook
// revenue-driven grower (net income 1800→3000 in step with revenue, margins flat),
// so Phase 3.7's structural-confidence basis lift engages: s=0.6, target=3_000
// (log-trend fit ≥ latest) → normalized = 2400 + 0.6×(3000−2400) = 2_760.
// eq_high 2760/r_low (no bridge), eq_low 2760/r_high.
const b = floor.buffett_epv;
assert.ok(b.assessable, "buffett assessable");
assert.ok(Math.abs(floor.structural_confidence! - 0.6) < 1e-9, `structural_confidence≈0.6 got ${floor.structural_confidence}`);
assert.ok(Math.abs(b.normalized_earnings! - 2_760) < 1, `buffett normalized_earnings≈2760 (s-lifted) got ${b.normalized_earnings}`);
assert.ok(Math.abs(b.equity_value_high! - 2_760 / DISCOUNT_RATE_LOW) < 1, `buffett eq_high (no bridge) got ${b.equity_value_high}`);
assert.ok(Math.abs(b.equity_value_low! - 2_760 / DISCOUNT_RATE_HIGH) < 1, `buffett eq_low got ${b.equity_value_low}`);
assert.ok(/no .*bridge/i.test(b.method.bridge), "buffett states no bridge");
assert.ok(/levered/i.test(b.method.leverage_treatment), "buffett levered");

// ── levered fixture: buffett must NOT subtract debt; graham DOES bridge ───────
const levered: ValuationFloorInput = {
  ticker: "LEVR",
  years: [
    year(2025, { revenue: 10_000, operating_margin: 0.2, net_income: 1_000, effective_tax_rate: 0.21, shareholders_equity: 2_000, cash: 500, total_debt: 8_000, net_debt: 7_500, shares_diluted: 1_000 }),
    year(2024, { revenue: 9_500, operating_margin: 0.2, net_income: 950, effective_tax_rate: 0.21, shareholders_equity: 1_900, cash: 480, total_debt: 8_000, net_debt: 7_520, shares_diluted: 1_000 }),
    year(2023, { revenue: 9_000, operating_margin: 0.2, net_income: 900, effective_tax_rate: 0.21, shareholders_equity: 1_800, cash: 460, total_debt: 8_000, net_debt: 7_540, shares_diluted: 1_000 }),
  ],
};
const lf = floorOf(computeValuationFloor(levered));
// avg NI 950, latest 1_000 (upward branch, revenue-driven grower like the compounder
// fixture above) → Phase 3.7 structural-confidence lift engages: s=0.6, target=1_000 →
// normalized = 950 + 0.6×(1000−950) = 980. eq_high 980/r_low (debt NOT subtracted).
// This fixture is net-debt heavy (netDebt 7_500 vs ownerEarnings 980 → ~7.7yr coverage,
// above LEVERAGE_L0=3) so, post-Task-2, the Buffett lamp's r_low now carries a nonzero
// leverage premium — read it off method.discount_rate_low rather than the bare
// DISCOUNT_RATE_LOW constant (asserted separately below).
assert.ok(Math.abs(lf.structural_confidence! - 0.6) < 1e-9, `levered structural_confidence≈0.6 got ${lf.structural_confidence}`);
assert.ok(Math.abs(lf.buffett_epv.normalized_earnings! - 980) < 1, `levered buffett normalized_earnings≈980 (s-lifted) got ${lf.buffett_epv.normalized_earnings}`);
assert.ok((lf.leverage_premium ?? 0) > 0, "levered fixture: net-debt-heavy → nonzero leverage premium");
assert.strictEqual(lf.buffett_epv.method.discount_rate_low, DISCOUNT_RATE_LOW + lf.leverage_premium!, "levered buffett r_low = base + premium");
assert.ok(Math.abs(lf.buffett_epv.equity_value_high! - 980 / lf.buffett_epv.method.discount_rate_low) < 1, `levered buffett eq_high got ${lf.buffett_epv.equity_value_high}`);
// Pin the premium itself against the slope formula (symbolic in the exported constants so
// Task 8's recalibration of LEVERAGE_L0/LEVERAGE_SLOPE/LEVERAGE_PREMIUM_CAP doesn't break this):
// netDebt 7_500 / ownerEarnings 980 ≈ 7.7yr coverage, inside the linear slope region (not capped).
const expectedLeveredPremium = Math.min(LEVERAGE_PREMIUM_CAP, Math.max(0, (7_500 / 980 - LEVERAGE_L0) * LEVERAGE_SLOPE));
assert.ok(Math.abs(lf.leverage_premium! - expectedLeveredPremium) < 1e-9, `levered premium matches the slope formula, expected≈${expectedLeveredPremium} got ${lf.leverage_premium}`);
// graham bridges: nopat 0.2×10000×(1−0.21)=1580; /r_low +500 −8000
assert.ok(Math.abs(lf.graham_epv.equity_value_high! - (1_580 / DISCOUNT_RATE_LOW + 500 - 8_000)) < 1, `levered graham eq_high (bridged) got ${lf.graham_epv.equity_value_high}`);
assert.strictEqual(lf.high_leverage_warning, true, "levered trips high-leverage warning");
assert.ok((lf.net_debt_to_equity ?? 0) > 1, "net debt/equity > 1 recorded");
assert.strictEqual(floor.high_leverage_warning, false, "net-cash compounder no warning");

// ── suppressedFlags 摘掉杠杆那半(spec Task 5):strong-eligible 判别夹具(真正的 RED→GREEN)──────
// 复用 Phase 2.5 节(:549 附近)已验证的「稳定高 ROIC franchise」夹具形状(cash=0/total_debt=0 → 股权桥不吃 net_debt;moatRefLamp 用
// Graham 灯,免疫 Buffett 灯的杠杆溢价),构造一个真能读到 strong 的夹具,才能看出杠杆摘除的差异。
//
// 只改**最新一年**的 net_debt(而非全部年份):
//   - netDebtOf(latest) 同时驱动 highLeverage 与 leveragePremium(epvFloor.ts:389),一次改动
//     两处触发,证明隔离成功不需要额外手段；
//   - investedCapitalOf 逐年读 net_debt 算投入资本(moatCap.ts roicHelpers)。若把全部年份的
//     net_debt 都拉爆，会连带压垮多年 ROIC、把 roicStable 也带假，失去隔离（曾实测复现：全年覆盖
//     net_debt=1e9 时 roicStable 从 true 翻 false，与本 Task 无关的另一条通路）。只动最新一年，
//     其余 5 年 ROIC 不受影响，稳定性判据(6 年里 ≥2/3 过门槛)在烂 1 年时仍然通过。
{
  const mk = (fy: number, oi: number, eq: number): ValuationFloorYear => ({
    fiscal_year: fy, revenue: oi / 0.4, operating_margin: 0.4, operating_income: oi, net_income: oi * 0.75,
    effective_tax_rate: 0.15, shareholders_equity: eq, goodwill: 200, intangibles: 100, cash: 0, total_debt: 0,
    net_debt: 0, shares_diluted: 1_000, rd_expense: oi * 0.25, d_and_a: 800, capex: 1_500, ppe_net: 5_000, working_capital: 1_000,
  });
  const strongYears: ValuationFloorYear[] = [
    mk(2025, 3_600, 10_200), mk(2024, 3_200, 9_100), mk(2023, 2_850, 8_100),
    mk(2022, 2_550, 7_200), mk(2021, 2_250, 6_400), mk(2020, 2_000, 5_700),
  ];
  const strongFloor = floorOf(computeValuationFloor({ ticker: "STRONG_UNLEVERED", years: strongYears }));
  // 前提自检:夹具真的能读到 strong,否则本组测试同样空转
  assert.strictEqual(strongFloor.moat_cap.grade, "strong", "前提:未杠杆化夹具确实读 strong(否则测不出杠杆摘除)");

  const leveredYears = strongYears.map((y) =>
    y.fiscal_year === 2025 ? { ...y, net_debt: y.shareholders_equity! * 3 } : y);
  const leveredStrong = floorOf(computeValuationFloor({ ticker: "STRONG_LEVERED", years: leveredYears }));

  // 前提自检:fixture 真的触发旧杠杆 flag
  assert.strictEqual(leveredStrong.high_leverage_warning, true, "前提:高杠杆 flag 确实被 fixture 触发");
  // 前提自检:护城河信号 + roicStable 均未被隔离手法污染(Graham 灯免疫杠杆溢价、IC 多年稳定性未破)
  assert.strictEqual(leveredStrong.moat_reading.signal, strongFloor.moat_reading.signal, "前提:护城河信号未受污染");
  assert.strictEqual(leveredStrong.moat_cap.roicStable, true, "前提:roicStable 隔离成功,单年扰动未压垮多年稳定性");

  // 本 Task 的真断言:杠杆不再把 strong-eligible franchise 压成 moderate
  assert.strictEqual(leveredStrong.moat_cap.grade, "strong", "杠杆不再把 strong franchise 压成 moderate");
  assert.strictEqual(leveredStrong.moat_cap.capYears, CAP_STRONG, "杠杆不再砍 CAP(20→10)");
  assert.strictEqual(leveredStrong.moat_cap.durablePassed, true, "杠杆不再否决耐久性");
}

// ── moat franchise + negative-earnings degradation ───────────────────────────
assert.strictEqual(floor.moat_reading.signal, "franchise", `compounder franchise got ${floor.moat_reading.signal}`);
assert.ok(/directional/i.test(floor.moat_reading.basis_note) && /reproduction value/i.test(floor.moat_reading.basis_note), "moat basis note directional + reproduction value");
assert.strictEqual(floor.moat_reading.dual_test_passed, true, "compounder dual franchise gate passed");
assert.strictEqual(floor.moat_reading.franchise_blocked_by_reproduction, undefined, "compounder not blocked by reproduction AV");
assert.ok(floor.moat_reading.av_conservative_per_share != null, "compounder exposes AV_conservative");
assert.ok(floor.moat_reading.av_reproduction_per_share != null, "compounder exposes AV_reproduction");
assert.ok(
  floor.moat_reading.av_reproduction_per_share! >= floor.moat_reading.av_conservative_per_share!,
  "AV_reproduction ≥ AV_conservative",
);
const loss: ValuationFloorInput = {
  ticker: "LOSS",
  years: [
    year(2025, { revenue: 10_000, operating_margin: -0.1, net_income: -800, shareholders_equity: 4_000, goodwill: 100, intangibles: 100, cash: 500, total_debt: 0, net_debt: -500, shares_diluted: 1_000 }),
    year(2024, { revenue: 9_000, operating_margin: -0.05, net_income: -400, shareholders_equity: 4_200, goodwill: 100, intangibles: 100, cash: 500, total_debt: 0, net_debt: -500, shares_diluted: 1_000 }),
    year(2023, { revenue: 8_000, operating_margin: -0.08, net_income: -600, shareholders_equity: 4_400, goodwill: 100, intangibles: 100, cash: 500, total_debt: 0, net_debt: -500, shares_diluted: 1_000 }),
  ],
};
const lm = floorOf(computeValuationFloor(loss));
assert.strictEqual(lm.graham_epv.assessable, false, "neg NOPAT → graham not assessable");
assert.strictEqual(lm.buffett_epv.assessable, false, "neg owner earnings → buffett not assessable");
assert.strictEqual(lm.asset_floor.assessable, true, "asset floor still emitted on losses");
assert.strictEqual(lm.moat_reading.signal, "value_destruction", "losses → value destruction");

// ── real averaged effective tax rate: cap / floor / fallback ─────────────────
assert.ok(Math.abs(floor.provenance.normalized_tax_rate - 0.15) < 1e-9, `prov tax 0.15 got ${floor.provenance.normalized_tax_rate}`);
assert.ok(/effective/i.test(floor.provenance.normalized_tax_rate_basis), "tax basis says effective");
const highTax = floorOf(computeValuationFloor({ ticker: "HI", years: compounder.years.map((y) => ({ ...y, effective_tax_rate: 0.3 })) }));
assert.ok(Math.abs(highTax.provenance.normalized_tax_rate - 0.21) < 1e-9, "eff tax capped at 21%");
const negTax = floorOf(computeValuationFloor({ ticker: "NEG", years: compounder.years.map((y) => ({ ...y, effective_tax_rate: -0.1 })) }));
assert.ok(Math.abs(negTax.provenance.normalized_tax_rate - 0) < 1e-9, "eff tax floored at 0");
const noTax = floorOf(computeValuationFloor({ ticker: "NOTAX", years: compounder.years.map(({ effective_tax_rate, ...rest }) => rest) }));
assert.ok(Math.abs(noTax.provenance.normalized_tax_rate - 0.21) < 1e-9, "missing tax → fallback 0.21");
assert.ok(/fallback|statutory/i.test(noTax.provenance.normalized_tax_rate_basis), "fallback basis labeled");

// ── real tangible book value + fallbacks ─────────────────────────────────────
// compounder latest: equity 5000 − goodwill 500 − intangibles 300 = 4_200 → /1000 = 4.2
const af = floor.asset_floor;
assert.ok(af.assessable, "asset floor assessable");
assert.strictEqual(af.intangibles_separated, true, "intangibles separated when present");
assert.ok(Math.abs(af.per_share! - 4.2) < 1e-9, `tangible per share 4.2 got ${af.per_share}`);
assert.ok(/tangible/i.test(af.basis), "basis says tangible");
const noIntang = floorOf(computeValuationFloor({ ticker: "NOINT", years: compounder.years.map(({ goodwill, intangibles, ...rest }) => rest) }));
assert.strictEqual(noIntang.asset_floor.intangibles_separated, false, "no separation when both missing");
assert.strictEqual(noIntang.asset_floor.dual_av_comparable, false, "no intangible split → dual AV not comparable");
assert.ok(Math.abs(noIntang.asset_floor.per_share! - 5.0) < 1e-9, `total-book fallback 5.0 got ${noIntang.asset_floor.per_share}`);
assert.ok(/intangibles not separated|total book/i.test(noIntang.asset_floor.basis), "fallback basis labeled");
assert.ok(/dual reproduction test unavailable/i.test(noIntang.moat_reading.basis_note), "moat basis notes dual test unavailable when intangibles not separated");
assert.strictEqual(noIntang.moat_reading.dual_test_passed, undefined, "no dual_test_passed when dual unavailable");
assert.strictEqual(noIntang.moat_reading.franchise_blocked_by_reproduction, undefined, "no franchise_blocked flag when dual unavailable");
const negTangible = floorOf(computeValuationFloor({ ticker: "NEGT", years: compounder.years.map((y) => ({ ...y, goodwill: 4_900, intangibles: 300 })) }));
assert.strictEqual(negTangible.asset_floor.assessable, false, "negative tangible book → not assessable");
assert.strictEqual(negTangible.asset_floor.per_share, undefined, "no negative per-share floor");

// ── 单灯回退：金融股（有净利+股数、无营业利润率）─────────────────────────────
// 银行式 fixture：无 operating_margin / operating_income，但有 net_income、shares、equity。
const financial: ValuationFloorInput = {
  ticker: "BANKX",
  years: [
    year(2025, { net_income: 3_000, pretax_income: 3_800, income_tax_expense: 800, shareholders_equity: 20_000, cash: 5_000, total_debt: 1_000, net_debt: -4_000, shares_diluted: 1_000 }),
    year(2024, { net_income: 2_800, pretax_income: 3_500, income_tax_expense: 700, shareholders_equity: 18_000, cash: 4_500, total_debt: 1_000, net_debt: -3_500, shares_diluted: 1_000 }),
    year(2023, { net_income: 2_600, pretax_income: 3_200, income_tax_expense: 600, shareholders_equity: 16_000, cash: 4_000, total_debt: 1_000, net_debt: -3_000, shares_diluted: 1_000 }),
  ],
};
const fin = floorOf(computeValuationFloor(financial));
assert.strictEqual(fin.graham_epv.assessable, false, "financial: graham not assessable (no operating income)");
assert.ok(/operating income is not reported/i.test(fin.graham_epv.not_assessable_reason ?? ""), "financial: graham reason names missing operating income");
assert.ok(fin.buffett_epv.assessable, "financial: buffett lamp assessable");
// This fixture has no `revenue` field, so revenueDrivenRatio=0; it also has no
// `operating_income`, so nopatOf/roicLongTermStrong can never see a valid year →
// roicLongTermStrong=false. Both structural-confidence inputs are zero, so s=0 and the
// Phase 3.7 basis lift never engages — behavior is bit-for-bit the pre-Task-6 average:
// avg NI 2800, no D&A/capex data → owner earnings degrades to avg NI = 2800 exactly.
assert.strictEqual(fin.structural_confidence, 0, `financial: s=0 (no revenue, no operating_income) got ${fin.structural_confidence}`);
assert.ok(Math.abs(fin.buffett_epv.normalized_earnings! - 2_800) < 1, `financial buffett normalized_earnings=2800 (s=0, no lift) got ${fin.buffett_epv.normalized_earnings}`);
assert.ok(Math.abs(fin.buffett_epv.equity_value_high! - 2_800 / DISCOUNT_RATE_LOW) < 1, `financial buffett eq_high got ${fin.buffett_epv.equity_value_high}`);
assert.ok(
  Math.abs(fin.buffett_epv.per_share_high! - fin.buffett_epv.equity_value_high! / 1_000) < 1e-9,
  `financial buffett ps_high got ${fin.buffett_epv.per_share_high}`,
);
assert.strictEqual(fin.asset_floor.assessable, true, "financial: asset floor still emitted");
assert.ok(fin.provenance.earnings_basis_note && /owner[- ]earnings/i.test(fin.provenance.earnings_basis_note), "financial: provenance carries single-lamp basis note");
assert.notStrictEqual(fin.moat_reading.signal, "not_assessable", "financial: moat reads off buffett lamp, not stuck unassessable");

// ── 多股权：有盈利、无任何股数 → per_share_unavailable（不再 undefined）──────────
const multiClass: ValuationFloorInput = {
  ticker: "MULTI",
  years: [
    year(2025, { revenue: 30_000, operating_margin: 0.6, net_income: 18_000, shareholders_equity: 40_000, cash: 10_000, total_debt: 5_000 }),
    year(2024, { revenue: 28_000, operating_margin: 0.6, net_income: 16_000, shareholders_equity: 38_000, cash: 9_000, total_debt: 5_000 }),
    year(2023, { revenue: 25_000, operating_margin: 0.6, net_income: 14_000, shareholders_equity: 35_000, cash: 8_000, total_debt: 5_000 }),
  ],
};
const mc = computeValuationFloor(multiClass);
assert.ok(mc && "kind" in mc && mc.kind === "per_share_unavailable", "multi-class (no shares) → per_share_unavailable");
assert.ok(/multi-share-class/i.test((mc as { reason: string }).reason), "per_share_unavailable carries multi-class reason");

// 真薄数据（<3 盈利年）仍 undefined（回归）
assert.strictEqual(computeValuationFloor({ ticker: "THIN2", years: financial.years.slice(0, 2) }), undefined, "N<3 net-income years → undefined");

// ── EPV 写法 A (spec §1.2) ───────────────────────────────────────────────────
{
  // capex high vs D&A → maintenance capex > D&A → EPV below NOPAT/WACC.
  const years = [
    { fiscal_year: 2025, revenue: 10_000, operating_margin: 0.30, net_income: 2_000, effective_tax_rate: 0.20, shareholders_equity: 5_000, cash: 1_000, total_debt: 0, shares_diluted: 1_000, capex: 2_500, d_and_a: 1_000, ppe_net: 12_000 },
    { fiscal_year: 2024, revenue: 9_500, operating_margin: 0.30, net_income: 1_900, effective_tax_rate: 0.20, shareholders_equity: 4_800, cash: 900, total_debt: 0, shares_diluted: 1_000, capex: 2_300, d_and_a: 950, ppe_net: 11_000 },
    { fiscal_year: 2023, revenue: 9_000, operating_margin: 0.30, net_income: 1_800, effective_tax_rate: 0.20, shareholders_equity: 4_600, cash: 800, total_debt: 0, shares_diluted: 1_000, capex: 2_100, d_and_a: 900, ppe_net: 10_000 },
  ];
  const floor = computeValuationFloor({ ticker: "EPVA", years });
  assert.ok(floor && "kind" in floor && floor.kind === "floor", "EPVA produces a floor");
  if (floor && "kind" in floor && floor.kind === "floor") {
    const g = floor.graham_epv;
    assert.ok(g.assessable, "graham lamp assessable");
    // Reconstruct NOPAT and the maintenance-capex deduction.
    const taxRate = floor.provenance.normalized_tax_rate;
    const nopat = 0.30 * 10_000 * (1 - taxRate);
    const mc = maintenanceCapex(years as any).value!;
    const da = 1_000;
    // write A: EPV(Biz) = (NOPAT + D&A − maintCapex)/r. With maintCapex > D&A, < NOPAT/r.
    const expectedHigh = (nopat + da - mc) / DISCOUNT_RATE_LOW + 1_000 - 0; // +cash −debt
    assert.ok(Math.abs(g.equity_value_high! - expectedHigh) < 1e-6, "EPV write A: full-cash maintenance-capex deduction, no tax shield");
    assert.ok(g.equity_value_high! < nopat / DISCOUNT_RATE_LOW + 1_000, "maintCapex > D&A presses EPV below NOPAT/WACC");
  }
}

// ── Owner Earnings (spec §1.3) ───────────────────────────────────────────────
{
  // Net income held flat (latest == avg, not monotonically increasing) so that the
  // Phase 3.7 structural-confidence lift never engages (s=0; see structuralConfidence.ts:
  // target=max(avg, min(latest,trendFit)) <= avg whenever latest<=avg) — this fixture's job
  // is auditing ΔNWC exclusion (#3) and SBC non-add-back (#6), not the earnings-lift path, so
  // it deliberately does not need a rising net-income series.
  const years = [
    { fiscal_year: 2025, revenue: 10_000, operating_margin: 0.30, net_income: 1_800, effective_tax_rate: 0.20, shareholders_equity: 5_000, cash: 500, total_debt: 0, shares_diluted: 1_000, capex: 1_500, d_and_a: 1_000, ppe_net: 9_000, stock_based_comp: 200, working_capital: 1_000 },
    { fiscal_year: 2024, revenue: 9_500, operating_margin: 0.30, net_income: 1_800, effective_tax_rate: 0.20, shareholders_equity: 4_800, cash: 450, total_debt: 0, shares_diluted: 1_000, capex: 1_400, d_and_a: 950, ppe_net: 8_500, stock_based_comp: 180, working_capital: 800 },
    { fiscal_year: 2023, revenue: 9_000, operating_margin: 0.30, net_income: 1_800, effective_tax_rate: 0.20, shareholders_equity: 4_600, cash: 400, total_debt: 0, shares_diluted: 1_000, capex: 1_300, d_and_a: 900, ppe_net: 8_000, stock_based_comp: 160, working_capital: 600 },
  ];
  const floor = computeValuationFloor({ ticker: "OE", years });
  assert.ok(floor && "kind" in floor && floor.kind === "floor");
  if (floor && "kind" in floor && floor.kind === "floor") {
    const b = floor.buffett_epv;
    assert.ok(b.assessable, "buffett lamp assessable");
    assert.strictEqual(floor.structural_confidence, 0, `OE fixture: s=0 (flat net income, latest==avg) got ${floor.structural_confidence}`);
    const avgNi = (1_800 + 1_800 + 1_800) / 3;
    const avgDa = (1_000 + 950 + 900) / 3;
    const mc = maintenanceCapex(years as any).value!;
    const oe = avgNi + avgDa - mc; // NO ΔNWC term (audit fix #3)
    assert.ok(
      Math.abs(b.normalized_earnings! - oe) < 1e-6,
      `owner earnings = net income + D&A − maintenance capex, no ΔNWC, got ${b.normalized_earnings} expected ${oe}`,
    );
    // SBC is NOT added back (audit fix #6) but disclosed.
    assert.ok(b.sbc_to_oe_pct != null && b.sbc_to_oe_pct > 0, "SBC/OE disclosed");
    const avgSbc = (200 + 180 + 160) / 3;
    assert.ok(Math.abs(b.sbc_to_oe_pct! - avgSbc / b.normalized_earnings!) < 1e-6, "SBC/OE% = avg SBC / owner earnings");
  }
}

// ── Reproduction value as asset floor + moat EPV vs AV (spec §1.4/§1.5) ───────
{
  // R&D-heavy franchise: capitalized R&D should lift AV above tangible book; EPV well above AV → franchise.
  const years = [
    { fiscal_year: 2025, revenue: 20_000, operating_margin: 0.40, net_income: 6_000, effective_tax_rate: 0.15, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500, cash: 3_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 2_000, d_and_a: 800, capex: 900, ppe_net: 6_000 },
    { fiscal_year: 2024, revenue: 18_000, operating_margin: 0.40, net_income: 5_400, effective_tax_rate: 0.15, shareholders_equity: 9_000, goodwill: 1_000, intangibles: 500, cash: 2_500, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_800, d_and_a: 750, capex: 850, ppe_net: 5_500 },
    { fiscal_year: 2023, revenue: 16_000, operating_margin: 0.40, net_income: 4_800, effective_tax_rate: 0.15, shareholders_equity: 8_000, goodwill: 1_000, intangibles: 500, cash: 2_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_600, d_and_a: 700, capex: 800, ppe_net: 5_000 },
  ];
  const floor = computeValuationFloor({ ticker: "MOAT", years });
  assert.ok(floor && "kind" in floor && floor.kind === "floor");
  if (floor && "kind" in floor && floor.kind === "floor") {
    // AV includes capitalized R&D, so it exceeds tangible book (10000−1000−500 = 8500).
    assert.ok(floor.asset_floor.capitalized_rd != null && floor.asset_floor.capitalized_rd > 0, "AV carries capitalized R&D");
    assert.ok(floor.asset_floor.total_value! > 8_500, "AV > tangible book (R&D capitalized)");
    // Moat compares EPV to AV (reproduction value), and franchise_value is set when franchise.
    assert.strictEqual(floor.moat_reading.signal, "franchise", "high-margin R&D franchise reads franchise vs reproduction value");
    assert.ok(floor.moat_reading.franchise_value != null && floor.moat_reading.franchise_value > 0, "franchise value (EPV − AV) set");
    assert.ok(floor.moat_reading.basis_note.toLowerCase().includes("reproduction"), "moat basis cites reproduction value");
  }
}

// ── Growth value wired into the floor (spec §1.6) ────────────────────────────
{
  // Same R&D franchise grower as the moat test but with a rising operating-income series.
  const years = [
    { fiscal_year: 2025, revenue: 20_000, operating_margin: 0.40, operating_income: 8_000, net_income: 6_000, effective_tax_rate: 0.15, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500, cash: 3_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 2_000, d_and_a: 800, capex: 1_800, ppe_net: 6_000, working_capital: 2_000 },
    { fiscal_year: 2024, revenue: 17_000, operating_margin: 0.40, operating_income: 6_800, net_income: 5_100, effective_tax_rate: 0.15, shareholders_equity: 9_000, goodwill: 1_000, intangibles: 500, cash: 2_500, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_800, d_and_a: 750, capex: 1_600, ppe_net: 5_500, working_capital: 1_700 },
    { fiscal_year: 2023, revenue: 14_500, operating_margin: 0.40, operating_income: 5_800, net_income: 4_350, effective_tax_rate: 0.15, shareholders_equity: 8_000, goodwill: 1_000, intangibles: 500, cash: 2_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_600, d_and_a: 700, capex: 1_400, ppe_net: 5_000, working_capital: 1_400 },
    { fiscal_year: 2022, revenue: 12_500, operating_margin: 0.40, operating_income: 5_000, net_income: 3_750, effective_tax_rate: 0.15, shareholders_equity: 7_000, goodwill: 1_000, intangibles: 500, cash: 1_800, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_400, d_and_a: 650, capex: 1_200, ppe_net: 4_500, working_capital: 1_200 },
    { fiscal_year: 2021, revenue: 11_000, operating_margin: 0.40, operating_income: 4_400, net_income: 3_300, effective_tax_rate: 0.15, shareholders_equity: 6_000, goodwill: 1_000, intangibles: 500, cash: 1_600, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_200, d_and_a: 600, capex: 1_000, ppe_net: 4_000, working_capital: 1_000 },
  ];
  const floor = computeValuationFloor({ ticker: "GROW", years });
  assert.ok(floor && "kind" in floor && floor.kind === "floor");
  if (floor && "kind" in floor && floor.kind === "floor") {
    assert.strictEqual(floor.moat_reading.signal, "franchise", "grower reads franchise");
    assert.ok(floor.growth_value.assessable, "GV assessable for the franchise grower");
    assert.strictEqual(floor.growth_value.gated_to_zero, false, "franchise → GV not gated");
    assert.ok(floor.growth_value.scenarios.neutral > 0, "franchise grower → positive neutral GV");
    assert.ok(floor.growth_value.per_share.pessimistic <= floor.growth_value.per_share.optimistic + 1e-9, "GV scenarios ordered");
  }

  // A commodity (low margin, EPV ≈ AV) → GV gated to zero.
  const commodityYears = [
    { fiscal_year: 2025, revenue: 20_000, operating_margin: 0.05, operating_income: 1_000, net_income: 700, effective_tax_rate: 0.21, shareholders_equity: 9_000, cash: 200, total_debt: 0, shares_diluted: 1_000, d_and_a: 800, capex: 1_200, ppe_net: 9_000, working_capital: 2_000 },
    { fiscal_year: 2024, revenue: 18_000, operating_margin: 0.05, operating_income: 900, net_income: 650, effective_tax_rate: 0.21, shareholders_equity: 8_500, cash: 180, total_debt: 0, shares_diluted: 1_000, d_and_a: 750, capex: 1_100, ppe_net: 8_500, working_capital: 1_800 },
    { fiscal_year: 2023, revenue: 16_000, operating_margin: 0.05, operating_income: 800, net_income: 600, effective_tax_rate: 0.21, shareholders_equity: 8_000, cash: 160, total_debt: 0, shares_diluted: 1_000, d_and_a: 700, capex: 1_000, ppe_net: 8_000, working_capital: 1_600 },
  ];
  const cFloor = computeValuationFloor({ ticker: "COMM", years: commodityYears });
  assert.ok(cFloor && "kind" in cFloor && cFloor.kind === "floor");
  if (cFloor && "kind" in cFloor && cFloor.kind === "floor") {
    assert.notStrictEqual(cFloor.moat_reading.signal, "franchise", "low-margin commodity is not a franchise");
    assert.strictEqual(cFloor.growth_value.gated_to_zero, true, "non-franchise → GV gated to zero");
    assert.strictEqual(cFloor.growth_value.scenarios.neutral, 0, "gated → GV 0");
  }
}

// ── audit #2: cyclical normalization (declining → anchor to latest run-rate) ────
{
  // 净利 recent-first [500,1200,1700,1500,600]; avg=1100, 最新 500 < avg → 应压到 500。
  // 无 D&A/capex → canCorrect=false → owner earnings = 正常化净利本身。
  const cyc: ValuationFloorInput = {
    ticker: "CYC",
    years: [
      year(2025, { revenue: 5_000, operating_margin: 0.10, operating_income: 500, net_income: 500, effective_tax_rate: 0.21, shareholders_equity: 4_000, cash: 500, total_debt: 0, shares_diluted: 1_000 }),
      year(2024, { revenue: 8_000, operating_margin: 0.20, operating_income: 1_600, net_income: 1_200, effective_tax_rate: 0.21, shareholders_equity: 4_000, cash: 500, total_debt: 0, shares_diluted: 1_000 }),
      year(2023, { revenue: 9_000, operating_margin: 0.25, operating_income: 2_250, net_income: 1_700, effective_tax_rate: 0.21, shareholders_equity: 4_000, cash: 500, total_debt: 0, shares_diluted: 1_000 }),
      year(2022, { revenue: 8_500, operating_margin: 0.23, operating_income: 1_955, net_income: 1_500, effective_tax_rate: 0.21, shareholders_equity: 4_000, cash: 500, total_debt: 0, shares_diluted: 1_000 }),
      year(2021, { revenue: 6_000, operating_margin: 0.12, operating_income: 720, net_income: 600, effective_tax_rate: 0.21, shareholders_equity: 4_000, cash: 500, total_debt: 0, shares_diluted: 1_000 }),
    ],
  };
  const f = floorOf(computeValuationFloor(cyc));
  assert.strictEqual(f.buffett_epv.normalized_earnings, 500, "declining cyclical → owner earnings anchored to latest (500), not the 1100 average");
  // 对照:把最新年净利换成最高(2200>avg)→ 用均值 1440,不压(无回归)。
  const grow: ValuationFloorInput = { ...cyc, years: [{ ...cyc.years[0], net_income: 2_200 }, ...cyc.years.slice(1)] };
  const fg = floorOf(computeValuationFloor(grow));
  assert.ok(Math.abs((fg.buffett_epv.normalized_earnings as number) - 1_440) < 1e-6, "latest ≥ avg → uses average (no cap, no regression)");
}

// net-net:current_assets − total_liabilities，用已解析 shares。
{
  const f = computeValuationFloor({
    ticker: "NETNET", company_name: "NetNet Co",
    years: [
      { fiscal_year: 2025, revenue: 1000, operating_income: 100, operating_margin: 0.1, net_income: 80, shareholders_equity: 500, cash: 50, total_debt: 0, shares_diluted: 100, d_and_a: 20, capex: 20, current_assets: 1000, total_liabilities: 400 },
      { fiscal_year: 2024, revenue: 950, operating_income: 95, operating_margin: 0.1, net_income: 76, shareholders_equity: 480, shares_diluted: 100, d_and_a: 20, capex: 20 },
      { fiscal_year: 2023, revenue: 900, operating_income: 90, operating_margin: 0.1, net_income: 72, shareholders_equity: 460, shares_diluted: 100, d_and_a: 20, capex: 20 },
    ],
  });
  assert.ok(f && f.kind === "floor", "netnet fixture yields floor");
  if (f && f.kind === "floor") {
    assert.ok(f.net_net.assessable, "net_net assessable");
    if (f.net_net.assessable) assert.ok(Math.abs(f.net_net.per_share - 6) < 1e-6, "net_net per_share = 6");
  }
}

// ── A3. SBC 回购抵消披露 ──────────────────────────────────────────────────────
{
  // 回购 ≈ SBC（回购未超 SBC）→ buyback_offsets_sbc = true
  const yrs = [2024, 2023, 2022, 2021].map((fy, i) => ({
    fiscal_year: fy, revenue: 1000, operating_income: 200, operating_margin: 0.2,
    net_income: 150, shareholders_equity: 800, shares_diluted: 100,
    d_and_a: 40, capex: 40, stock_based_comp: 30, share_repurchases: -25, // 回购25 ≤ SBC30
    current_assets: 500, total_liabilities: 300,
  }));
  const f = computeValuationFloor({ ticker: "T", years: yrs as never });
  assert.ok(f && (f as { kind?: string }).kind === "floor", "floor built");
  const lamp = (f as { buffett_epv: { buyback_offsets_sbc?: boolean } }).buffett_epv;
  assert.strictEqual(lamp.buyback_offsets_sbc, true, "buybacks ≤ SBC → offsets flag true");
}
{
  // 回购 ≫ SBC（净回馈）→ false
  const yrs = [2024, 2023, 2022, 2021].map((fy) => ({
    fiscal_year: fy, revenue: 1000, operating_income: 200, operating_margin: 0.2,
    net_income: 150, shareholders_equity: 800, shares_diluted: 100,
    d_and_a: 40, capex: 40, stock_based_comp: 10, share_repurchases: -200, // 回购200 ≫ SBC10
    current_assets: 500, total_liabilities: 300,
  }));
  const f = computeValuationFloor({ ticker: "T", years: yrs as never });
  const lamp = (f as { buffett_epv: { buyback_offsets_sbc?: boolean } }).buffett_epv;
  assert.strictEqual(lamp.buyback_offsets_sbc, false, "buybacks ≫ SBC → offsets flag false");
}

// ── Dual AV franchise gate: cons-pass / repr-fail → commodity ─────────────────
{
  // AV_cons_ps = (20k − 10k − 6k)/1k = 4; acquired_reset = 8k → AV_repr_ps = 12.
  // Low-margin EPV_mid ≈ 6.4 → passes 1.25× cons (5) but fails 1.25× repr (15).
  const blocked: ValuationFloorInput = {
    ticker: "BLOCK",
    years: [
      year(2025, { revenue: 10_000, operating_margin: 0.08, net_income: 500, effective_tax_rate: 0.21, shareholders_equity: 20_000, goodwill: 10_000, intangibles: 6_000, cash: 0, total_debt: 0, shares_diluted: 1_000 }),
      year(2024, { revenue: 9_500, operating_margin: 0.08, net_income: 480, effective_tax_rate: 0.21, shareholders_equity: 19_000, goodwill: 10_000, intangibles: 6_000, cash: 0, total_debt: 0, shares_diluted: 1_000 }),
      year(2023, { revenue: 9_000, operating_margin: 0.08, net_income: 460, effective_tax_rate: 0.21, shareholders_equity: 18_000, goodwill: 10_000, intangibles: 6_000, cash: 0, total_debt: 0, shares_diluted: 1_000 }),
    ],
  };
  const bf = floorOf(computeValuationFloor(blocked));
  assert.strictEqual(bf.asset_floor.dual_av_comparable, true, "blocked fixture dual-comparable");
  assert.ok(Math.abs(bf.asset_floor.per_share! - 4) < 1e-9, `AV_cons_ps=4 got ${bf.asset_floor.per_share}`);
  assert.ok(Math.abs(bf.asset_floor.reproduction_per_share! - 12) < 1e-9, `AV_repr_ps=12 got ${bf.asset_floor.reproduction_per_share}`);
  const epvMid = (bf.graham_epv.per_share_low! + bf.graham_epv.per_share_high!) / 2;
  assert.ok(epvMid / 4 >= 1.25, `EPV/AV_cons ≥ 1.25 (got ${epvMid / 4})`);
  assert.ok(epvMid / 12 < 1.25, `EPV/AV_repr < 1.25 (got ${epvMid / 12})`);
  assert.strictEqual(bf.moat_reading.signal, "commodity", "cons-pass/repr-fail → commodity (not franchise)");
  assert.strictEqual(bf.moat_reading.franchise_blocked_by_reproduction, true, "franchise_blocked_by_reproduction");
  assert.strictEqual(bf.moat_reading.dual_test_passed, false, "dual_test_passed false when repr fails");
  assert.strictEqual(bf.moat_reading.franchise_value, undefined, "no franchise_value when blocked");
}

// ── AI-hog scheme C: floor flag + GV gated even for franchise ─────────────────
{
  // High-margin franchise with capex doubling (8000/3500 ≥ 2) → AI warning lifts to floor;
  // growth value forced gated_to_zero despite franchise moat.
  const aiYears: ValuationFloorYear[] = [
    { fiscal_year: 2025, revenue: 20_000, operating_margin: 0.40, operating_income: 8_000, net_income: 6_000, effective_tax_rate: 0.15, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500, cash: 3_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 2_000, d_and_a: 2_000, capex: 8_000, ppe_net: 18_000, working_capital: 2_000 },
    { fiscal_year: 2024, revenue: 17_000, operating_margin: 0.40, operating_income: 6_800, net_income: 5_100, effective_tax_rate: 0.15, shareholders_equity: 9_000, goodwill: 1_000, intangibles: 500, cash: 2_500, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_800, d_and_a: 1_900, capex: 5_000, ppe_net: 12_000, working_capital: 1_700 },
    { fiscal_year: 2023, revenue: 14_500, operating_margin: 0.40, operating_income: 5_800, net_income: 4_350, effective_tax_rate: 0.15, shareholders_equity: 8_000, goodwill: 1_000, intangibles: 500, cash: 2_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_600, d_and_a: 1_800, capex: 3_500, ppe_net: 8_000, working_capital: 1_400 },
    { fiscal_year: 2022, revenue: 12_500, operating_margin: 0.40, operating_income: 5_000, net_income: 3_750, effective_tax_rate: 0.15, shareholders_equity: 7_000, goodwill: 1_000, intangibles: 500, cash: 1_800, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_400, d_and_a: 1_650, capex: 3_200, ppe_net: 6_500, working_capital: 1_200 },
    { fiscal_year: 2021, revenue: 11_000, operating_margin: 0.40, operating_income: 4_400, net_income: 3_300, effective_tax_rate: 0.15, shareholders_equity: 6_000, goodwill: 1_000, intangibles: 500, cash: 1_600, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_200, d_and_a: 1_500, capex: 3_000, ppe_net: 5_500, working_capital: 1_000 },
  ];
  assert.strictEqual(maintenanceCapex(aiYears).ai_capex_distortion_warning, true, "fixture triggers AI-hog");
  const aiFloor = floorOf(computeValuationFloor({ ticker: "AIHOG", years: aiYears }));
  assert.strictEqual(aiFloor.ai_capex_distortion_warning, true, "AI warning lifted onto ValuationFloor");
  assert.strictEqual(aiFloor.moat_reading.signal, "franchise", "AI fixture still reads franchise");
  assert.strictEqual(aiFloor.growth_value.gated_to_zero, true, "franchise + AI → GV gated_to_zero");
  assert.strictEqual(aiFloor.growth_value.scenarios.neutral, 0, "AI gate → GV 0");
  // Scheme C polish: lamp notes lean on maintenanceCapex (D&A-cap / growth-spike), not the old "50% floor → EPV pressed down" line.
  for (const lamp of [aiFloor.graham_epv, aiFloor.buffett_epv]) {
    const joined = lamp.method.simplifications.join(" | ").toLowerCase();
    assert.ok(!joined.includes("pressed down"), `${lamp.label}: no 'pressed down' (scheme C OE/EPV may look optimistic)`);
    assert.ok(!joined.includes("50% of current capex"), `${lamp.label}: no raw 50%-of-capex floor wording`);
    assert.ok(
      joined.includes("d&a") || joined.includes("growth"),
      `${lamp.label}: AI-hog note reflects D&A-cap / growth-spike treatment`,
    );
  }
}

// ── BUG1: negative-equity invested capital doesn't blow up ROIC into a false "stable" read ────
// A buyback-driven negative-equity name (AZO/HD/MCD/DPZ-style): shareholders_equity < 0 every
// year. Pre-fix, investedCapitalOf = net_debt + equity could land on a tiny positive number
// (ROIC in the thousands of percent, a false "stable" read) or on a negative IC (silently
// skipped every year → undefined, a false-negative). Post-fix, investedCapitalOf explicitly
// returns undefined whenever equity <= 0, so these years never enter the ROIC sample at all —
// moat_cap must not crash and must not read the distorted ROIC as "stable".
{
  const buyback: ValuationFloorInput = {
    ticker: "BUYBACK",
    years: [
      year(2025, { revenue: 20_000, operating_margin: 0.30, operating_income: 6_000, net_income: 4_500, effective_tax_rate: 0.21, shareholders_equity: -3_000, cash: 500, total_debt: 4_500, net_debt: 4_000, shares_diluted: 1_000 }),
      year(2024, { revenue: 18_000, operating_margin: 0.30, operating_income: 5_400, net_income: 4_000, effective_tax_rate: 0.21, shareholders_equity: -2_500, cash: 500, total_debt: 4_500, net_debt: 4_000, shares_diluted: 1_000 }),
      year(2023, { revenue: 16_000, operating_margin: 0.30, operating_income: 4_800, net_income: 3_600, effective_tax_rate: 0.21, shareholders_equity: -2_000, cash: 500, total_debt: 4_500, net_debt: 4_000, shares_diluted: 1_000 }),
    ],
  };
  const bb = floorOf(computeValuationFloor(buyback));
  assert.ok(bb.moat_cap, "BUG1: negative-equity fixture still produces a moat_cap (no crash)");
  assert.strictEqual(bb.moat_cap.roicStable, undefined, "BUG1: negative-equity years all skipped → <3 valid ROIC years → roicStable undefined, not a false-positive true");
  assert.notStrictEqual(bb.moat_cap.grade, "strong", "BUG1: negative-equity fixture must never read as a strong durable moat off a distorted ROIC");
}

// ── BUG2: single source of truth — growth_value and the owner-earnings DCF can no longer
// disagree on moat grade, even when fed a `years` history for deriveOeDcf that (pre-fix) would
// have flipped the CAGR-based `declined` read used only for the OE-DCF-side grade recomputation.
{
  const growYears: ValuationFloorYear[] = [
    { fiscal_year: 2025, revenue: 20_000, operating_margin: 0.40, operating_income: 8_000, net_income: 6_000, effective_tax_rate: 0.15, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500, cash: 3_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 2_000, d_and_a: 800, capex: 1_800, ppe_net: 6_000, working_capital: 2_000 },
    { fiscal_year: 2024, revenue: 17_000, operating_margin: 0.40, operating_income: 6_800, net_income: 5_100, effective_tax_rate: 0.15, shareholders_equity: 9_000, goodwill: 1_000, intangibles: 500, cash: 2_500, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_800, d_and_a: 750, capex: 1_600, ppe_net: 5_500, working_capital: 1_700 },
    { fiscal_year: 2023, revenue: 14_500, operating_margin: 0.40, operating_income: 5_800, net_income: 4_350, effective_tax_rate: 0.15, shareholders_equity: 8_000, goodwill: 1_000, intangibles: 500, cash: 2_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_600, d_and_a: 700, capex: 1_400, ppe_net: 5_000, working_capital: 1_400 },
    { fiscal_year: 2022, revenue: 12_500, operating_margin: 0.40, operating_income: 5_000, net_income: 3_750, effective_tax_rate: 0.15, shareholders_equity: 7_000, goodwill: 1_000, intangibles: 500, cash: 1_800, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_400, d_and_a: 650, capex: 1_200, ppe_net: 4_500, working_capital: 1_200 },
    { fiscal_year: 2021, revenue: 11_000, operating_margin: 0.40, operating_income: 4_400, net_income: 3_300, effective_tax_rate: 0.15, shareholders_equity: 6_000, goodwill: 1_000, intangibles: 500, cash: 1_600, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_200, d_and_a: 600, capex: 1_000, ppe_net: 4_000, working_capital: 1_000 },
  ];
  const gFloor = floorOf(computeValuationFloor({ ticker: "BUG2", years: growYears }));
  assert.strictEqual(gFloor.moat_reading.signal, "franchise", "BUG2 fixture reads franchise (reused GROW fixture)");
  assert.ok(gFloor.moat_cap.grade === "strong" || gFloor.moat_cap.grade === "moderate", "BUG2 fixture franchise → moat_cap grade strong/moderate");

  // growth_value duration must map from THIS SAME floor.moat_cap.grade (single source).
  const expectedDuration = gFloor.moat_cap.grade === "strong" ? CAP_STRONG : CAP_MODERATE;
  assert.strictEqual(gFloor.growth_value.duration_years, expectedDuration, "BUG2: growth_value.duration_years derives from floor.moat_cap.grade");

  const dgs10 = { value: 4.25, date: "2026-06-19" };
  const price = { close: 100, date: "2026-06-19", currency: "USD" };

  // Same fiscal years as growYears, but net_income REVERSED (latest lowest, oldest highest) —
  // pre-fix this would have flipped OE-DCF's local CAGR-based `declined` to true and, through the
  // old self-computed deriveMoatCap call, downgraded ITS OWN moatCap to "moderate" — independent
  // of (and possibly disagreeing with) growthValue's grade. Post-fix, moatCap is read verbatim
  // from floor.moat_cap and is therefore immune to this parameter.
  const declinedHistoryYears: ValuationFloorYear[] = [
    { fiscal_year: 2025, net_income: 1_000 },
    { fiscal_year: 2024, net_income: 2_000 },
    { fiscal_year: 2023, net_income: 3_000 },
    { fiscal_year: 2022, net_income: 4_000 },
    { fiscal_year: 2021, net_income: 6_000 },
  ];

  const oeNormal = deriveOeDcf(gFloor, growYears, dgs10, price);
  const oeDeclinedHistory = deriveOeDcf(gFloor, declinedHistoryYears, dgs10, price);
  assert.ok(oeNormal.assessable && oeDeclinedHistory.assessable, "BUG2: both OE-DCF reads assessable (assessability is floor-sourced, not years-sourced)");
  assert.strictEqual(oeNormal.declined, false, "BUG2 fixture sanity: growYears CAGR is positive (not declined)");
  assert.strictEqual(oeDeclinedHistory.declined, true, "BUG2 fixture sanity: declinedHistoryYears CAGR is negative (declined) — proves the fixture actually flips the old signal");

  // The regression: despite `declined` flipping between the two calls, moatCap.grade does NOT.
  assert.strictEqual(oeNormal.moatCap?.grade, gFloor.moat_cap.grade, "BUG2 fix: OE-DCF moatCap.grade === floor.moat_cap.grade (normal years)");
  assert.strictEqual(oeDeclinedHistory.moatCap?.grade, gFloor.moat_cap.grade, "BUG2 fix: OE-DCF moatCap.grade === floor.moat_cap.grade even when fed a declining-history `years` param");
  assert.deepStrictEqual(oeNormal.moatCap, oeDeclinedHistory.moatCap, "BUG2 fix: moatCap object is bit-for-bit identical regardless of the years param (no local recomputation)");
  assert.deepStrictEqual(oeNormal.moatCap, gFloor.moat_cap, "BUG2 fix: OE-DCF's exposed moatCap IS floor.moat_cap, not a re-derived copy");
}

// ── Phase 2.5:capex 激增与护城河 CAP 解耦(回报型判据) ──────────────────────────
{
  // base:6 年高毛利 R&D franchise,capex 平(不翻倍),cash=0 → IC=equity,ROIC 稳定高。
  const mk = (fy: number, oi: number, eq: number, capex: number): ValuationFloorYear => ({
    fiscal_year: fy, revenue: oi / 0.4, operating_margin: 0.4, operating_income: oi, net_income: oi * 0.75,
    effective_tax_rate: 0.15, shareholders_equity: eq, goodwill: 200, intangibles: 100, cash: 0, total_debt: 0,
    net_debt: 0, shares_diluted: 1_000, rd_expense: oi * 0.25, d_and_a: 800, capex, ppe_net: 5_000, working_capital: 1_000,
  });
  // ROIC = 0.85*oi/eq;设成稳定 ~0.30。capex 平(1500 上下,无翻倍)。
  const baseYears: ValuationFloorYear[] = [
    mk(2025, 3_600, 10_200, 1_500), mk(2024, 3_200, 9_100, 1_450), mk(2023, 2_850, 8_100, 1_400),
    mk(2022, 2_550, 7_200, 1_350), mk(2021, 2_250, 6_400, 1_300), mk(2020, 2_000, 5_700, 1_250),
  ];
  const fBase = floorOf(computeValuationFloor({ ticker: "DEC_BASE", years: baseYears }));
  assert.strictEqual(fBase.moat_reading.signal, "franchise", "解耦-base:读 franchise");
  assert.notStrictEqual(fBase.ai_capex_distortion_warning, true, "解耦-base:capex 平,未触发 ai_capex");
  // base 必须 strong-eligible,解耦测试才有意义。若这里读 moderate(epvAvRatio<2),上调 operating_margin
  // 或下调 goodwill+intangibles 直到 franchise+strong(与现有 epvFloor 夹具同款人工校准)。
  assert.strictEqual(fBase.moat_cap.grade, "strong", "解耦-base:稳定高 ROIC franchise → strong/20");

  // surge:仅最新 2 年 capex ×3(4500/1400≈3.2 ≥2)触发 ai_capex;equity/op_income 不变 → ROIC 与 base 逐位同。
  const surgeYears = baseYears.map((y) =>
    y.fiscal_year >= 2024 ? { ...y, capex: 4_500 } : y);
  const fSurge = floorOf(computeValuationFloor({ ticker: "DEC_SURGE", years: surgeYears }));
  assert.strictEqual(fSurge.ai_capex_distortion_warning, true, "解耦-surge:capex 翻倍 → ai_capex 触发(reliable 输入不变)");
  assert.strictEqual(fSurge.moat_cap.grade, "strong", "★解耦:ROIC 稳定时 capex 激增不再降护城河(仍 strong,非 moderate)");
  assert.strictEqual(fSurge.growth_value.gated_to_zero, true, "解耦-surge:GV 归零路径未动(仍 gated)");

  // 地基不变:surge 只该抬中性/乐观上沿,valueFloor(悲观资产底)与 base 逐位相同。
  assert.strictEqual(fSurge.asset_floor.per_share, fBase.asset_floor.per_share, "地基:surge 不改 valueFloor(asset floor per share 不变)");
}

// ── Task 6: conservativeNormalized 连续加权(lift)────────────────────────────
{
  // 上行 + s=1 → 抬到 target
  {
    const r = conservativeNormalizedForTest([120, 60, 40, 30], 120, { s: 1, target: 100 });
    assert.ok(Math.abs(r.value - 100) < 1e-9, `s=1 → target, got ${r.value}`);
    assert.strictEqual(r.capped, false);
  }
  // 上行 + s=0.5 → avg + 0.5×(target−avg)
  {
    const series = [120, 60, 40, 30]; const a = (120 + 60 + 40 + 30) / 4; // 62.5
    const r = conservativeNormalizedForTest(series, 120, { s: 0.5, target: 100 });
    assert.ok(Math.abs(r.value - (a + 0.5 * (100 - a))) < 1e-9, `half lift, got ${r.value}`);
  }
  // 无 lift → 今天行为(上行取 avg)
  {
    const series = [120, 60, 40, 30]; const a = 62.5;
    const r = conservativeNormalizedForTest(series, 120, undefined);
    assert.ok(Math.abs(r.value - a) < 1e-9, "no lift → avg");
  }
  // 下行分支(latest<avg)+ 即便传 lift → 逐字保留 capped(取 latest)
  {
    const r = conservativeNormalizedForTest([30, 80, 100, 90], 30, { s: 1, target: 999 });
    assert.strictEqual(r.value, 30, "down-branch unchanged");
    assert.strictEqual(r.capped, true);
  }
  // 单调性:target≤avg(守卫回退)→ 不降,取 avg
  {
    const series = [70, 60, 40, 30]; const a = 50;
    const r = conservativeNormalizedForTest(series, 70, { s: 1, target: 40 }); // target<avg
    assert.ok(Math.abs(r.value - a) < 1e-9, "target<=avg → avg, never below");
  }
  console.log("Task6 conservativeNormalized lift: OK");
}

// ── 杠杆 → 股权成本溢价(spec Task 2) ───────────────────────────────────────
{
  const mk = (over: Partial<ValuationFloorYear>): ValuationFloorYear => ({
    fiscal_year: 2024, revenue: 10_000, operating_income: 2_000, net_income: 1_000,
    shares_diluted: 1_000, cash: 0, total_debt: 0, d_and_a: 500, shareholders_equity: 5_000,
    ...over,
  });
  const yrs = (over: Partial<ValuationFloorYear>) => [
    mk({ fiscal_year: 2024, ...over }), mk({ fiscal_year: 2023, ...over }), mk({ fiscal_year: 2022, ...over }),
  ];

  // 净现金名:溢价 0,Buffett 灯折现率 = 基线带(逐位不变)
  const netCash = computeValuationFloor({ ticker: "NETCASH", years: yrs({ cash: 20_000, total_debt: 0 }) }) as ValuationFloor;
  assert.strictEqual(netCash.leverage_premium, 0, "净现金 → 溢价 0");
  assert.strictEqual(netCash.buffett_epv.method.discount_rate_low, DISCOUNT_RATE_LOW, "净现金 Buffett 低端 = 基线");
  assert.strictEqual(netCash.buffett_epv.method.discount_rate_high, DISCOUNT_RATE_HIGH, "净现金 Buffett 高端 = 基线");

  // 重杠杆名:溢价 > 0,Buffett 灯折现率 = 基线 + 溢价
  const levered = computeValuationFloor({ ticker: "LEVERED", years: yrs({ cash: 0, total_debt: 40_000 }) }) as ValuationFloor;
  assert.ok((levered.leverage_premium ?? 0) > 0, "重杠杆 → 溢价 > 0");
  assert.strictEqual(
    levered.buffett_epv.method.discount_rate_low, DISCOUNT_RATE_LOW + levered.leverage_premium!,
    "Buffett 低端 = 基线 + 溢价",
  );
  assert.strictEqual(
    levered.buffett_epv.method.discount_rate_high, DISCOUNT_RATE_HIGH + levered.leverage_premium!,
    "Buffett 高端 = 基线 + 溢价",
  );
  // 溢价真的压低了每股值(单调性的端到端证明)
  assert.ok(
    levered.buffett_epv.per_share_high! < netCash.buffett_epv.per_share_high!,
    "重杠杆 Buffett 每股值 < 净现金名",
  );

  // ⚠️ spec D4 回归门:Graham 灯折现率**逐位不变**(WACC 口径,杠杆已由桥承担)
  assert.strictEqual(levered.graham_epv.method.discount_rate_low, DISCOUNT_RATE_LOW, "D4:Graham 低端不动");
  assert.strictEqual(levered.graham_epv.method.discount_rate_high, DISCOUNT_RATE_HIGH, "D4:Graham 高端不动");
  assert.deepStrictEqual(
    levered.provenance.discount_rate_band, [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH],
    "D4:provenance 基线带不动",
  );

  // ⚠️ spec §4.5 硬伤① 回归门:负权益名**不再逃逸**,必须拿到非零溢价
  const negEquity = computeValuationFloor({
    ticker: "NEGEQ",
    years: yrs({ cash: 0, total_debt: 40_000, shareholders_equity: -2_000 }),
  }) as ValuationFloor;
  assert.strictEqual(negEquity.net_debt_to_equity, undefined, "负权益:旧指标仍 undefined(未改)");
  assert.strictEqual(negEquity.high_leverage_warning, false, "负权益:旧 flag 仍逃逸(未改,仅不再驱动惩罚)");
  assert.ok((negEquity.leverage_premium ?? 0) > 0, "硬伤①已修:负权益名拿到非零溢价");
}

// ── Task 2 补丁:leverage 第三分支(数据不可得/owner earnings 非正)不得渲染
// 「净现金或杠杆内档」假话 —— 这句话恰好在最该诚实的人群(重债 + 非正 owner earnings 的困境企业)
// 上最误导。leveragePremium() 的 undefined 分支只在 basis 里说「不可得」,buildBuffettLamp 的
// simplifications 三元必须选中同一分支(见 epvFloor.ts ~:404-409)。
{
  // 重债(total_debt 5000 远超 cash 0)+ 净利连续为负且逐年恶化(latest<avg 触发 audit#2 下行压边,
  // 即便有 s 提升也走不到升档分支)→ normalized owner earnings ≤ 0 → leveragePremium 走「不可得」
  // 分支(leverage=undefined),而不是 netDebt<=0 的「净现金」分支,也不是杠杆内档分支。
  const distressed: ValuationFloorInput = {
    ticker: "DISTRESSED",
    years: [
      year(2025, { revenue: 5_000, operating_margin: -0.10, net_income: -1_000, shareholders_equity: 1_000, cash: 0, total_debt: 5_000, shares_diluted: 1_000 }),
      year(2024, { revenue: 5_200, operating_margin: -0.08, net_income: -900, shareholders_equity: 1_500, cash: 0, total_debt: 5_000, shares_diluted: 1_000 }),
      year(2023, { revenue: 5_400, operating_margin: -0.05, net_income: -700, shareholders_equity: 1_900, cash: 0, total_debt: 5_000, shares_diluted: 1_000 }),
    ],
  };
  const df = floorOf(computeValuationFloor(distressed));
  // 先核实夹具真的踩中 case 3(不可得),不是误踩「净现金」或「杠杆内档」分支。
  assert.strictEqual(df.buffett_epv.assessable, false, "distressed 夹具:owner earnings 非正 → buffett 灯不可估(核验夹具确实够困境)");
  assert.strictEqual(df.net_debt_to_owner_earnings, undefined, "distressed 夹具:leverage=undefined(命中不可得分支,非杠杆内档)");
  assert.strictEqual(df.leverage_premium, 0, "spec §4.2:数据不可得 → 溢价 0,不因缺数据而惩罚");
  const joined = df.buffett_epv.method.simplifications.join(" | ");
  assert.ok(
    !joined.includes("net cash or debt within the no-charge range"),
    "distressed 名(重债+非正 owner earnings)不得渲染「净现金/杠杆内档」假话 —— 这句话在此人群上最误导",
  );
  assert.ok(
    joined.includes("Net debt or owner earnings is unavailable"),
    "distressed 名须用诚实的「数据不可得」披露文案(来自 leveragePremium 的 undefined 分支 basis)",
  );
}

console.log("epvFloor.check.ts: all assertions passed.");
