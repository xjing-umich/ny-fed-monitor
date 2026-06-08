import { NextResponse } from "next/server";
import { msftResearchMock } from "@/lib/research/mock/msftResearchMock";
import { buildSecResearchDataForTicker, emptySecResearchData } from "@/lib/research/sec/buildSecResearchData";
import { buildValuationForResearchData } from "@/lib/research/valuation/buildValuationData";
import { generateRiskSignals } from "@/lib/research/risk/generateRiskSignals";
import { runResearchWorkflow } from "@/lib/research/workflow/runResearchWorkflow";

type RouteContext = {
  params: Promise<{ ticker: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { ticker } = await context.params;
  const url = new URL(request.url);
  const useMock = url.searchParams.get("mock") === "true";

  if (useMock) {
    const normalizedData = {
      ...msftResearchMock,
      ticker: ticker.toUpperCase(),
      company_name: ticker.toUpperCase() === "MSFT" ? msftResearchMock.company_name : `${ticker.toUpperCase()} mock research profile`,
    };
    const valuation = await buildValuationForResearchData(normalizedData, { mock: true });
    const withValuation = { ...normalizedData, valuation_metrics: valuation.valuation_metrics };
    const riskSignals = generateRiskSignals(withValuation);
    const workflowInput = { ...withValuation, risk_signals: riskSignals };
    return NextResponse.json({
      ...runResearchWorkflow(ticker, workflowInput),
      data_source_status: {
        source: "MOCK",
        status: "available",
      },
      valuation_source_status: valuation.valuation_source_status,
      valuation_metrics: valuation.valuation_metrics,
      risk_source_status: {
        source: "SYSTEM_DERIVED_RISK_SIGNAL",
        status: "available",
        signal_count: riskSignals.signals.length,
      },
      risk_signals: riskSignals.signals,
    });
  }

  try {
    const result = await buildSecResearchDataForTicker(ticker);
    const valuation = await buildValuationForResearchData(result.normalizedData);
    const withValuation = { ...result.normalizedData, valuation_metrics: valuation.valuation_metrics };
    const riskSignals = generateRiskSignals(withValuation);
    const workflowInput = { ...withValuation, risk_signals: riskSignals };
    return NextResponse.json({
      ...runResearchWorkflow(ticker, workflowInput),
      data_source_status: result.sec,
      valuation_source_status: valuation.valuation_source_status,
      valuation_metrics: valuation.valuation_metrics,
      risk_source_status: {
        source: "SYSTEM_DERIVED_RISK_SIGNAL",
        status: "available",
        signal_count: riskSignals.signals.length,
      },
      risk_signals: riskSignals.signals,
    });
  } catch (error) {
    void error;
    const fallback = emptySecResearchData(ticker);
    const valuation = await buildValuationForResearchData(fallback.normalizedData).catch(() => undefined);
    const riskSignals = generateRiskSignals(fallback.normalizedData);
    return NextResponse.json(
      {
        ...runResearchWorkflow(ticker, { ...fallback.normalizedData, risk_signals: riskSignals }),
        data_source_status: fallback.sec,
        valuation_source_status: valuation?.valuation_source_status ?? {
          source: "NONE",
          status: "unavailable",
          data_quality: {
            has_price: false,
            has_market_cap: false,
            has_enterprise_value: false,
            has_pe: false,
            has_ps: false,
            has_pfcf: false,
            has_fcf_yield: false,
            missing_valuation_fields: ["price", "market_cap", "enterprise_value", "pe", "ps", "pfcf", "fcf_yield"],
            valuation_confidence: "Low",
          },
          message: "SEC data unavailable; valuation metrics were not calculated.",
        },
        risk_source_status: {
          source: "SYSTEM_DERIVED_RISK_SIGNAL",
          status: "available",
          signal_count: riskSignals.signals.length,
        },
        risk_signals: riskSignals.signals,
      },
      { status: 200 },
    );
  }
}
