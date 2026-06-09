import { NextRequest, NextResponse } from "next/server";
import { ingestCompany } from "@/lib/sec/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ticker = body.ticker;

  if (!ticker || typeof ticker !== "string") {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const result = await ingestCompany(ticker);
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}
