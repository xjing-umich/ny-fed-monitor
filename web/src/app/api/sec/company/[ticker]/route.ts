import { NextRequest, NextResponse } from "next/server";
import { getSecCompanyData } from "@/lib/sec/read";
import { isIdentityQuarantined } from "@/lib/securities/securityIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await context.params;
  const ticker = rawTicker.toUpperCase();
  let data;
  try { data = await getSecCompanyData(ticker); }
  catch { return NextResponse.json({ error: "Financial data is temporarily unavailable" }, { status: 503 }); }
  const { company, filings, annual, quarterly, latest } = data;
  const latestFilingDate = filings?.[0]?.filing_date ?? null;
  const stale = latestFilingDate ? Date.now() - new Date(latestFilingDate).getTime() > 550 * 24 * 60 * 60 * 1000 : true;

  return NextResponse.json({
    company,
    filings: filings ?? [],
    annual,
    quarterly,
    latest,
    interim_disclosures: data.interim,
    quality: {
      identity_conflict: isIdentityQuarantined(ticker),
      interim_schema_available: data.interim.schemaAvailable,
      interim_evidence_incomplete: data.interim.incomplete,
      missing_fields: annual[0]?.missing_fields ?? quarterly[0]?.missing_fields ?? {},
      foreign_issuer: company?.is_foreign_issuer ?? false,
      latest_filing_is_stale: stale,
      confidence: latest?.quality_status ?? (company ? "low" : "missing")
    }
  }, {
    // 公开无鉴权端点。数据日级更新,让 CDN 吃掉重复请求,否则每次调用都直读库。
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" },
  });
}
