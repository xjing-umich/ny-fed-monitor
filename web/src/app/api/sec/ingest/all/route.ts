import { publishFinancialPages } from "@/lib/sec/publishPages";
import { getDb } from "@/lib/managers/db";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedIngestRequest, unauthorizedResponse } from "@/lib/ingestion/auth";
import { ingestAllCompanies } from "@/lib/sec/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorizedIngestRequest(request)) return unauthorizedResponse();
  const body = await request.json().catch(() => ({}));
  const limit = typeof body.limit === "number" ? body.limit : undefined;
  const summary = await ingestAllCompanies(limit);
  await publishFinancialPages(getDb());
  return NextResponse.json(summary);
}
