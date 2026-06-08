import type { FinancialMetrics, GrowthMetrics, NormalizedFinancials, RiskSignals } from "../schemas/researchSchemas";
import { factForYear, latestFact } from "./normalizeCompanyFacts";
import type { SecNormalizedAnnualFinancials, SecNormalizedField } from "./types";

function value(normalized: SecNormalizedAnnualFinancials, field: SecNormalizedField): number | undefined {
  return latestFact(normalized, field)?.value;
}

function valueForYear(
  normalized: SecNormalizedAnnualFinancials,
  field: SecNormalizedField,
  fiscalYear: number,
): number | undefined {
  return factForYear(normalized, field, fiscalYear)?.value;
}

function ratio(numerator?: number, denominator?: number): number | undefined {
  if (numerator == null || denominator == null || denominator === 0) return undefined;
  return numerator / denominator;
}

function growth(current?: number, prior?: number): number | undefined {
  if (current == null || prior == null || prior === 0) return undefined;
  return current / prior - 1;
}

function cagr(current?: number, prior?: number, years?: number): number | undefined {
  if (current == null || prior == null || prior <= 0 || current <= 0 || !years || years <= 0) return undefined;
  return (current / prior) ** (1 / years) - 1;
}

export function latestNormalizedFinancials(normalized: SecNormalizedAnnualFinancials): NormalizedFinancials {
  return {
    revenue: value(normalized, "revenue"),
    gross_profit: value(normalized, "gross_profit"),
    operating_income: value(normalized, "operating_income"),
    net_income: value(normalized, "net_income"),
    eps: value(normalized, "eps_diluted") ?? value(normalized, "eps_basic"),
    cash: value(normalized, "cash"),
    total_assets: value(normalized, "total_assets"),
    total_liabilities: value(normalized, "total_liabilities"),
    debt: value(normalized, "total_debt"),
    net_debt: value(normalized, "net_debt"),
    shareholders_equity: value(normalized, "shareholders_equity"),
    short_term_debt: value(normalized, "short_term_debt"),
    long_term_debt: value(normalized, "long_term_debt"),
    share_count: value(normalized, "shares_diluted") ?? value(normalized, "shares_basic") ?? value(normalized, "shares_outstanding"),
    shares_basic: value(normalized, "shares_basic"),
    shares_diluted: value(normalized, "shares_diluted"),
    shares_outstanding: value(normalized, "shares_outstanding"),
    buybacks: value(normalized, "buybacks"),
    dividends: value(normalized, "dividends"),
  };
}

export function latestFinancialMetrics(normalized: SecNormalizedAnnualFinancials): FinancialMetrics {
  const revenue = value(normalized, "revenue");
  const grossProfit = value(normalized, "gross_profit");
  const operatingIncome = value(normalized, "operating_income");
  const netIncome = value(normalized, "net_income");
  const operatingCashFlow = value(normalized, "operating_cash_flow");
  const freeCashFlow = value(normalized, "free_cash_flow");
  const equity = value(normalized, "shareholders_equity");
  const totalDebt = value(normalized, "total_debt");
  const cash = value(normalized, "cash");

  return {
    gross_margin: ratio(grossProfit, revenue),
    operating_margin: ratio(operatingIncome, revenue),
    net_margin: ratio(netIncome, revenue),
    operating_cash_flow: operatingCashFlow,
    free_cash_flow: freeCashFlow,
    fcf_margin: ratio(freeCashFlow, revenue),
    fcf_conversion: ratio(freeCashFlow, netIncome),
    roe: ratio(netIncome, equity),
    roic: ratio(operatingIncome, (equity ?? 0) + (totalDebt ?? 0) - (cash ?? 0)),
    capital_expenditure: value(normalized, "capital_expenditure"),
    total_debt: totalDebt,
    debt_to_equity: ratio(totalDebt, equity),
  };
}

export function latestGrowthMetrics(normalized: SecNormalizedAnnualFinancials): GrowthMetrics {
  const latestYear = normalized.latest_fiscal_year;
  if (!latestYear) return {};
  const currentRevenue = valueForYear(normalized, "revenue", latestYear);
  const priorRevenue = valueForYear(normalized, "revenue", latestYear - 1);
  const currentFcf = valueForYear(normalized, "free_cash_flow", latestYear);
  const priorFcf = valueForYear(normalized, "free_cash_flow", latestYear - 1);
  const currentNetIncome = valueForYear(normalized, "net_income", latestYear);
  const priorNetIncome = valueForYear(normalized, "net_income", latestYear - 1);
  const currentEps = valueForYear(normalized, "eps_diluted", latestYear) ?? valueForYear(normalized, "eps_basic", latestYear);
  const priorEps = valueForYear(normalized, "eps_diluted", latestYear - 1) ?? valueForYear(normalized, "eps_basic", latestYear - 1);
  const currentShareCount =
    valueForYear(normalized, "shares_diluted", latestYear) ??
    valueForYear(normalized, "shares_basic", latestYear) ??
    valueForYear(normalized, "shares_outstanding", latestYear);
  const priorShareCount =
    valueForYear(normalized, "shares_diluted", latestYear - 1) ??
    valueForYear(normalized, "shares_basic", latestYear - 1) ??
    valueForYear(normalized, "shares_outstanding", latestYear - 1);

  return {
    revenue_growth: growth(currentRevenue, priorRevenue),
    revenue_growth_acceleration: undefined,
    profit_growth: growth(currentNetIncome, priorNetIncome),
    eps_growth: growth(currentEps, priorEps),
    free_cash_flow_growth: growth(currentFcf, priorFcf),
    fcf_growth_yoy: growth(currentFcf, priorFcf),
    revenue_cagr_3y: cagr(currentRevenue, valueForYear(normalized, "revenue", latestYear - 3), 3),
    revenue_cagr_5y: cagr(currentRevenue, valueForYear(normalized, "revenue", latestYear - 5), 5),
    fcf_cagr_3y: cagr(currentFcf, valueForYear(normalized, "free_cash_flow", latestYear - 3), 3),
    fcf_cagr_5y: cagr(currentFcf, valueForYear(normalized, "free_cash_flow", latestYear - 5), 5),
    share_count_change_yoy: growth(currentShareCount, priorShareCount),
  };
}

export function secRiskSignals(normalized: SecNormalizedAnnualFinancials): RiskSignals {
  const risks: RiskSignals = {};
  const latestYear = normalized.latest_fiscal_year;
  if (!latestYear) return risks;
  const revenueGrowth = latestGrowthMetrics(normalized).revenue_growth;
  const fcf = valueForYear(normalized, "free_cash_flow", latestYear);
  const debtToEquity = ratio(value(normalized, "total_debt"), value(normalized, "shareholders_equity"));
  if (revenueGrowth != null && revenueGrowth < 0) {
    risks.growth_risk = ["SEC-normalized annual revenue declined year over year."];
  }
  if (fcf != null && fcf < 0) {
    risks.free_cash_flow_risk = ["SEC-normalized annual free cash flow is negative."];
  }
  if (debtToEquity != null && debtToEquity > 2) {
    risks.balance_sheet_leverage_risk = ["SEC-normalized total debt is more than two times shareholders' equity."];
  }
  return risks;
}
