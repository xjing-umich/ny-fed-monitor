import type { GrowthScenarioSet, GrowthValue, MoatSignal, ValuationFloorYear } from "./types";

export const GV_WINDOW = 5;                  // years in the ROIIC window
export const ROIIC_ENDPOINT_LAG = 2;         // exclude the last N years' not-yet-matured growth investment (audit fix #4)
export const DURATION_STRONG = 10;           // strong franchise (EPV/AV ≥ MOAT_STRONG_MULTIPLE)
export const DURATION_MODERATE = 8;          // moderate franchise
export const DURATION_PESSIMISTIC_DELTA = 2; // pessimistic scenario shortens duration by this many years
export const ROIIC_SENSITIVITY = 0.25;       // ±25% band on ROIIC for the scenarios (heuristic, disclosed)
export const MOAT_STRONG_MULTIPLE = 2.0;     // EPV/AV at/above this → strong franchise
// audit #3: 与 EPV/OE-DCF 提高的股权成本保持一致(各 +1%),增长溢价层不比基础便宜。
export const GV_DISCOUNT_PESSIMISTIC = 0.11;
export const GV_DISCOUNT_NEUTRAL = 0.10;
export const GV_DISCOUNT_OPTIMISTIC = 0.09;

export type GrowthValueArgs = {
  years: ValuationFloorYear[];
  shares: number;
  taxRate: number;
  moatSignal: MoatSignal;
  epvPerShare?: number;
  avPerShare?: number;
};

const ZERO: GrowthScenarioSet = { pessimistic: 0, neutral: 0, optimistic: 0 };

/** Duration annuity factor [1 − 1/(1+r)^N] / r. */
function annuityFactor(r: number, n: number): number {
  return (1 - 1 / Math.pow(1 + r, n)) / r;
}

/**
 * Greenwald growth value (spec §1.6). Franchise-gated; cumulative endpoint-aligned ROIIC;
 * three-scenario sensitivity. `years` most-recent-first.
 *
 * Per-year growth reinvestment uses the D&A proxy for maintenance (capex − D&A)+ + ΔNWC — the
 * standard Greenwald growth-capex proxy across a multi-year series (disclosed simplification);
 * the dedicated maintenanceCapex() drives the current-year EPV/OE, not this series.
 */
export function computeGrowthValue(args: GrowthValueArgs): GrowthValue {
  const { years, shares, taxRate, moatSignal, epvPerShare, avPerShare } = args;
  const notes: string[] = [];
  const waccBand: [number, number] = [GV_DISCOUNT_OPTIMISTIC, GV_DISCOUNT_PESSIMISTIC];

  // Franchise gate (Greenwald orthodoxy): only a franchise earns a growth premium.
  if (moatSignal !== "franchise") {
    return {
      assessable: true, gated_to_zero: true, wacc_band: waccBand,
      scenarios: { ...ZERO }, per_share: { ...ZERO },
      notes: ["Growth value applies only to a franchise; without a moat, growth creates no durable value (GV = 0)."],
    };
  }

  const sorted = [...years].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const window = sorted.slice(0, GV_WINDOW);

  // Guard: need at least 3 years before touching window[0] / window[N-1].
  if (window.length < 3) {
    return {
      assessable: false,
      not_assessable_reason: "Insufficient operating-income history (fewer than 3 years in window), so ROIIC / growth value cannot be computed.",
      gated_to_zero: false, wacc_band: waccBand, scenarios: { ...ZERO }, per_share: { ...ZERO },
      notes: ["Insufficient operating-income history for a growth read."],
    };
  }

  // NOPAT series for the increment (needs operating income).
  const nopat = (y: ValuationFloorYear): number | undefined =>
    y.operating_income != null ? y.operating_income * (1 - taxRate) : undefined;
  const nopatLatest = nopat(window[0]);
  const nopatOldest = nopat(window[window.length - 1]);
  if (nopatLatest == null || nopatOldest == null) {
    return {
      assessable: false,
      not_assessable_reason: "Operating income is not available across the window, so ROIIC / growth value cannot be computed.",
      gated_to_zero: false, wacc_band: waccBand, scenarios: { ...ZERO }, per_share: { ...ZERO },
      notes: ["Insufficient operating-income history for a growth read."],
    };
  }

  // Per-year growth reinvestment = max(0, capex − D&A) + ΔNWC. ΔNWC = WC_y − WC_{y+1} (older).
  function growthReinvest(idx: number): number | undefined {
    const y = window[idx];
    if (y.capex == null || y.d_and_a == null) return undefined;
    const growthCapex = Math.max(0, y.capex - y.d_and_a);
    let deltaNwc = 0;
    const older = window[idx + 1];
    if (y.working_capital != null && older?.working_capital != null) {
      deltaNwc = y.working_capital - older.working_capital; // increase = investment
    }
    return growthCapex + deltaNwc;
  }

  // Endpoint alignment (audit fix #4): cumulative denominator over the MATURED years only —
  // skip the most recent ROIIC_ENDPOINT_LAG years' investment (not yet earning).
  let lag = ROIIC_ENDPOINT_LAG;
  const reinvestSeries: number[] = [];
  for (let i = lag; i < window.length; i++) {
    const r = growthReinvest(i);
    if (r != null) reinvestSeries.push(r);
  }
  if (reinvestSeries.length === 0 && window.length >= 2) {
    lag = 1; // relax endpoint lag if the window is short
    for (let i = lag; i < window.length; i++) {
      const r = growthReinvest(i);
      if (r != null) reinvestSeries.push(r);
    }
    if (reinvestSeries.length > 0) notes.push("Endpoint lag relaxed to 1 year (short window).");
  }
  const cumulativeReinvest = reinvestSeries.reduce((s, v) => s + v, 0);
  if (cumulativeReinvest <= 0) {
    return {
      assessable: false,
      not_assessable_reason: "No positive growth reinvestment in the matured window, so ROIIC cannot be computed.",
      gated_to_zero: false, wacc_band: waccBand, scenarios: { ...ZERO }, per_share: { ...ZERO },
      notes: [...notes, "Capex did not exceed D&A (no growth capital deployed) — growth value not assessable."],
    };
  }

  // Cumulative ROIIC = N-year NOPAT increment / Σ growth reinvestment (matured).
  const roiic = (nopatLatest - nopatOldest) / cumulativeReinvest;

  // Representative annual growth reinvestment (average over the matured series).
  const annualReinvest = cumulativeReinvest / reinvestSeries.length;

  // Duration by franchise strength (EPV/AV).
  const ratio = epvPerShare != null && avPerShare != null && avPerShare > 0 ? epvPerShare / avPerShare : undefined;
  const baseDuration = ratio != null && ratio >= MOAT_STRONG_MULTIPLE ? DURATION_STRONG : DURATION_MODERATE;

  // GV = annual growth reinvestment × (ROIIC − r)/r × annuityFactor(r, N). Floor at 0 per scenario.
  function gv(roiicScenario: number, r: number, n: number): number {
    if (roiicScenario <= r) return 0;
    const excess = (roiicScenario - r) / r;
    const val = annualReinvest * excess * annuityFactor(r, n);
    return val > 0 ? val : 0;
  }

  const roiicLow = roiic * (1 - ROIIC_SENSITIVITY);
  const roiicHigh = roiic * (1 + ROIIC_SENSITIVITY);
  const durShort = Math.max(1, baseDuration - DURATION_PESSIMISTIC_DELTA);

  const scenarios: GrowthScenarioSet = {
    pessimistic: gv(roiicLow, GV_DISCOUNT_PESSIMISTIC, durShort),
    neutral: gv(roiic, GV_DISCOUNT_NEUTRAL, baseDuration),
    optimistic: gv(roiicHigh, GV_DISCOUNT_OPTIMISTIC, baseDuration),
  };
  const per_share: GrowthScenarioSet = {
    pessimistic: scenarios.pessimistic / shares,
    neutral: scenarios.neutral / shares,
    optimistic: scenarios.optimistic / shares,
  };

  if (roiic <= GV_DISCOUNT_NEUTRAL) {
    notes.push("ROIIC is at or below the cost of capital: incremental growth does not create value (neutral GV = 0).");
  }
  notes.push("Per-year maintenance uses the D&A proxy for the growth-reinvestment series; net M&A omitted (conservative); ΔNWC growth portion included here only (not in the owner-earnings floor).");

  return {
    assessable: true,
    gated_to_zero: false,
    roiic,
    wacc_band: waccBand,
    annual_growth_reinvestment: annualReinvest,
    duration_years: baseDuration,
    scenarios,
    per_share,
    notes,
  };
}
