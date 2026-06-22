/**
 * degradation.check.ts — spec §3 degradation matrix. Each "field absent" scenario must
 * degrade only its own layer and still return a floor (the page must never crash).
 * Run: cd web && npx tsx src/lib/valuation/degradation.check.ts
 */
import assert from "node:assert";
import { computeValuationFloor } from "./epvFloor";
import type { ValuationFloorYear } from "./types";

// Rich, healthy base — every field present.
function base(): ValuationFloorYear[] {
  return [
    { fiscal_year: 2025, revenue: 20_000, operating_margin: 0.40, operating_income: 8_000, net_income: 6_000, effective_tax_rate: 0.15, shareholders_equity: 10_000, goodwill: 1_000, intangibles: 500, cash: 3_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 2_000, d_and_a: 800, capex: 1_800, ppe_net: 6_000, working_capital: 2_000, stock_based_comp: 300 },
    { fiscal_year: 2024, revenue: 17_000, operating_margin: 0.40, operating_income: 6_800, net_income: 5_100, effective_tax_rate: 0.15, shareholders_equity: 9_000, goodwill: 1_000, intangibles: 500, cash: 2_500, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_800, d_and_a: 750, capex: 1_600, ppe_net: 5_500, working_capital: 1_700, stock_based_comp: 280 },
    { fiscal_year: 2023, revenue: 14_500, operating_margin: 0.40, operating_income: 5_800, net_income: 4_350, effective_tax_rate: 0.15, shareholders_equity: 8_000, goodwill: 1_000, intangibles: 500, cash: 2_000, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_600, d_and_a: 700, capex: 1_400, ppe_net: 5_000, working_capital: 1_400, stock_based_comp: 260 },
    { fiscal_year: 2022, revenue: 12_500, operating_margin: 0.40, operating_income: 5_000, net_income: 3_750, effective_tax_rate: 0.15, shareholders_equity: 7_000, goodwill: 1_000, intangibles: 500, cash: 1_800, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_400, d_and_a: 650, capex: 1_200, ppe_net: 4_500, working_capital: 1_200, stock_based_comp: 240 },
    { fiscal_year: 2021, revenue: 11_000, operating_margin: 0.40, operating_income: 4_400, net_income: 3_300, effective_tax_rate: 0.15, shareholders_equity: 6_000, goodwill: 1_000, intangibles: 500, cash: 1_600, total_debt: 0, shares_diluted: 1_000, rd_expense: 1_200, d_and_a: 600, capex: 1_000, ppe_net: 4_000, working_capital: 1_000, stock_based_comp: 220 },
  ];
}

function strip(field: keyof ValuationFloorYear): ValuationFloorYear[] {
  return base().map((y) => ({ ...y, [field]: undefined }));
}

function asFloor(input: ReturnType<typeof base>) {
  const f = computeValuationFloor({ ticker: "DEG", years: input });
  assert.ok(f && "kind" in f && f.kind === "floor", "floor produced (no crash)");
  return f as Extract<ReturnType<typeof computeValuationFloor>, { kind: "floor" }>;
}

// Baseline sanity: everything present → all layers live.
{
  const f = asFloor(base());
  assert.ok(f.graham_epv.assessable && f.buffett_epv.assessable, "base: EPV + OE live");
  assert.ok(f.asset_floor.assessable && f.asset_floor.capitalized_rd != null, "base: AV with R&D");
  assert.ok(f.growth_value.assessable && !f.growth_value.gated_to_zero, "base: GV live");
}

// capex absent → maintenance capex degrades → EPV/OE fall back to v1 parity; AV/GV survive or degrade, no crash.
{
  const f = asFloor(strip("capex"));
  assert.ok(f.graham_epv.assessable, "no capex: EPV still assessable (v1 fallback)");
  assert.ok(f.graham_epv.method.simplifications.some((s) => s.toLowerCase().includes("degraded") || s.toLowerCase().includes("maintenance capex = d&a")), "no capex: EPV notes the degradation");
}

// rd_expense absent → AV degrades to tangible book (capitalized_rd undefined), no crash.
{
  const f = asFloor(strip("rd_expense"));
  assert.ok(f.asset_floor.assessable, "no R&D: AV still on tangible book");
  assert.strictEqual(f.asset_floor.capitalized_rd, undefined, "no R&D: no capitalized R&D");
}

// working_capital absent → GV still computes (ΔNWC term drops to 0; franchise gate + ROIIC
// still compute), no crash. Base is a 40%-margin franchise grower so GV stays assessable,
// NOT gated_to_zero.
{
  const f = asFloor(strip("working_capital"));
  assert.strictEqual(f.growth_value.assessable, true, "no WC: GV remains assessable (ΔNWC drops to 0, franchise still valid)");
  assert.strictEqual(f.growth_value.gated_to_zero, false, "no WC: 40%-margin franchise is NOT gated to zero");
}

// ppe_net absent → maintenance capex loses PP&E/life and Greenwald-sales methods; only D&A
// proxy survives → single method → confidence "degraded" → EPV lamp emits a degraded note.
{
  const f = asFloor(strip("ppe_net"));
  assert.ok(f.graham_epv.assessable, "no PP&E: EPV survives on D&A-proxy maintenance");
  assert.ok(
    f.graham_epv.method.simplifications.some((s) => s.toLowerCase().includes("degraded")),
    "no PP&E: EPV notes degraded maintenance-capex confidence",
  );
}

// d_and_a absent → EPV/OE degrade to v1 parity; floor intact.
{
  const f = asFloor(strip("d_and_a"));
  assert.ok(f.graham_epv.assessable && f.buffett_epv.assessable, "no D&A: EPV/OE survive via v1 fallback");
  assert.ok(f.buffett_epv.sbc_to_oe_pct != null, "no D&A: SBC disclosure still computed");
}

// operating_income absent (bank-like) → single-lamp; GV not assessable; floor intact.
{
  const noOpInc = base().map((y) => ({ ...y, operating_income: undefined, operating_margin: undefined }));
  const f = asFloor(noOpInc);
  assert.ok(f.buffett_epv.assessable, "bank-like: owner-earnings lamp survives");
  assert.strictEqual(f.graham_epv.assessable, false, "bank-like: NOPAT lamp not applicable");
  assert.strictEqual(f.growth_value.assessable, false, "bank-like: GV not assessable (no NOPAT)");
}

console.log("degradation.check.ts: OK");
