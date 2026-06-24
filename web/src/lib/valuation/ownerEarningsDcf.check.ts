import assert from "node:assert";
import type { ValuationFloor, ValuationFloorYear, LatestPrice } from "./types";
import {
  deriveOeDcf,
  pickLatestFredPoint,
  GROWTH_CAP,
  R_STRICT,
  reconcileMethods,
} from "./ownerEarningsDcf";
import type { OeDcfAssessment } from "./types";

// ── fixtures ────────────────────────────────────────────────────────────────
function lamp(oe: number, shares: number, yearsUsed: number[]) {
  return {
    label: "Buffett owner-earnings value",
    assessable: true,
    normalized_earnings: oe,
    equity_value_low: oe / 0.1,
    equity_value_high: oe / 0.08,
    per_share_low: oe / 0.1 / shares,
    per_share_high: oe / 0.08 / shares,
    method: { years_used: yearsUsed } as ValuationFloor["buffett_epv"]["method"],
  } as ValuationFloor["buffett_epv"];
}
function floorWith(buffett: ValuationFloor["buffett_epv"]): ValuationFloor {
  // Only buffett_epv is read by deriveOeDcf; other fields are stubs.
  return { kind: "floor", buffett_epv: buffett } as unknown as ValuationFloor;
}
function yr(fy: number, net_income: number): ValuationFloorYear {
  return { fiscal_year: fy, net_income };
}
const price = (close: number): LatestPrice => ({ close, date: "2026-06-20", currency: "USD" });

// ── 1. pickLatestFredPoint skips nulls, takes most recent ────────────────────
assert.deepStrictEqual(
  pickLatestFredPoint([
    { date: "2026-06-17", value: 4.2 },
    { date: "2026-06-18", value: null },
  ]),
  { value: 4.2, date: "2026-06-17" },
);
assert.strictEqual(pickLatestFredPoint([{ date: "x", value: null }]), null);

// ── 2. growth: rising history → g1 = clamped CAGR, faded, three-stage ────────
{
  // net income 100→133.1 over FY2021→2024 (3 periods) = 10% CAGR exactly.
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4.25, date: "2026-06-19" }, price(120));
  assert.ok(r.assessable, "rising history assessable");
  assert.ok(Math.abs(r.growth_g1! - 0.1) < 1e-9, `g1≈0.10 got ${r.growth_g1}`);
  assert.ok(r.growth_g1! <= GROWTH_CAP, "g1 capped");
  // three ordered tiers
  assert.ok(r.per_share_low! < r.tiers!.neutral.per_share, "pess < neutral");
  assert.ok(r.tiers!.neutral.per_share < r.per_share_high!, "neutral < opt");
  // pessimistic uses ½g1 and strict discount
  assert.ok(Math.abs(r.tiers!.pessimistic.growth_stage1 - 0.05) < 1e-9, "pess g = ½g1");
  assert.strictEqual(r.tiers!.pessimistic.discount_rate, R_STRICT, "pess r = strict");
}

// ── 3. g1 capped at 10% when CAGR exceeds cap ────────────────────────────────
{
  const years = [yr(2024, 400), yr(2023, 200), yr(2022, 100)]; // ~100% CAGR
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4, date: "d" }, null);
  assert.strictEqual(r.growth_g1, GROWTH_CAP, "g1 hard-capped at 0.10");
}

// ── 4. declining history → g1 = 0 ────────────────────────────────────────────
{
  const years = [yr(2024, 80), yr(2023, 90), yr(2022, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4, date: "d" }, null);
  assert.strictEqual(r.growth_g1, 0, "declining → g1 0");
  assert.strictEqual(r.declined, true, "declined flag");
}

// ── 5. discount band from DGS10 (normal, ordered) ────────────────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4.25, date: "2026-06-19" }, null);
  assert.ok(Math.abs(r.discount!.r_low - (0.0425 + 0.025)) < 1e-9, "r_low = DGS10/100 + 0.025");
  assert.strictEqual(r.discount!.r_high, 0.1, "r_high = strict 0.10");
  assert.strictEqual(r.discount!.anchored, true, "anchored");
  assert.strictEqual(r.discount!.inverted, false, "not inverted");
  assert.strictEqual(r.discount!.dgs10_date, "2026-06-19", "as-of stamped");
}

// ── 6. inversion: DGS10 ≥ 7.5% → [min,max] + flag ────────────────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 8, date: "d" }, null);
  assert.strictEqual(r.discount!.inverted, true, "inverted flag");
  assert.ok(r.discount!.r_low <= r.discount!.r_high, "r_low ≤ r_high after min/max");
}

// ── 7. DGS10 missing → fallback band, not anchored ───────────────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], null, null);
  assert.strictEqual(r.discount!.anchored, false, "fallback not anchored");
  assert.deepStrictEqual([r.discount!.r_low, r.discount!.r_high], [0.08, 0.1], "fallback 8–10%");
}

// ── 8. zero-growth terminal share + >70% flag ────────────────────────────────
{
  // flat earnings, no growth → all value is terminal-ish; terminal_share computed.
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, null);
  assert.ok(r.terminal_share_pct! > 0 && r.terminal_share_pct! < 1, "terminal share in (0,1)");
  assert.strictEqual(r.terminal_dependency_flag, r.terminal_share_pct! > 0.7, "flag matches threshold");
}

// ── 9. no bridge: equity value uses OE directly, per share = equity/shares ────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, null);
  // neutral per-share = neutral equity / 100 shares
  assert.ok(Math.abs(r.tiers!.neutral.per_share - r.tiers!.neutral.equity_value / 100) < 1e-6, "per share = equity/shares");
  assert.ok(/no .*bridge/i.test(r.no_bridge_note), "no-bridge note present");
}

// ── 10. diagnostics: OE yield vs DGS10, quick-check deviation ─────────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, price(50));
  // OE per share = 1000/100 = 10; yield = 10/50 = 0.20
  assert.ok(Math.abs(r.diagnostics!.oe_yield! - 0.2) < 1e-9, "oe yield 20%");
  assert.ok(typeof r.diagnostics!.oe_yield_flag === "boolean", "oe yield flag set");
  assert.ok(typeof r.diagnostics!.quick_check_flag === "boolean", "quick check flag set");
}

// ── 11. degradation: OE not assessable → no output ───────────────────────────
{
  const dead = { label: "x", assessable: false, method: { years_used: [] } } as unknown as ValuationFloor["buffett_epv"];
  const r = deriveOeDcf(floorWith(dead), [yr(2024, 100)], { value: 4, date: "d" }, null);
  assert.strictEqual(r.assessable, false, "not assessable");
  assert.ok(r.not_assessable_reason, "reason present");
  assert.strictEqual(r.tiers, undefined, "no tiers");
}

// ── 12. compliance: emitted strings carry no advice/target tokens ────────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 110), yr(2023, 100)], { value: 4, date: "d" }, price(50));
  const blob = JSON.stringify(r).toLowerCase();
  for (const bad of ["buy", "sell", " hold", "target price", "rating", "recommend"]) {
    assert.ok(!blob.includes(bad), `no "${bad}" token in OE-DCF output`);
  }
}

function oeStub(low: number, high: number): OeDcfAssessment {
  return {
    assessable: true,
    per_share_low: low,
    per_share_high: high,
    tiers: {
      pessimistic: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: low },
      neutral: { growth_stage1: 0, discount_rate: 0.09, equity_value: 0, per_share: (low + high) / 2 },
      optimistic: { growth_stage1: 0, discount_rate: 0.08, equity_value: 0, per_share: high },
    },
    no_bridge_note: "x",
  } as OeDcfAssessment;
}

// price below both ranges → both show margin of safety
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(50));
  assert.strictEqual(m.consistency, "both_margin_of_safety");
  assert.deepStrictEqual(m.greenwald_range, [100, 140]);
  assert.deepStrictEqual(m.buffett_range, [90, 150]);
}
// price within → within value range
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(110));
  assert.strictEqual(m.consistency, "within_value_range");
}
// price above both → above both values
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(200));
  assert.strictEqual(m.consistency, "above_both_values");
}
// divergence > 20% flagged (gw neutral 120 vs bf neutral 50 → mean 85, |70|/85 ≈ 0.82)
{
  const m = reconcileMethods({ pessimistic: 40, neutral: 120, optimistic: 200 }, oeStub(10, 90), price(60));
  assert.ok(m.divergence_pct! > 0.2, "divergence computed");
  assert.strictEqual(m.divergence_flag, true, "divergence flagged");
}
// degradation: missing Greenwald → not comparable
{
  const m = reconcileMethods(undefined, oeStub(90, 150), price(110));
  assert.strictEqual(m.comparable, false);
  assert.ok(m.reason_if_not, "reason present");
  assert.strictEqual(m.consistency, undefined);
}
// degradation: missing OE-DCF → not comparable
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, undefined, price(110));
  assert.strictEqual(m.comparable, false);
}
// no price → comparable for divergence, but no consistency reading
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), null);
  assert.strictEqual(m.comparable, true);
  assert.strictEqual(m.consistency, undefined);
  assert.ok(m.divergence_pct != null, "divergence still computed without price");
}
// compliance on reconcile output
{
  const m = reconcileMethods({ pessimistic: 100, neutral: 120, optimistic: 140 }, oeStub(90, 150), price(110));
  const blob = JSON.stringify(m).toLowerCase();
  for (const bad of ["buy", "sell", " hold", "target price", "rating", "recommend"]) {
    assert.ok(!blob.includes(bad), `no "${bad}" token in reconcile output`);
  }
}

console.log("ownerEarningsDcf.check.ts: deriveOeDcf + reconcileMethods OK");
