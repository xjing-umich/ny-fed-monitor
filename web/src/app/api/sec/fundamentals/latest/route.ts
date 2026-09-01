import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 覆盖当前全表(约 3k 票)且留足冗余;防止端点被当成无界导出口。 */
const LATEST_LIMIT = 10000;

export async function GET() {
  const supabase = createServiceSupabaseClient();
  // 公开无鉴权端点,原本无 limit 直拉整表 —— 每次请求一次全表 egress。上闸 + 交给 CDN。
  const { data, error } = await supabase
    .from("company_fundamentals_latest")
    .select("*")
    .order("ticker", { ascending: true })
    .limit(LATEST_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] }, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" },
  });
}
