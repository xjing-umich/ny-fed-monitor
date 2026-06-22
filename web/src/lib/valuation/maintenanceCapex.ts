import type { MaintCapex, ValuationFloorYear } from "./types";

/** Neutral useful life for the PP&E/life method (Greenwald band 7–15y; sensitivity-ready). */
export const PPE_USEFUL_LIFE_YEARS = 10;
/** Method divergence above this fraction of the median → confidence "degraded". */
export const MAINT_DIVERGENCE_DEGRADE = 0.5;
/** AI-hog: capex_t / capex_{t-2} at or above this ratio triggers the distortion rule. */
export const AI_CAPEX_DOUBLING_RATIO = 2;
/** AI-hog: maintenance capex floored at this fraction of current capex. */
export const AI_CAPEX_MAINT_FLOOR_FRACTION = 0.5;
/** Window for the median(PP&E/Sales) ratio used by the sales method. */
export const MAINT_CAPEX_WINDOW = 5;

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Maintenance capex — spec §1.1. Median of available methods, AI-hog floor applied.
 * `years` most-recent-first. Maintenance capex may legitimately equal or exceed reported capex (steady-state) or D&A (underinvestment); the median-of-methods plus the AI-hog floor prevent naively treating growth-era capex as maintenance.
 */
export function maintenanceCapex(years: ValuationFloorYear[]): MaintCapex {
  const notes: string[] = [];
  const sorted = [...years].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const latest = sorted[0];
  const capexT = latest?.capex;

  if (capexT == null) {
    return {
      assessable: false,
      not_assessable_reason: "Current-year capex is unavailable, so maintenance capex cannot be estimated.",
      methods: {}, confidence: "degraded", ai_capex_distortion_warning: false,
      notes: ["No capex on the latest year."],
    };
  }

  // Method 1 — D&A proxy (current period).
  const daProxy = latest.d_and_a != null ? latest.d_and_a : undefined;

  // Method 2 — Greenwald sales method: maintenance = total capex − growth capex,
  // growth capex = median₅(PP&E/Revenue) × ΔRevenue. (Audit fix #1: the median×ΔSales
  // term is GROWTH capex; maintenance is capex minus it.)
  let salesMethod: number | undefined;
  const ratios: number[] = [];
  for (const y of sorted.slice(0, MAINT_CAPEX_WINDOW)) {
    if (y.ppe_net != null && y.revenue != null && y.revenue !== 0) ratios.push(y.ppe_net / y.revenue);
  }
  const prior = sorted[1];
  if (ratios.length >= 1 && latest.revenue != null && prior?.revenue != null) {
    const deltaRev = latest.revenue - prior.revenue;
    const growthCapex = median(ratios) * deltaRev;
    salesMethod = capexT - growthCapex; // maintenance = total − growth
  }

  // Method 3 — PP&E / useful life.
  const ppeLife = latest.ppe_net != null ? latest.ppe_net / PPE_USEFUL_LIFE_YEARS : undefined;

  const methods = { da_proxy: daProxy, greenwald_sales: salesMethod, ppe_life: ppeLife };
  const present = [daProxy, salesMethod, ppeLife].filter((v): v is number => v != null && Number.isFinite(v) && v > 0);

  if (present.length === 0) {
    return {
      assessable: false,
      not_assessable_reason: "No maintenance-capex method could be computed (need D&A, or PP&E, or a revenue series).",
      methods, confidence: "degraded", ai_capex_distortion_warning: false,
      notes: ["Capex present but no usable method inputs (D&A / PP&E / revenue)."],
    };
  }

  let value = median(present);

  // Method divergence.
  let divergencePct: number | undefined;
  let confidence: "ok" | "degraded" = "ok";
  if (present.length >= 2) {
    const lo = Math.min(...present);
    const hi = Math.max(...present);
    const med = median(present);
    divergencePct = med > 0 ? (hi - lo) / med : undefined;
    if (divergencePct != null && divergencePct > MAINT_DIVERGENCE_DEGRADE) {
      confidence = "degraded";
      notes.push(`Maintenance-capex methods diverge by ${(divergencePct * 100).toFixed(0)}% (> 50%); estimate is degraded.`);
    }
  } else {
    confidence = "degraded";
    notes.push("Only one maintenance-capex method available; estimate is degraded.");
  }

  // AI-hog rule: capex doubling over two years → floor maintenance at 50% of current capex.
  let aiWarning = false;
  const capexTminus2 = sorted[2]?.capex;
  if (capexTminus2 != null && capexTminus2 > 0 && capexT / capexTminus2 >= AI_CAPEX_DOUBLING_RATIO) {
    aiWarning = true;
    const floor = capexT * AI_CAPEX_MAINT_FLOOR_FRACTION;
    if (value < floor) {
      value = floor;
      notes.push(`Capex doubled within two years (AI-hog rule): maintenance capex floored at ${(AI_CAPEX_MAINT_FLOOR_FRACTION * 100).toFixed(0)}% of current capex.`);
    } else {
      notes.push("Capex doubled within two years (AI-hog rule): flagged; estimate already above the 50% floor.");
    }
  }

  return {
    assessable: true,
    value,
    methods,
    confidence,
    divergence_pct: divergencePct,
    ai_capex_distortion_warning: aiWarning,
    notes,
  };
}
