import type { ValuationMetrics } from "../schemas/researchSchemas";
import type { PriceData, ValuationDataQuality, ValuationInput, ValuationResult } from "./types";

function ratio(numerator?: number, denominator?: number): number | undefined {
  if (numerator == null || denominator == null || denominator === 0) return undefined;
  return numerator / denominator;
}

function present(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function sharesOutstanding(input: ValuationInput): number | undefined {
  const raw =
    input.normalized_financials?.shares_outstanding ??
    input.normalized_financials?.shares_diluted ??
    input.normalized_financials?.share_count;
  if (raw == null) return undefined;
  // ADR 归一化:普通股数 ÷ ADS 比例 = ADS 张数,与每 ADS 价相乘才得正确市值。
  const adsRatio = input.ads_ratio;
  if (adsRatio != null && (!Number.isFinite(adsRatio) || adsRatio <= 0)) return undefined; // 抑制信号 → 市值降级
  return typeof adsRatio === "number" && adsRatio > 0 ? raw / adsRatio : raw;
}

function dataQuality(price: PriceData | null | undefined, metrics: ValuationMetrics): ValuationDataQuality {
  const missing: string[] = [];
  if (!price) missing.push("price");
  if (!present(metrics.market_cap)) missing.push("market_cap");
  if (!present(metrics.enterprise_value)) missing.push("enterprise_value");
  if (!present(metrics.pe)) missing.push("pe");
  if (!present(metrics.price_to_sales)) missing.push("ps");
  if (!present(metrics.pfcf_ratio)) missing.push("pfcf");
  if (!present(metrics.fcf_yield)) missing.push("fcf_yield");

  const hasCore = present(metrics.market_cap) && (present(metrics.pe) || present(metrics.price_to_sales) || present(metrics.pfcf_ratio));
  return {
    has_price: Boolean(price),
    has_market_cap: present(metrics.market_cap),
    has_enterprise_value: present(metrics.enterprise_value),
    has_pe: present(metrics.pe),
    has_ps: present(metrics.price_to_sales),
    has_pfcf: present(metrics.pfcf_ratio),
    has_fcf_yield: present(metrics.fcf_yield),
    missing_valuation_fields: missing,
    valuation_confidence: hasCore && present(metrics.enterprise_value) ? "High" : hasCore ? "Medium" : "Low",
  };
}

export function calculateValuation(input: ValuationInput): ValuationResult {
  const price = input.price ?? null;
  const shares = sharesOutstanding(input);
  const revenue = input.normalized_financials?.revenue;
  const netIncome = input.normalized_financials?.net_income;
  const operatingIncome = input.normalized_financials?.operating_income;
  const freeCashFlow = input.financial_metrics?.free_cash_flow;
  const totalDebt = input.financial_metrics?.total_debt ?? input.normalized_financials?.debt;
  const cash = input.normalized_financials?.cash;
  const dividends = input.normalized_financials?.dividends;
  const buybacks = input.normalized_financials?.buybacks;

  const marketCap = price && shares ? price.latest_price * shares : undefined;
  const enterpriseValue =
    marketCap != null && totalDebt != null && cash != null ? marketCap + totalDebt - cash : undefined;

  const valuation_metrics: ValuationMetrics = {
    latest_price: price?.latest_price,
    price_date: price?.price_date,
    price_currency: price?.currency,
    price_source: price?.source,
    market_cap: marketCap,
    enterprise_value: enterpriseValue,
    pe: ratio(marketCap, netIncome),
    price_to_sales: ratio(marketCap, revenue),
    pfcf_ratio: ratio(marketCap, freeCashFlow),
    ev_sales: ratio(enterpriseValue, revenue),
    ev_ebit: ratio(enterpriseValue, operatingIncome),
    fcf_yield: ratio(freeCashFlow, marketCap),
    earnings_yield: ratio(netIncome, marketCap),
    dividend_yield: ratio(dividends, marketCap),
    buyback_yield: ratio(buybacks, marketCap),
    historical_range_note: price
      ? "Valuation metrics are point-in-time ratios calculated from latest price and SEC-normalized annual fundamentals; no target price or fair value model is provided."
      : undefined,
  };

  const quality = dataQuality(price, valuation_metrics);
  const availableMetricCount = Object.values(valuation_metrics).filter((value) => typeof value === "number").length;
  const status = quality.has_price && quality.has_market_cap && availableMetricCount > 2 ? "available" : quality.has_price ? "partial" : "unavailable";

  return {
    valuation_metrics: status === "unavailable" ? undefined : valuation_metrics,
    valuation_source_status: {
      source: price?.source ?? "NONE",
      status,
      price: price ?? undefined,
      data_quality: quality,
      message: !price
        ? "Price unavailable; valuation metrics were not added to the research workflow."
        : !quality.has_market_cap
          ? "Price is available, but shares outstanding are missing; market cap and market-cap-based ratios were not calculated."
          : undefined,
    },
  };
}
