import type { FundamentalQualityCheckResult, SkillInput } from "../schemas/researchSchemas";
import { coverageBlock, disclaimer, formatPct, hasAny, unavailable } from "./skillHelpers";

export function runFundamentalQualityCheck(input: SkillInput): FundamentalQualityCheckResult {
  const financials = input.normalized_financials;
  const metrics = input.financial_metrics;
  const hasFundamentals = hasAny(financials) || hasAny(metrics);
  const supported: string[] = [];
  const cannot: string[] = [];

  if (!hasFundamentals) {
    return {
      data_coverage: coverageBlock(input, "Missing"),
      business_quality: unavailable("normalized financials and calculated financial metrics are missing."),
      profitability: unavailable("profitability metrics are missing."),
      free_cash_flow_quality: unavailable("operating cash flow, free cash flow, FCF margin, and FCF conversion are missing."),
      balance_sheet_strength: unavailable("cash, debt, net debt, equity, and interest coverage data are missing."),
      capital_allocation: unavailable("share count, buyback, and dividend data are missing."),
      supported_conclusions: input.thirteen_f_summary ? ["Only lagged disclosed 13F interpretation is supported by the current dataset."] : [],
      cannot_conclude: [
        "Business quality",
        "Profitability",
        "Free cash flow quality",
        "Balance sheet strength",
        "ROIC or ROE",
      ],
      next_data_needed: ["normalized financial statements", "calculated profitability metrics", "cash-flow metrics", "balance sheet metrics"],
      disclaimer: disclaimer(),
    };
  }

  const grossMargin = formatPct(metrics?.gross_margin);
  const operatingMargin = formatPct(metrics?.operating_margin);
  const netMargin = formatPct(metrics?.net_margin);
  const fcfMargin = formatPct(metrics?.fcf_margin);
  const fcfConversion = formatPct(metrics?.fcf_conversion);

  if (grossMargin || operatingMargin || netMargin) {
    supported.push("Profitability can be discussed using provided margin metrics.");
  } else {
    cannot.push("Margin quality cannot be assessed without gross, operating, or net margin metrics.");
  }
  if (metrics?.free_cash_flow != null || fcfMargin || fcfConversion) {
    supported.push("Free cash flow quality can be discussed using provided cash-flow metrics.");
  } else {
    cannot.push("Free cash flow quality cannot be assessed without free cash flow, FCF margin, or FCF conversion.");
  }
  if (financials?.cash != null || financials?.debt != null || financials?.net_debt != null || metrics?.interest_coverage != null) {
    supported.push("Balance sheet observations can be made from provided cash, debt, net debt, or interest coverage data.");
  } else {
    cannot.push("Balance sheet strength cannot be assessed without cash, debt, net debt, equity, or interest coverage.");
  }

  return {
    data_coverage: coverageBlock(input, "Available"),
    business_quality:
      metrics?.roic != null || metrics?.roe != null
        ? `Quality indicators are limited to provided returns: ROIC ${formatPct(metrics.roic) ?? "not provided"}, ROE ${formatPct(metrics.roe) ?? "not provided"}.`
        : "Business quality can only be described from the supplied profitability and cash-flow evidence; ROIC/ROE are not provided.",
    profitability:
      grossMargin || operatingMargin || netMargin
        ? `Provided margins: gross ${grossMargin ?? "missing"}, operating ${operatingMargin ?? "missing"}, net ${netMargin ?? "missing"}.`
        : unavailable("margin metrics are missing."),
    free_cash_flow_quality:
      metrics?.free_cash_flow != null || fcfMargin || fcfConversion
        ? `Provided cash-flow evidence: free cash flow ${metrics?.free_cash_flow ?? "missing"}, FCF margin ${fcfMargin ?? "missing"}, FCF conversion ${fcfConversion ?? "missing"}.`
        : unavailable("free cash flow metrics are missing."),
    balance_sheet_strength:
      financials?.cash != null || financials?.debt != null || financials?.net_debt != null
        ? `Provided balance sheet evidence: cash ${financials?.cash ?? "missing"}, debt ${financials?.debt ?? "missing"}, net debt ${financials?.net_debt ?? "missing"}, interest coverage ${metrics?.interest_coverage ?? "missing"}.`
        : unavailable("balance sheet metrics are missing."),
    capital_allocation:
      financials?.share_count != null || financials?.buybacks != null || financials?.dividends != null
        ? `Provided capital allocation evidence: share count ${financials?.share_count ?? "missing"}, buybacks ${financials?.buybacks ?? "missing"}, dividends ${financials?.dividends ?? "missing"}.`
        : unavailable("share count, buyback, and dividend data are missing."),
    supported_conclusions: supported,
    cannot_conclude: cannot,
    next_data_needed: input.data_quality_gate.missing_data,
    disclaimer: disclaimer(),
  };
}
