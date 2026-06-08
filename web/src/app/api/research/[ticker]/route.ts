import { NextResponse } from "next/server";
import { msftResearchMock } from "@/lib/research/mock/msftResearchMock";
import { buildSecResearchDataForTicker, emptySecResearchData } from "@/lib/research/sec/buildSecResearchData";
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
    return NextResponse.json({
      ...runResearchWorkflow(ticker, normalizedData),
      data_source_status: {
        source: "MOCK",
        status: "available",
      },
    });
  }

  try {
    const result = await buildSecResearchDataForTicker(ticker);
    return NextResponse.json({
      ...runResearchWorkflow(ticker, result.normalizedData),
      data_source_status: result.sec,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SEC data error";
    const fallback = emptySecResearchData(ticker, message);
    return NextResponse.json(
      {
        ...runResearchWorkflow(ticker, fallback.normalizedData),
        data_source_status: fallback.sec,
      },
      { status: 200 },
    );
  }
}
