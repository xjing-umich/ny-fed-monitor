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
import type { ValuationFloorInput, ValuationFloorYear } from "./types";
import { computeValuationFloor, DISCOUNT_RATE_HIGH, DISCOUNT_RATE_LOW } from "./epvFloor";

function year(fy: number, o: Partial<ValuationFloorYear>): ValuationFloorYear {
  return { fiscal_year: fy, ...o };
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

const floor = computeValuationFloor(compounder)!;
assert.ok(floor, "compounder produces a floor");
assert.strictEqual(floor.provenance.years_used.length, 5, "5 years used");
assert.deepStrictEqual(floor.provenance.discount_rate_band, [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH], "band recorded");
assert.strictEqual(floor.provenance.share_count_basis, "diluted", "diluted basis");

// ── Graham NOPAT lamp + bridge, at REAL 15% tax ──────────────────────────────
// avg margin 0.43 × rev 10000 × (1−0.15) = 3_655
const g = floor.graham_epv;
assert.ok(g.assessable, "graham assessable");
assert.ok(Math.abs(g.normalized_earnings! - 3_655) < 1, `nopat≈3655 (15% tax) got ${g.normalized_earnings}`);
// equity_high uses LOW rate 0.08: 3655/0.08 + cash2000 − debt1000 = 46_687.5
assert.ok(Math.abs(g.equity_value_high! - 46_687.5) < 1, `graham eq_high≈46687.5 got ${g.equity_value_high}`);
// equity_low uses HIGH rate 0.10: 3655/0.10 + 1000 = 37_550
assert.ok(Math.abs(g.equity_value_low! - 37_550) < 1, `graham eq_low≈37550 got ${g.equity_value_low}`);
assert.ok(Math.abs(g.per_share_high! - 46.6875) < 0.01, `graham ps_high≈46.69 got ${g.per_share_high}`);
assert.ok(g.method.bridge.includes("cash") && g.method.bridge.includes("debt"), "graham bridges +cash −debt");
assert.ok(/unlevered/i.test(g.method.leverage_treatment), "graham unlevered");

// ── Buffett owner-earnings lamp, NO bridge ───────────────────────────────────
// avg net income 2_400; eq_high 2400/0.08 = 30_000 (no bridge), eq_low 24_000
const b = floor.buffett_epv;
assert.ok(b.assessable, "buffett assessable");
assert.ok(Math.abs(b.equity_value_high! - 30_000) < 1, `buffett eq_high≈30000 (no bridge) got ${b.equity_value_high}`);
assert.ok(Math.abs(b.equity_value_low! - 24_000) < 1, `buffett eq_low≈24000 got ${b.equity_value_low}`);
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
const lf = computeValuationFloor(levered)!;
// avg NI 950 → buffett eq_high 950/0.08 = 11_875 (debt NOT subtracted)
assert.ok(Math.abs(lf.buffett_epv.equity_value_high! - 11_875) < 1, `levered buffett eq_high≈11875 got ${lf.buffett_epv.equity_value_high}`);
// graham bridges: nopat 0.2×10000×(1−0.21)=1580; /0.08 +500 −8000 = 12_250
assert.ok(Math.abs(lf.graham_epv.equity_value_high! - 12_250) < 1, `levered graham eq_high≈12250 (bridged) got ${lf.graham_epv.equity_value_high}`);
assert.strictEqual(lf.high_leverage_warning, true, "levered trips high-leverage warning");
assert.ok((lf.net_debt_to_equity ?? 0) > 1, "net debt/equity > 1 recorded");
assert.strictEqual(floor.high_leverage_warning, false, "net-cash compounder no warning");

// ── moat franchise + negative-earnings degradation ───────────────────────────
assert.strictEqual(floor.moat_reading.signal, "franchise", `compounder franchise got ${floor.moat_reading.signal}`);
assert.ok(/directional/i.test(floor.moat_reading.basis_note) && /reproduction value/i.test(floor.moat_reading.basis_note), "moat basis note directional + reproduction value");
const loss: ValuationFloorInput = {
  ticker: "LOSS",
  years: [
    year(2025, { revenue: 10_000, operating_margin: -0.1, net_income: -800, shareholders_equity: 4_000, goodwill: 100, intangibles: 100, cash: 500, total_debt: 0, net_debt: -500, shares_diluted: 1_000 }),
    year(2024, { revenue: 9_000, operating_margin: -0.05, net_income: -400, shareholders_equity: 4_200, goodwill: 100, intangibles: 100, cash: 500, total_debt: 0, net_debt: -500, shares_diluted: 1_000 }),
    year(2023, { revenue: 8_000, operating_margin: -0.08, net_income: -600, shareholders_equity: 4_400, goodwill: 100, intangibles: 100, cash: 500, total_debt: 0, net_debt: -500, shares_diluted: 1_000 }),
  ],
};
const lm = computeValuationFloor(loss)!;
assert.strictEqual(lm.graham_epv.assessable, false, "neg NOPAT → graham not assessable");
assert.strictEqual(lm.buffett_epv.assessable, false, "neg owner earnings → buffett not assessable");
assert.strictEqual(lm.asset_floor.assessable, true, "asset floor still emitted on losses");
assert.strictEqual(lm.moat_reading.signal, "value_destruction", "losses → value destruction");

// ── real averaged effective tax rate: cap / floor / fallback ─────────────────
assert.ok(Math.abs(floor.provenance.normalized_tax_rate - 0.15) < 1e-9, `prov tax 0.15 got ${floor.provenance.normalized_tax_rate}`);
assert.ok(/effective/i.test(floor.provenance.normalized_tax_rate_basis), "tax basis says effective");
const highTax = computeValuationFloor({ ticker: "HI", years: compounder.years.map((y) => ({ ...y, effective_tax_rate: 0.3 })) })!;
assert.ok(Math.abs(highTax.provenance.normalized_tax_rate - 0.21) < 1e-9, "eff tax capped at 21%");
const negTax = computeValuationFloor({ ticker: "NEG", years: compounder.years.map((y) => ({ ...y, effective_tax_rate: -0.1 })) })!;
assert.ok(Math.abs(negTax.provenance.normalized_tax_rate - 0) < 1e-9, "eff tax floored at 0");
const noTax = computeValuationFloor({ ticker: "NOTAX", years: compounder.years.map(({ effective_tax_rate, ...rest }) => rest) })!;
assert.ok(Math.abs(noTax.provenance.normalized_tax_rate - 0.21) < 1e-9, "missing tax → fallback 0.21");
assert.ok(/fallback|statutory/i.test(noTax.provenance.normalized_tax_rate_basis), "fallback basis labeled");

// ── real tangible book value + fallbacks ─────────────────────────────────────
// compounder latest: equity 5000 − goodwill 500 − intangibles 300 = 4_200 → /1000 = 4.2
const af = floor.asset_floor;
assert.ok(af.assessable, "asset floor assessable");
assert.strictEqual(af.intangibles_separated, true, "intangibles separated when present");
assert.ok(Math.abs(af.per_share! - 4.2) < 1e-9, `tangible per share 4.2 got ${af.per_share}`);
assert.ok(/tangible/i.test(af.basis), "basis says tangible");
const noIntang = computeValuationFloor({ ticker: "NOINT", years: compounder.years.map(({ goodwill, intangibles, ...rest }) => rest) })!;
assert.strictEqual(noIntang.asset_floor.intangibles_separated, false, "no separation when both missing");
assert.ok(Math.abs(noIntang.asset_floor.per_share! - 5.0) < 1e-9, `total-book fallback 5.0 got ${noIntang.asset_floor.per_share}`);
assert.ok(/intangibles not separated|total book/i.test(noIntang.asset_floor.basis), "fallback basis labeled");
const negTangible = computeValuationFloor({ ticker: "NEGT", years: compounder.years.map((y) => ({ ...y, goodwill: 4_900, intangibles: 300 })) })!;
assert.strictEqual(negTangible.asset_floor.assessable, false, "negative tangible book → not assessable");
assert.strictEqual(negTangible.asset_floor.per_share, undefined, "no negative per-share floor");

console.log("epvFloor.check.ts: all assertions passed.");
