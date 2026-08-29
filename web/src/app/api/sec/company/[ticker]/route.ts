import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { normalizeTicker } from "@/lib/sec/company-universe";
import { CFP_SELECT } from "@/lib/sec/columns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await context.params;
  const ticker = rawTicker.toUpperCase();
  const normalizedTicker = normalizeTicker(ticker);
  const supabase = createServiceSupabaseClient();

  const [{ data: company }, { data: filings }, { data: periods }, { data: latest }] = await Promise.all([
    supabase.from("sec_companies").select("*").eq("normalized_ticker", normalizedTicker).maybeSingle(),
    supabase.from("sec_filings").select("*").eq("ticker", ticker).order("filing_date", { ascending: false }).limit(24),
    supabase.from("company_fundamentals_periods").select(CFP_SELECT).eq("ticker", ticker).order("period_end", { ascending: false }).limit(32),
    supabase.from("company_fundamentals_latest").select("*").eq("ticker", ticker).maybeSingle()
  ]);

  const annual = (periods ?? []).filter((period) => period.fiscal_period === "FY");
  const quarterly = (periods ?? []).filter((period) => period.fiscal_period !== "FY").slice(0, 8);
  const latestFilingDate = filings?.[0]?.filing_date ?? null;
  const stale = latestFilingDate ? Date.now() - new Date(latestFilingDate).getTime() > 550 * 24 * 60 * 60 * 1000 : true;

  return NextResponse.json({
    company,
    filings: filings ?? [],
    annual,
    quarterly,
    latest,
    quality: {
      missing_fields: annual[0]?.missing_fields ?? quarterly[0]?.missing_fields ?? {},
      foreign_issuer: company?.is_foreign_issuer ?? false,
      latest_filing_is_stale: stale,
      confidence: latest?.quality_status ?? (company ? "low" : "missing")
    }
  }, {
    // 公开无鉴权端点。数据日级更新,让 CDN 吃掉重复请求,否则每次调用都直读库。
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" },
  });
}
