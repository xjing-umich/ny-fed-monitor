import { financialIngestHttpStatus } from "@/lib/sec/ingestOutcome";
import { publishFinancialPages } from "@/lib/sec/publishPages";
import { getDb } from "@/lib/managers/db";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedIngestRequest, unauthorizedResponse } from "@/lib/ingestion/auth";
import { ingestCompany } from "@/lib/sec/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorizedIngestRequest(request)) return unauthorizedResponse();
  const body = await request.json().catch(() => ({}));
  const ticker = body.ticker;

  if (!ticker || typeof ticker !== "string") {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const result = await ingestCompany(ticker);
  await publishFinancialPages(getDb());
  return NextResponse.json(result, { status: financialIngestHttpStatus(result) });
}
