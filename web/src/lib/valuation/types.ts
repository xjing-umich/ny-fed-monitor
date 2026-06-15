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
  method: EpvLampMethod;
};

export type AssetFloor = {
  assessable: boolean;
  not_assessable_reason?: string;
  basis: string;
  intangibles_separated: boolean;
  total_value?: number;
  per_share?: number;
};

export type MoatSignal = "franchise" | "commodity" | "value_destruction" | "not_assessable";

export type MoatReading = {
  signal: MoatSignal;
  label: string;
  basis_note: string;
  epv_per_share_compared?: number;
  asset_per_share_compared?: number;
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
  asset_floor: AssetFloor;
  moat_reading: MoatReading;
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
};

export type ValuationFloorInput = {
  ticker: string;
  company_name?: string;
  years: ValuationFloorYear[]; // most-recent-first
};
