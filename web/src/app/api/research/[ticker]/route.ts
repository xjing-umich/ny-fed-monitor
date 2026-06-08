import { NextResponse } from "next/server";
import { msftResearchMock } from "@/lib/research/mock/msftResearchMock";
import { runResearchWorkflow } from "@/lib/research/workflow/runResearchWorkflow";

type RouteContext = {
  params: Promise<{ ticker: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { ticker } = await context.params;
  const normalizedData = {
    ...msftResearchMock,
    ticker: ticker.toUpperCase(),
    company_name: ticker.toUpperCase() === "MSFT" ? msftResearchMock.company_name : `${ticker.toUpperCase()} mock research profile`,
  };

  return NextResponse.json(runResearchWorkflow(ticker, normalizedData));
}
