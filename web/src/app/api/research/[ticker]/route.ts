import { NextResponse } from "next/server";
import { msftResearchMock } from "@/lib/research/mock/msftResearchMock";
import { buildSecResearchDataForTicker, emptySecResearchData } from "@/lib/research/sec/buildSecResearchData";
import { buildValuationForResearchData } from "@/lib/research/valuation/buildValuationData";
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
    const workflowInput = { ...normalizedData, valuation_metrics: valuation.valuation_metrics };
    return NextResponse.json({
      ...runResearchWorkflow(ticker, workflowInput),
      data_source_status: {
        source: "MOCK",
        status: "available",
      },
      valuation_source_status: valuation.valuation_source_status,
      valuation_metrics: valuation.valuation_metrics,
    });
  }

  try {
    const result = await buildSecResearchDataForTicker(ticker);
    const valuation = await buildValuationForResearchData(result.normalizedData);
    const workflowInput = { ...result.normalizedData, valuation_metrics: valuation.valuation_metrics };
    return NextResponse.json({
      ...runResearchWorkflow(ticker, workflowInput),
      data_source_status: result.sec,
      valuation_source_status: valuation.valuation_source_status,
      valuation_metrics: valuation.valuation_metrics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SEC data error";
    const fallback = emptySecResearchData(ticker, message);
    const valuation = await buildValuationForResearchData(fallback.normalizedData).catch(() => undefined);
    return NextResponse.json(
      {
        ...runResearchWorkflow(ticker, fallback.normalizedData),
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
      },
      { status: 200 },
    );
  }
}
