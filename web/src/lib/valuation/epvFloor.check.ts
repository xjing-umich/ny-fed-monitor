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
import { computeValuationFloor, DISCOUNT_RATE_HIGH, DISCOUNT_RATE_LOW } from "./epvFloor";
import { maintenanceCapex } from "./maintenanceCapex";

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
// avg net income 2_400; eq_high 2400/r_low (no bridge), eq_low 2400/r_high
const b = floor.buffett_epv;
assert.ok(b.assessable, "buffett assessable");
assert.ok(Math.abs(b.equity_value_high! - 2_400 / DISCOUNT_RATE_LOW) < 1, `buffett eq_high (no bridge) got ${b.equity_value_high}`);
assert.ok(Math.abs(b.equity_value_low! - 2_400 / DISCOUNT_RATE_HIGH) < 1, `buffett eq_low got ${b.equity_value_low}`);
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
// avg NI 950 → buffett eq_high 950/r_low (debt NOT subtracted)
assert.ok(Math.abs(lf.buffett_epv.equity_value_high! - 950 / DISCOUNT_RATE_LOW) < 1, `levered buffett eq_high got ${lf.buffett_epv.equity_value_high}`);
// graham bridges: nopat 0.2×10000×(1−0.21)=1580; /r_low +500 −8000
assert.ok(Math.abs(lf.graham_epv.equity_value_high! - (1_580 / DISCOUNT_RATE_LOW + 500 - 8_000)) < 1, `levered graham eq_high (bridged) got ${lf.graham_epv.equity_value_high}`);
assert.strictEqual(lf.high_leverage_warning, true, "levered trips high-leverage warning");
assert.ok((lf.net_debt_to_equity ?? 0) > 1, "net debt/equity > 1 recorded");
assert.strictEqual(floor.high_leverage_warning, false, "net-cash compounder no warning");

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
// avg NI 2800 → eq_high 2800/r_low (no bridge), per share /1000
const finHigh = 2_800 / DISCOUNT_RATE_LOW;
assert.ok(Math.abs(fin.buffett_epv.equity_value_high! - finHigh) < 1, `financial buffett eq_high≈${finHigh.toFixed(0)} got ${fin.buffett_epv.equity_value_high}`);
assert.ok(Math.abs(fin.buffett_epv.per_share_high! - finHigh / 1_000) < 1e-9, `financial buffett ps_high got ${fin.buffett_epv.per_share_high}`);
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
  const years = [
    { fiscal_year: 2025, revenue: 10_000, operating_margin: 0.30, net_income: 2_000, effective_tax_rate: 0.20, shareholders_equity: 5_000, cash: 500, total_debt: 0, shares_diluted: 1_000, capex: 1_500, d_and_a: 1_000, ppe_net: 9_000, stock_based_comp: 200, working_capital: 1_000 },
    { fiscal_year: 2024, revenue: 9_500, operating_margin: 0.30, net_income: 1_800, effective_tax_rate: 0.20, shareholders_equity: 4_800, cash: 450, total_debt: 0, shares_diluted: 1_000, capex: 1_400, d_and_a: 950, ppe_net: 8_500, stock_based_comp: 180, working_capital: 800 },
    { fiscal_year: 2023, revenue: 9_000, operating_margin: 0.30, net_income: 1_600, effective_tax_rate: 0.20, shareholders_equity: 4_600, cash: 400, total_debt: 0, shares_diluted: 1_000, capex: 1_300, d_and_a: 900, ppe_net: 8_000, stock_based_comp: 160, working_capital: 600 },
  ];
  const floor = computeValuationFloor({ ticker: "OE", years });
  assert.ok(floor && "kind" in floor && floor.kind === "floor");
  if (floor && "kind" in floor && floor.kind === "floor") {
    const b = floor.buffett_epv;
    assert.ok(b.assessable, "buffett lamp assessable");
    const avgNi = (2_000 + 1_800 + 1_600) / 3;
    const avgDa = (1_000 + 950 + 900) / 3;
    const mc = maintenanceCapex(years as any).value!;
    const oe = avgNi + avgDa - mc; // NO ΔNWC term (audit fix #3)
    assert.ok(Math.abs(b.normalized_earnings! - oe) < 1e-6, "owner earnings = net income + D&A − maintenance capex, no ΔNWC");
    // SBC is NOT added back (audit fix #6) but disclosed.
    assert.ok(b.sbc_to_oe_pct != null && b.sbc_to_oe_pct > 0, "SBC/OE disclosed");
    const avgSbc = (200 + 180 + 160) / 3;
    assert.ok(Math.abs(b.sbc_to_oe_pct! - avgSbc / oe) < 1e-6, "SBC/OE% = avg SBC / owner earnings");
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

console.log("epvFloor.check.ts: all assertions passed.");
