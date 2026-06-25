/**
 * maintenanceCapex.check.ts — spec §1.1 four-method median + AI-hog rule.
 * Run: cd web && npx tsx src/lib/valuation/maintenanceCapex.check.ts
 */
import assert from "node:assert";
import { maintenanceCapex } from "./maintenanceCapex";
import type { ValuationFloorYear } from "./types";

const approx = (a: number, b: number, tol = 1e-6, msg = "") =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} (got ${a}, want ${b})`);

// Steady-state company: capex≈D&A, flat-ish revenue. All three methods ~agree.
const steady: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 10_000, capex: 1_000, d_and_a: 1_000, ppe_net: 10_000 },
  { fiscal_year: 2024, revenue: 9_800, capex: 980, d_and_a: 980, ppe_net: 9_900 },
  { fiscal_year: 2023, revenue: 9_700, capex: 970, d_and_a: 970, ppe_net: 9_800 },
  { fiscal_year: 2022, revenue: 9_600, capex: 960, d_and_a: 960, ppe_net: 9_700 },
  { fiscal_year: 2021, revenue: 9_500, capex: 950, d_and_a: 950, ppe_net: 9_600 },
];
const s = maintenanceCapex(steady);
assert.ok(s.assessable, "steady is assessable");
// D&A proxy = 1000; PP&E/life = 10000/10 = 1000; sales method = 1000 - median(ppe/rev)×ΔRev.
// median(ppe/rev) ≈ 1.0, ΔRev = 200 → growth capex ≈ 200 → sales maint ≈ 800. Median of {1000,800,1000} = 1000.
approx(s.methods.da_proxy!, 1_000, 1e-6, "D&A proxy");
approx(s.methods.ppe_life!, 1_000, 1e-6, "PP&E/life");
approx(s.value!, 1_000, 1e-6, "median maintenance capex");
assert.strictEqual(s.ai_capex_distortion_warning, false, "no AI distortion in steady state");

// Sales method = total capex − growth capex (NOT median(ppe/sales)×ΔSales itself). Audit fix #1.
// Construct: ppe/rev = 1.0 everywhere, ΔRev = 500, capex = 1500 → growth capex 500 → sales maint 1000.
const salesCase: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 10_500, capex: 1_500, d_and_a: 900, ppe_net: 10_500 },
  { fiscal_year: 2024, revenue: 10_000, capex: 1_400, d_and_a: 900, ppe_net: 10_000 },
  { fiscal_year: 2023, revenue: 9_500, capex: 1_300, d_and_a: 900, ppe_net: 9_500 },
];
const sc = maintenanceCapex(salesCase);
approx(sc.methods.greenwald_sales!, 1_000, 1e-6, "sales method = capex − growth capex");

// AI-hog: capex_t / capex_{t-2} ≥ 2 → warning fires, but the floor is capped at the
// D&A sustaining proxy (not 50% of spiked capex) so a growth-capex ramp can't be
// mistaken for maintenance and drive owner earnings negative.
const aiHog: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 20_000, capex: 8_000, d_and_a: 2_000, ppe_net: 18_000 },
  { fiscal_year: 2024, revenue: 18_000, capex: 5_000, d_and_a: 1_900, ppe_net: 12_000 },
  { fiscal_year: 2023, revenue: 16_000, capex: 3_500, d_and_a: 1_800, ppe_net: 8_000 },
];
const ai = maintenanceCapex(aiHog);
assert.strictEqual(ai.ai_capex_distortion_warning, true, "AI distortion fires (8000/3500 ≥ 2)");
assert.ok(ai.value! <= 2_000, "maintenance capped at the D&A sustaining proxy, not 50% of spiked capex");

// Extreme ramp (capex ≫ D&A): floor capped at D&A, so the median (asset-based) stands
// and maintenance does NOT balloon to 50% of capex (the ORCL failure mode).
const extremeRamp: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 67_000, capex: 55_000, d_and_a: 7_600, ppe_net: 100_000 },
  { fiscal_year: 2024, revenue: 57_000, capex: 21_000, d_and_a: 3_900, ppe_net: 43_000 },
  { fiscal_year: 2023, revenue: 53_000, capex: 6_900, d_and_a: 3_100, ppe_net: 21_000 },
];
const er = maintenanceCapex(extremeRamp);
assert.strictEqual(er.ai_capex_distortion_warning, true, "extreme ramp flags AI distortion");
assert.ok(er.value! < 55_000 * 0.5, `maintenance ($${er.value}) far below 50% of capex ($27.5k)`);
assert.ok(er.value! <= 10_000, "maintenance stays at the asset-based level (~PP&E/life), not the spiked-capex floor");

// Divergence > 50% → degraded confidence.
const divergent: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 10_000, capex: 3_000, d_and_a: 500, ppe_net: 20_000 },
  { fiscal_year: 2024, revenue: 8_000, capex: 1_000, d_and_a: 500, ppe_net: 15_000 },
  { fiscal_year: 2023, revenue: 7_000, capex: 1_000, d_and_a: 500, ppe_net: 12_000 },
];
const dv = maintenanceCapex(divergent);
assert.strictEqual(dv.confidence, "degraded", "wide method divergence → degraded");

// Degradation: no capex anywhere → not assessable, no crash.
const noCapex: ValuationFloorYear[] = [
  { fiscal_year: 2025, revenue: 10_000, d_and_a: 1_000, ppe_net: 10_000 },
  { fiscal_year: 2024, revenue: 9_000, d_and_a: 900, ppe_net: 9_000 },
];
const nc = maintenanceCapex(noCapex);
assert.strictEqual(nc.assessable, false, "no capex → not assessable");
assert.ok(nc.not_assessable_reason && nc.not_assessable_reason.length > 0, "degradation carries a reason");

// Only D&A available (no ppe, no revenue series) → value = D&A proxy, ok-ish single method.
const onlyDa: ValuationFloorYear[] = [
  { fiscal_year: 2025, capex: 1_000, d_and_a: 1_100 },
  { fiscal_year: 2024, capex: 900, d_and_a: 1_000 },
];
const od = maintenanceCapex(onlyDa);
assert.ok(od.assessable, "single-method (D&A proxy) still assessable");
approx(od.value!, 1_100, 1e-6, "single method → D&A proxy value");

console.log("maintenanceCapex.check.ts: OK");
