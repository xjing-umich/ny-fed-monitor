import { NextRequest, NextResponse } from "next/server";
import { ingestAllCompanies } from "@/lib/sec/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const limit = typeof body.limit === "number" ? body.limit : undefined;
  const summary = await ingestAllCompanies(limit);
  return NextResponse.json(summary);
}
