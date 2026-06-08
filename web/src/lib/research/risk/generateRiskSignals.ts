import type {
  AnnualResearchSnapshot,
  NormalizedResearchData,
  RiskSignal,
  RiskSignalCategory,
  RiskSeverity,
  EvidenceStrength,
} from "../schemas/researchSchemas";
import { RISK_SIGNAL_SOURCE, RISK_THRESHOLDS } from "./riskConfig";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function bps(value: number): number {
  return value * 10000;
}

function hasValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function byYear(history: AnnualResearchSnapshot[] | undefined): AnnualResearchSnapshot[] {
  return [...(history ?? [])].sort((a, b) => a.fiscal_year - b.fiscal_year);
}

function yoy(values: { fiscal_year: number; value?: number }[]) {
  const result: { fiscal_year: number; growth: number }[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const prior = values[i - 1];
    const current = values[i];
    if (hasValue(prior.value) && hasValue(current.value) && prior.value !== 0) {
      result.push({ fiscal_year: current.fiscal_year, growth: current.value / prior.value - 1 });
    }
  }
  return result;
}

function signal(args: {
  id: string;
  category: RiskSignalCategory;
  severity?: RiskSeverity;
  evidence_strength?: EvidenceStrength;
  evidence: string;
  why_it_matters: string;
  data_needed_next: string[];
  source_fields: string[];
}): RiskSignal {
  return {
    severity: "Medium",
    evidence_strength: "Medium",
    source: RISK_SIGNAL_SOURCE,
    ...args,
  };
}

function latestTwo(history: AnnualResearchSnapshot[]) {
  if (history.length < 2) return undefined;
  return [history[history.length - 2], history[history.length - 1]] as const;
}

function addGrowthSignals(data: NormalizedResearchData, signals: RiskSignal[]) {
  const history = byYear(data.annual_history).filter((row) => hasValue(row.revenue));
  const revenueGrowth = yoy(history.map((row) => ({ fiscal_year: row.fiscal_year, value: row.revenue })));
  if (revenueGrowth.length >= 2) {
    const prior = revenueGrowth[revenueGrowth.length - 2];
    const latest = revenueGrowth[revenueGrowth.length - 1];
    if (latest.growth < prior.growth) {
      signals.push(
        signal({
          id: "revenue_growth_deceleration",
          category: "Growth Risk",
          evidence: `Revenue growth decelerated from ${pct(prior.growth)} in FY${prior.fiscal_year} to ${pct(latest.growth)} in FY${latest.fiscal_year}.`,
          why_it_matters: "A lower revenue growth rate can reduce operating leverage and future reinvestment capacity if it persists.",
          data_needed_next: ["segment growth", "guidance", "backlog or RPO"],
          source_fields: ["annual_history.revenue"],
        }),
      );
    }
  }
  const latestRevenueGrowth = data.growth_metrics?.revenue_growth;
  if (hasValue(latestRevenueGrowth) && latestRevenueGrowth < 0) {
    signals.push(
      signal({
        id: "negative_revenue_growth",
        category: "Growth Risk",
        severity: "High",
        evidence: `Latest annual revenue growth is ${pct(latestRevenueGrowth)}.`,
        why_it_matters: "Negative revenue growth is a direct evidence-based signal of contraction in the reported annual period.",
        data_needed_next: ["segment growth", "pricing volume bridge", "forward-looking indicators"],
        source_fields: ["growth_metrics.revenue_growth"],
      }),
    );
  }
  const fcfGrowth = yoy(byYear(data.annual_history).map((row) => ({ fiscal_year: row.fiscal_year, value: row.free_cash_flow })));
  if (fcfGrowth.length >= 2) {
    const prior = fcfGrowth[fcfGrowth.length - 2];
    const latest = fcfGrowth[fcfGrowth.length - 1];
    if (latest.growth < prior.growth) {
      signals.push(
        signal({
          id: "fcf_growth_deceleration",
          category: "Growth Risk",
          evidence: `Free cash flow growth decelerated from ${pct(prior.growth)} in FY${prior.fiscal_year} to ${pct(latest.growth)} in FY${latest.fiscal_year}.`,
          why_it_matters: "Slower free cash flow growth can limit internally funded reinvestment or capital returns.",
          data_needed_next: ["working capital detail", "capex plan", "cash conversion drivers"],
          source_fields: ["annual_history.free_cash_flow"],
        }),
      );
    }
  }
  if (hasValue(data.growth_metrics?.profit_growth) && hasValue(data.growth_metrics?.revenue_growth) && data.growth_metrics.profit_growth < data.growth_metrics.revenue_growth) {
    signals.push(
      signal({
        id: "profit_growth_lagging_revenue",
        category: "Growth Risk",
        evidence: `Profit growth (${pct(data.growth_metrics.profit_growth)}) is below revenue growth (${pct(data.growth_metrics.revenue_growth)}).`,
        why_it_matters: "Profit growth lagging revenue can indicate less favorable operating leverage in the reported period.",
        data_needed_next: ["margin bridge", "cost drivers"],
        source_fields: ["growth_metrics.profit_growth", "growth_metrics.revenue_growth"],
      }),
    );
  }
}

function addMarginSignals(data: NormalizedResearchData, signals: RiskSignal[]) {
  const history = byYear(data.annual_history);
  const pair = latestTwo(history);
  if (!pair) return;
  const checks: Array<[string, keyof AnnualResearchSnapshot, string]> = [
    ["gross_margin_compression", "gross_margin", "gross margin"],
    ["operating_margin_compression", "operating_margin", "operating margin"],
    ["net_margin_compression", "net_margin", "net margin"],
  ];
  for (const [id, field, label] of checks) {
    const prior = pair[0][field];
    const latest = pair[1][field];
    if (hasValue(prior) && hasValue(latest) && bps(prior - latest) > RISK_THRESHOLDS.marginCompressionBps) {
      signals.push(
        signal({
          id,
          category: "Profitability and Margin Risk",
          evidence: `${label} declined from ${pct(prior)} in FY${pair[0].fiscal_year} to ${pct(latest)} in FY${pair[1].fiscal_year}, a decline above ${RISK_THRESHOLDS.marginCompressionBps} bps.`,
          why_it_matters: "Material margin compression can reduce earnings resilience if it continues.",
          data_needed_next: ["cost bridge", "pricing and mix detail"],
          source_fields: [`annual_history.${String(field)}`],
        }),
      );
    }
  }
  for (const [field, label] of [
    ["gross_margin", "gross margin"],
    ["operating_margin", "operating margin"],
    ["net_margin", "net margin"],
  ] as const) {
    const values = history.map((row) => row[field]).filter(hasValue);
    if (values.length >= 3 && bps(Math.max(...values) - Math.min(...values)) > RISK_THRESHOLDS.marginVolatilityRangeBps) {
      signals.push(
        signal({
          id: "margin_volatility",
          category: "Profitability and Margin Risk",
          evidence: `${label} range across annual history exceeds ${RISK_THRESHOLDS.marginVolatilityRangeBps} bps.`,
          why_it_matters: "Large historical margin swings can make current margins less representative.",
          data_needed_next: ["multi-year margin bridge", "segment margin data"],
          source_fields: [`annual_history.${field}`],
        }),
      );
      break;
    }
  }
}

function addFcfSignals(data: NormalizedResearchData, signals: RiskSignal[]) {
  const pair = latestTwo(byYear(data.annual_history));
  if (hasValue(data.financial_metrics?.free_cash_flow) && data.financial_metrics.free_cash_flow < 0) {
    signals.push(signal({ id: "negative_free_cash_flow", category: "Free Cash Flow Risk", severity: "High", evidence: `Latest annual free cash flow is ${data.financial_metrics.free_cash_flow}.`, why_it_matters: "Negative free cash flow means the reported period did not self-fund after capital expenditure.", data_needed_next: ["operating cash flow detail", "capex drivers"], source_fields: ["financial_metrics.free_cash_flow"] }));
  }
  if (pair && hasValue(pair[0].free_cash_flow) && hasValue(pair[1].free_cash_flow) && pair[1].free_cash_flow < pair[0].free_cash_flow) {
    signals.push(signal({ id: "fcf_decline", category: "Free Cash Flow Risk", evidence: `Free cash flow declined from ${pair[0].free_cash_flow} in FY${pair[0].fiscal_year} to ${pair[1].free_cash_flow} in FY${pair[1].fiscal_year}.`, why_it_matters: "A decline in free cash flow can reduce financial flexibility if sustained.", data_needed_next: ["working capital detail", "capex plan"], source_fields: ["annual_history.free_cash_flow"] }));
  }
  if (pair && hasValue(pair[0].fcf_margin) && hasValue(pair[1].fcf_margin) && bps(pair[0].fcf_margin - pair[1].fcf_margin) > RISK_THRESHOLDS.marginCompressionBps) {
    signals.push(signal({ id: "fcf_margin_compression", category: "Free Cash Flow Risk", evidence: `FCF margin declined from ${pct(pair[0].fcf_margin)} in FY${pair[0].fiscal_year} to ${pct(pair[1].fcf_margin)} in FY${pair[1].fiscal_year}.`, why_it_matters: "FCF margin compression can indicate lower cash conversion from revenue.", data_needed_next: ["working capital detail", "capex drivers"], source_fields: ["annual_history.fcf_margin"] }));
  }
  if (hasValue(data.financial_metrics?.fcf_conversion) && data.financial_metrics.fcf_conversion < RISK_THRESHOLDS.weakFcfConversionBelow) {
    signals.push(signal({ id: "weak_fcf_conversion", category: "Free Cash Flow Risk", evidence: `Latest FCF conversion is ${pct(data.financial_metrics.fcf_conversion)}, below the configured ${pct(RISK_THRESHOLDS.weakFcfConversionBelow)} threshold.`, why_it_matters: "Lower cash conversion can limit the reliability of accounting earnings as cash generation.", data_needed_next: ["working capital detail", "capex detail"], source_fields: ["financial_metrics.fcf_conversion"] }));
  }
  if (pair && hasValue(pair[0].capital_expenditure) && hasValue(pair[0].revenue) && hasValue(pair[1].capital_expenditure) && hasValue(pair[1].revenue)) {
    const priorIntensity = pair[0].capital_expenditure / pair[0].revenue;
    const latestIntensity = pair[1].capital_expenditure / pair[1].revenue;
    if (bps(latestIntensity - priorIntensity) > RISK_THRESHOLDS.marginCompressionBps) {
      signals.push(signal({ id: "capex_intensity_rising", category: "Free Cash Flow Risk", evidence: `Capex intensity rose from ${pct(priorIntensity)} in FY${pair[0].fiscal_year} to ${pct(latestIntensity)} in FY${pair[1].fiscal_year}.`, why_it_matters: "Rising capex intensity can pressure free cash flow if operating cash flow does not rise proportionally.", data_needed_next: ["capex plan", "maintenance vs growth capex"], source_fields: ["annual_history.capital_expenditure", "annual_history.revenue"] }));
    }
  }
}

function addBalanceSheetSignals(data: NormalizedResearchData, signals: RiskSignal[]) {
  const pair = latestTwo(byYear(data.annual_history));
  if (pair) {
    for (const [id, field, label] of [
      ["rising_total_debt", "total_debt", "total debt"],
      ["rising_net_debt", "net_debt", "net debt"],
    ] as const) {
      if (hasValue(pair[0][field]) && hasValue(pair[1][field]) && pair[1][field] > pair[0][field]) {
        signals.push(signal({ id, category: "Balance Sheet and Leverage Risk", evidence: `${label} rose from ${pair[0][field]} in FY${pair[0].fiscal_year} to ${pair[1][field]} in FY${pair[1].fiscal_year}.`, why_it_matters: "Rising debt can reduce balance sheet flexibility if not matched by cash flow growth.", data_needed_next: ["debt maturity schedule", "interest expense"], source_fields: [`annual_history.${field}`] }));
      }
    }
    if (hasValue(pair[0].cash) && hasValue(pair[1].cash) && pair[1].cash < pair[0].cash) {
      signals.push(signal({ id: "cash_decline", category: "Balance Sheet and Leverage Risk", evidence: `Cash declined from ${pair[0].cash} in FY${pair[0].fiscal_year} to ${pair[1].cash} in FY${pair[1].fiscal_year}.`, why_it_matters: "A lower cash balance can reduce liquidity cushion if other funding sources are not available.", data_needed_next: ["cash flow statement detail", "debt maturity schedule"], source_fields: ["annual_history.cash"] }));
    }
    if (hasValue(pair[0].debt_to_equity) && hasValue(pair[1].debt_to_equity) && pair[1].debt_to_equity > pair[0].debt_to_equity) {
      signals.push(signal({ id: "debt_to_equity_increase", category: "Balance Sheet and Leverage Risk", evidence: `Debt-to-equity increased from ${pair[0].debt_to_equity.toFixed(2)}x in FY${pair[0].fiscal_year} to ${pair[1].debt_to_equity.toFixed(2)}x in FY${pair[1].fiscal_year}.`, why_it_matters: "Higher debt relative to equity can increase financial risk if cash flow weakens.", data_needed_next: ["debt maturity schedule", "interest coverage"], source_fields: ["annual_history.debt_to_equity"] }));
    }
  }
  if (hasValue(data.normalized_financials?.shareholders_equity) && data.normalized_financials.shareholders_equity < 0) {
    signals.push(signal({ id: "negative_equity", category: "Balance Sheet and Leverage Risk", severity: "High", evidence: `Latest shareholders' equity is ${data.normalized_financials.shareholders_equity}.`, why_it_matters: "Negative equity is a balance sheet constraint that requires additional context before assessing strength.", data_needed_next: ["balance sheet detail", "capital structure history"], source_fields: ["normalized_financials.shareholders_equity"] }));
  }
  if (hasValue(data.financial_metrics?.interest_coverage) && data.financial_metrics.interest_coverage < RISK_THRESHOLDS.weakInterestCoverageBelow) {
    signals.push(signal({ id: "weak_interest_coverage", category: "Balance Sheet and Leverage Risk", evidence: `Interest coverage is ${data.financial_metrics.interest_coverage.toFixed(2)}x, below the configured ${RISK_THRESHOLDS.weakInterestCoverageBelow}x threshold.`, why_it_matters: "Lower interest coverage can indicate less room to absorb earnings or rate pressure.", data_needed_next: ["interest expense detail", "debt maturity schedule"], source_fields: ["financial_metrics.interest_coverage"] }));
  }
}

function addCapitalAllocationSignals(data: NormalizedResearchData, signals: RiskSignal[]) {
  const pair = latestTwo(byYear(data.annual_history));
  if (pair && hasValue(pair[0].share_count) && hasValue(pair[1].share_count) && pair[1].share_count > pair[0].share_count) {
    signals.push(signal({ id: "share_dilution", category: "Capital Allocation Risk", evidence: `Share count increased from ${pair[0].share_count} in FY${pair[0].fiscal_year} to ${pair[1].share_count} in FY${pair[1].fiscal_year}.`, why_it_matters: "Share count growth can dilute per-share economics if not offset by earnings growth.", data_needed_next: ["share issuance detail", "stock compensation detail"], source_fields: ["annual_history.share_count"] }));
  }
  const fcf = data.financial_metrics?.free_cash_flow;
  const buybacks = data.normalized_financials?.buybacks;
  const dividends = data.normalized_financials?.dividends;
  if (hasValue(fcf) && fcf > 0) {
    if (hasValue(buybacks) && buybacks > fcf) signals.push(signal({ id: "buybacks_exceed_fcf", category: "Capital Allocation Risk", evidence: `Buybacks (${buybacks}) exceeded free cash flow (${fcf}).`, why_it_matters: "Buybacks above free cash flow may require cash balances, debt, or other funding sources.", data_needed_next: ["cash balance trend", "debt issuance detail"], source_fields: ["normalized_financials.buybacks", "financial_metrics.free_cash_flow"] }));
    if (hasValue(dividends) && dividends > fcf) signals.push(signal({ id: "dividends_exceed_fcf", category: "Capital Allocation Risk", evidence: `Dividends (${dividends}) exceeded free cash flow (${fcf}).`, why_it_matters: "Dividends above free cash flow may be less self-funded in the reported period.", data_needed_next: ["cash balance trend", "dividend policy detail"], source_fields: ["normalized_financials.dividends", "financial_metrics.free_cash_flow"] }));
    if (hasValue(buybacks) && hasValue(dividends) && buybacks + dividends > fcf) signals.push(signal({ id: "shareholder_returns_exceed_fcf", category: "Capital Allocation Risk", evidence: `Buybacks plus dividends (${buybacks + dividends}) exceeded free cash flow (${fcf}).`, why_it_matters: "Total shareholder returns above free cash flow can reduce cash or increase financing needs.", data_needed_next: ["cash balance trend", "debt issuance detail"], source_fields: ["normalized_financials.buybacks", "normalized_financials.dividends", "financial_metrics.free_cash_flow"] }));
  }
  if (pair && hasValue(data.normalized_financials?.buybacks) && data.normalized_financials.buybacks > 0 && hasValue(pair[0].share_count) && hasValue(pair[1].share_count) && pair[1].share_count >= pair[0].share_count) {
    signals.push(signal({ id: "buybacks_without_share_count_reduction", category: "Capital Allocation Risk", evidence: `Buybacks were reported, while share count did not decline from FY${pair[0].fiscal_year} to FY${pair[1].fiscal_year}.`, why_it_matters: "Buybacks without share count reduction may reflect offsetting issuance, but buyback quality cannot be judged without valuation and issuance context.", data_needed_next: ["stock compensation detail", "repurchase timing", "valuation context"], source_fields: ["normalized_financials.buybacks", "annual_history.share_count"] }));
  }
}

function addValuationSignals(data: NormalizedResearchData, signals: RiskSignal[]) {
  const valuation = data.valuation_metrics;
  if (!valuation) return;
  signals.push(signal({ id: "valuation_metrics_available", category: "Valuation Risk", severity: "Low", evidence: "Point-in-time valuation metrics are available from latest price and normalized fundamentals.", why_it_matters: "Valuation ratios can be discussed as reported metrics, but they do not support fair value or recommendation claims.", data_needed_next: ["peer comparison", "historical valuation percentile"], source_fields: ["valuation_metrics"] }));
  if (hasValue(valuation.pe) && valuation.pe > RISK_THRESHOLDS.peAbove) signals.push(signal({ id: "pe_above_configured_threshold", category: "Valuation Risk", evidence: `P/E is ${valuation.pe.toFixed(1)}x, above the configured ${RISK_THRESHOLDS.peAbove}x threshold.`, why_it_matters: "A ratio above the configured threshold flags the need for historical and peer context; it is not a valuation conclusion.", data_needed_next: ["peer comparison", "historical valuation percentile"], source_fields: ["valuation_metrics.pe"] }));
  if (hasValue(valuation.pfcf_ratio) && valuation.pfcf_ratio > RISK_THRESHOLDS.pfcfAbove) signals.push(signal({ id: "pfcf_above_configured_threshold", category: "Valuation Risk", evidence: `P/FCF is ${valuation.pfcf_ratio.toFixed(1)}x, above the configured ${RISK_THRESHOLDS.pfcfAbove}x threshold.`, why_it_matters: "A ratio above the configured threshold flags the need for historical and peer context; it is not a valuation conclusion.", data_needed_next: ["peer comparison", "historical valuation percentile"], source_fields: ["valuation_metrics.pfcf_ratio"] }));
  if (hasValue(valuation.fcf_yield) && valuation.fcf_yield < RISK_THRESHOLDS.fcfYieldBelow) signals.push(signal({ id: "fcf_yield_below_configured_threshold", category: "Valuation Risk", evidence: `FCF yield is ${pct(valuation.fcf_yield)}, below the configured ${pct(RISK_THRESHOLDS.fcfYieldBelow)} threshold.`, why_it_matters: "A yield below the configured threshold flags the need for historical and peer context; it is not a valuation conclusion.", data_needed_next: ["peer comparison", "historical valuation percentile"], source_fields: ["valuation_metrics.fcf_yield"] }));
  if (hasValue(valuation.earnings_yield) && valuation.earnings_yield < RISK_THRESHOLDS.earningsYieldBelow) signals.push(signal({ id: "earnings_yield_below_configured_threshold", category: "Valuation Risk", evidence: `Earnings yield is ${pct(valuation.earnings_yield)}, below the configured ${pct(RISK_THRESHOLDS.earningsYieldBelow)} threshold.`, why_it_matters: "A yield below the configured threshold flags the need for historical and peer context; it is not a valuation conclusion.", data_needed_next: ["peer comparison", "historical valuation percentile"], source_fields: ["valuation_metrics.earnings_yield"] }));
  if (!data.peer_comparison) signals.push(signal({ id: "valuation_available_but_peer_context_missing", category: "Valuation Risk", evidence: "Valuation metrics are available, but peer comparison is missing.", why_it_matters: "Peer context is needed before making relative valuation statements.", data_needed_next: ["peer comparison"], source_fields: ["valuation_metrics", "peer_comparison"] }));
  if (!valuation.historical_range_note) signals.push(signal({ id: "valuation_available_but_historical_percentile_missing", category: "Valuation Risk", evidence: "Valuation metrics are available, but historical percentile context is missing.", why_it_matters: "Historical context is needed before interpreting valuation ratios across time.", data_needed_next: ["historical valuation percentile"], source_fields: ["valuation_metrics.historical_range_note"] }));
}

function addThirteenFSignals(data: NormalizedResearchData, signals: RiskSignal[]) {
  const summary = data.thirteen_f_summary;
  if (!summary) return;
  signals.push(signal({ id: "short_holding_history", category: "13F Investor Signal Risk", severity: "Low", evidence: summary.coverage_note ?? "13F summary is available, but coverage is lagged and limited.", why_it_matters: "13F data supports disclosed historical holdings only, not real-time holdings or investor motivation.", data_needed_next: ["longer 13F history", "current filing updates"], source_fields: ["thirteen_f_summary.coverage_note"] }));
  const changes = summary.position_changes ?? [];
  const decreased = changes.filter((change) => change.action === "decreased").length;
  const increased = changes.filter((change) => change.action === "increased").length;
  const exited = changes.filter((change) => change.action === "exited").length;
  if (exited > 0) signals.push(signal({ id: "exited_holder_count_increase", category: "13F Investor Signal Risk", evidence: `${exited} disclosed 13F position change(s) are marked exited in the provided summary.`, why_it_matters: "Exited positions are lagged disclosed changes and require filing context before interpretation.", data_needed_next: ["multi-period 13F history"], source_fields: ["thirteen_f_summary.position_changes"] }));
  if (decreased > increased) signals.push(signal({ id: "more_decreased_than_increased", category: "13F Investor Signal Risk", evidence: `${decreased} disclosed decreases versus ${increased} disclosed increases in provided 13F changes.`, why_it_matters: "This is a lagged disclosure pattern only and does not indicate real-time institutional activity.", data_needed_next: ["multi-period 13F history"], source_fields: ["thirteen_f_summary.position_changes"] }));
}

function addDataQualitySignals(data: NormalizedResearchData, signals: RiskSignal[]) {
  if (!data.valuation_metrics) signals.push(signal({ id: "missing_valuation", category: "Data Quality Risk", severity: "Low", evidence: "Valuation metrics are missing.", why_it_matters: "Valuation ratios cannot be discussed without price and market-cap inputs.", data_needed_next: ["latest price", "shares outstanding"], source_fields: ["valuation_metrics"] }));
  if (!data.peer_comparison) signals.push(signal({ id: "missing_peer_comparison", category: "Data Quality Risk", severity: "Low", evidence: "Peer comparison is missing.", why_it_matters: "The workflow cannot determine whether the company is better than peers or an industry leader without peer data.", data_needed_next: ["peer comparison"], source_fields: ["peer_comparison"] }));
  if (!data.external_evidence) signals.push(signal({ id: "missing_external_evidence", category: "Data Quality Risk", severity: "Low", evidence: "External evidence is missing.", why_it_matters: "Regulatory, litigation, competition, churn, management, and geopolitical risks cannot be assessed without external evidence.", data_needed_next: ["external evidence"], source_fields: ["external_evidence"] }));
  const hasForward = Boolean(data.growth_metrics?.guidance || data.growth_metrics?.analyst_estimates || data.growth_metrics?.backlog || data.growth_metrics?.bookings || data.growth_metrics?.rpo || data.growth_metrics?.deferred_revenue);
  if (!hasForward) signals.push(signal({ id: "missing_forward_looking_data", category: "Data Quality Risk", severity: "Low", evidence: "Forward-looking data such as guidance, estimates, backlog, bookings, RPO, or deferred revenue is missing.", why_it_matters: "Future growth trajectory cannot be assessed from historical annual facts alone.", data_needed_next: ["guidance", "estimates", "backlog", "RPO"], source_fields: ["growth_metrics"] }));
  if (!data.growth_metrics?.growth_drivers?.length && !hasForward) signals.push(signal({ id: "missing_segment_or_guidance_data", category: "Data Quality Risk", severity: "Low", evidence: "Segment growth drivers and guidance data are missing.", why_it_matters: "The workflow cannot separate growth drivers by segment or assess visibility without these fields.", data_needed_next: ["segment growth", "guidance"], source_fields: ["growth_metrics.growth_drivers", "growth_metrics.guidance"] }));
}

export function generateRiskSignals(data: NormalizedResearchData): { signals: RiskSignal[] } {
  const signals: RiskSignal[] = [];
  addGrowthSignals(data, signals);
  addMarginSignals(data, signals);
  addFcfSignals(data, signals);
  addBalanceSheetSignals(data, signals);
  addCapitalAllocationSignals(data, signals);
  addValuationSignals(data, signals);
  addThirteenFSignals(data, signals);
  addDataQualitySignals(data, signals);
  return { signals };
}
