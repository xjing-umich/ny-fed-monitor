import type { DataConfidence, NormalizedResearchData, ValuationMetrics } from "../schemas/researchSchemas";

export type PriceData = {
  ticker: string;
  latest_price: number;
  price_date: string;
  currency: string;
  source: string;
};

export type ValuationDataQuality = {
  has_price: boolean;
  has_market_cap: boolean;
  has_enterprise_value: boolean;
  has_pe: boolean;
  has_ps: boolean;
  has_pfcf: boolean;
  has_fcf_yield: boolean;
  missing_valuation_fields: string[];
  valuation_confidence: DataConfidence;
};

export type ValuationResult = {
  valuation_metrics?: ValuationMetrics;
  valuation_source_status: {
    source: string;
    status: "available" | "partial" | "unavailable";
    price?: PriceData;
    data_quality: ValuationDataQuality;
    message?: string;
  };
};

export type ValuationInput = Pick<NormalizedResearchData, "ticker" | "normalized_financials" | "financial_metrics"> & {
  price?: PriceData | null;
  /** ADR/ADS 归一化比例:每 1 ADS 折合几股普通股。缺省=1(非 ADR);<=0 或非有限值=抑制信号(市值降级留白)。 */
  ads_ratio?: number;
};
