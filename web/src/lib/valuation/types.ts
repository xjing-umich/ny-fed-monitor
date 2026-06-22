// Self-contained valuation-floor types. Decoupled from the research subsystem
// (which is being archived). The ValuationFloor output shape matches what the
// engine produces; ValuationFloorInput is the rich input contract mapped from
// stored FundamentalPeriod rows.

export type EpvLampMethod = {
  earnings_basis: string;
  leverage_treatment: string;
  denominator: string;
  bridge: string;
  discount_rate_low: number;
  discount_rate_high: number;
  years_used: number[];
  simplifications: string[];
};

export type EpvLamp = {
  label: string;
  assessable: boolean;
  not_assessable_reason?: string;
  normalized_earnings?: number;
  equity_value_low?: number;
  equity_value_high?: number;
  per_share_low?: number;
  per_share_high?: number;
  /** Buffett lamp only: average SBC / owner earnings — real dilution cost, disclosed not added back (spec §1.3). */
  sbc_to_oe_pct?: number;
  method: EpvLampMethod;
};

/** Greenwald reproduction value (spec §1.4): tangible net assets + capitalized R&D.
 *  Field name `asset_floor` on ValuationFloor is kept for backward-compat; this is a superset of the old AssetFloor. */
export type ReproductionValue = {
  assessable: boolean;
  not_assessable_reason?: string;
  basis: string;
  intangibles_separated: boolean;
  total_value?: number;            // AV = tangible net assets + capitalized R&D
  per_share?: number;
  tangible_net_assets?: number;
  capitalized_rd?: number;         // undefined when rd_expense fully absent (degraded to tangible book)
  rd_years_used?: number[];
};
/** @deprecated use ReproductionValue */
export type AssetFloor = ReproductionValue;

export type MoatSignal = "franchise" | "commodity" | "value_destruction" | "not_assessable";

export type MoatReading = {
  signal: MoatSignal;
  label: string;
  basis_note: string;
  epv_per_share_compared?: number;
  asset_per_share_compared?: number;
  /** EPV − AV (×shares) when franchise; the dollar moat premium over reproduction value. */
  franchise_value?: number;
};

export type ValuationFloorProvenance = {
  years_used: number[];
  as_of_fiscal_year?: number;
  discount_rate_band: [number, number];
  normalized_tax_rate: number;
  normalized_tax_rate_basis: string;
  maintenance_capex_rule: string;
  share_count_basis: string;
  /** 单灯档说明：为何只用 owner-earnings 灯。完整两灯档为 undefined。 */
  earnings_basis_note?: string;
};

export type ValuationFloor = {
  kind: "floor";
  graham_epv: EpvLamp;
  buffett_epv: EpvLamp;
  asset_floor: ReproductionValue;
  moat_reading: MoatReading;
  growth_value: GrowthValue;
  high_leverage_warning: boolean;
  high_leverage_note?: string;
  net_debt_to_equity?: number;
  provenance: ValuationFloorProvenance;
};

/** 盈利数据齐备但无法取得每股股数（如多股权结构）时返回，供卡片诚实标注。 */
export type PerShareUnavailable = {
  kind: "per_share_unavailable";
  reason: string;
};

// ── Strike zone (price vs. floor) ────────────────────────────────────────────
export type StrikeZone = "in_strike_zone" | "approaching" | "outside";

/**
 * v2 value-band position (spec §2). Where price.close sits in the conservative→
 * optimistic value band. An OBSERVATION, never a verdict. Tiers 4/5 exist only
 * when growth value is assessable; otherwise the band collapses to the four
 * zero-growth states (…|"above_zero_growth"). GRAHAM_MOS=1/3 drives tier 1↔2.
 */
export type ValuePosition =
  | "in_strike_zone"      // price ≤ valueFloor × (1 − 1/3)
  | "approaching"         // valueFloor × 2/3 < price ≤ valueFloor
  | "zero_growth_zone"    // valueFloor < price ≤ base
  | "moat_band"           // base < price ≤ ceiling_neutral
  | "upper_band"          // ceiling_neutral < price ≤ ceiling_optimistic
  | "above_optimistic"    // price > ceiling_optimistic
  | "above_zero_growth";  // GV collapsed: price > base, no growth ceilings

/**
 * Deterministic price-vs-floor assessment. The ONLY place price enters the
 * valuation card. Observation, never a recommendation: no BUY/SELL/HOLD, no
 * target price. `undefined` from the engine means "no meaningful comparison".
 */
export type StrikeZoneAssessment = {
  /** The price the comparison was made against (in-store latest). */
  price: { close: number; date: string; currency: string; source?: string };
  /** price.date older than STALE_PRICE_DAYS — shown as a degraded "as of" note, NOT hidden. */
  stale: boolean;
  /** price.currency !== "USD" — EPV/asset comparison suppressed (per-share floors are USD). */
  currencyMismatch: boolean;
  /** Human reason shown when the comparison is suppressed (currency mismatch). */
  suppressedReason?: string;
  /** EPV strike zone — present only when ≥1 EPV lamp is assessable with a positive per_share_low AND currency matches. */
  epv?: {
    // ── v1 backward-compat fields (UNCHANGED computation — zero behavior change) ──
    zone: StrikeZone;
    /** Global-minimum assessable per_share_low across lamps — EPV_low, the conservative reference. */
    floorConservative: number;
    /** Global-maximum assessable per_share_high across lamps — EPV_high, the zero-growth ceiling. */
    ceiling: number;
    /** Margin of safety vs floorConservative — the conservative end; drives `zone`. */
    mosLow: number;
    /** Margin of safety vs ceiling — the optimistic end of the zero-growth range. */
    mosHigh: number;
    // ── v2 value band (spec §1) ──
    /** max(AV_ps, EPV_low) — conservative floor that drives the strike zone (folds reproduction value). */
    valueFloor: number;
    /** valueBaseZeroGrowth = max(AV_ps, EPV_high) — top of the zero-growth value. */
    base: number;
    /** base + growth_value.per_share[s]. Undefined when growth value collapsed (gated/not assessable/non-finite). */
    ceilings?: { pessimistic: number; neutral: number; optimistic: number };
    /** 5/6-tier price position over the value band. */
    position: ValuePosition;
    /** true when growth value is gated_to_zero / not assessable / non-finite → ceilings undefined, position degrades to 4 tiers. */
    growthCollapsed: boolean;
  };
  /** Asset-floor second lamp — present only when asset_floor is assessable AND currency matches. */
  assetFloor?: {
    perShare: number;
    /** price.close <= asset_floor.per_share — a rarer, harder signal. */
    priceBelow: boolean;
  };
};

// ── Input contract (mapped from stored FundamentalPeriod rows) ───────────────
export type ValuationFloorYear = {
  fiscal_year: number;
  revenue?: number;
  operating_income?: number;
  operating_margin?: number;
  net_income?: number;
  pretax_income?: number;
  income_tax_expense?: number;
  effective_tax_rate?: number;
  shareholders_equity?: number;
  goodwill?: number;
  intangibles?: number;
  cash?: number;
  total_debt?: number;
  net_debt?: number;
  shares_diluted?: number;
  // v2 rich fields (spec §1) — all optional; absence degrades only the dependent layer.
  d_and_a?: number;
  capex?: number;
  rd_expense?: number;
  sga_expense?: number;
  stock_based_comp?: number;
  working_capital?: number;
  ppe_net?: number;
  operating_cash_flow?: number;
  share_repurchases?: number;
  current_assets?: number;
  current_liabilities?: number;
};

export type ValuationFloorInput = {
  ticker: string;
  company_name?: string;
  years: ValuationFloorYear[]; // most-recent-first
};

// ── Maintenance capex (spec §1.1) ────────────────────────────────────────────
export type MaintCapex = {
  assessable: boolean;
  not_assessable_reason?: string;
  /** Chosen maintenance capex: median of available methods, raised to the AI-hog floor when triggered. */
  value?: number;
  methods: { da_proxy?: number; greenwald_sales?: number; ppe_life?: number };
  confidence: "ok" | "degraded";
  /** (max − min)/median across methods; present when ≥2 methods available. */
  divergence_pct?: number;
  ai_capex_distortion_warning: boolean;
  notes: string[];
};

// ── Growth value (spec §1.6) ─────────────────────────────────────────────────
export type GrowthScenarioSet = { pessimistic: number; neutral: number; optimistic: number };

export type GrowthValue = {
  assessable: boolean;
  not_assessable_reason?: string;
  /** true when GV was forced to 0 by the franchise gate or ROIIC ≤ WACC (a real reading, not missing data). */
  gated_to_zero: boolean;
  roiic?: number;
  wacc_band: [number, number];
  annual_growth_reinvestment?: number;
  duration_years?: number;
  /** Enterprise-level GV per scenario (USD). */
  scenarios: GrowthScenarioSet;
  /** Per-diluted-share GV per scenario. */
  per_share: GrowthScenarioSet;
  notes: string[];
};
