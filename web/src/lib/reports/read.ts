import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb, withRetry } from "@/lib/managers/db";
import type { ReportRow, ReportStatus } from "./types";

function mapRow(r: Record<string, any>): ReportRow {
  return {
    period: r.period, status: r.status, payload: r.payload, payloadHash: r.payload_hash,
    coverageFiled: r.coverage_filed, coverageTotal: r.coverage_total, valuationAsOf: r.valuation_as_of,
    firstLiveAt: r.first_live_at, generatedAt: r.generated_at, previewPayload: null,
    previewValuationAsOf: null, previewSentAt: null, finalizedAt: r.finalized_at, sends: {},
  };
}

/** 读一份报告。页面只需要公开字段:不取 preview_* 与 sends(既省 egress,也不把未定稿预览暴露到页面)。 */
export const readReportRow = cache(async (period: string): Promise<ReportRow | null> => {
  if (!hasSupabaseEnv()) return null;
  try {
    const { data, error } = await withRetry(() =>
      getDb().from("quarterly_reports")
        .select("period,status,payload,payload_hash,coverage_filed,coverage_total,valuation_as_of,first_live_at,generated_at,finalized_at")
        .eq("period", period).maybeSingle(),
    );
    if (error) {
      const code = (error as { code?: string }).code;
      if (code !== "42P01" && code !== "PGRST205") console.error(`readReportRow 失败: ${(error as Error).message}`);
      return null;
    }
    return data ? mapRow(data) : null;
  } catch (e) {
    console.error(`readReportRow 异常: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
});

export const listReportPeriods = cache(async (): Promise<Array<{ period: string; generatedAt: string; status: ReportStatus }>> => {
  if (!hasSupabaseEnv()) return [];
  try {
    const { data, error } = await withRetry(() =>
      getDb().from("quarterly_reports").select("period,generated_at,status").order("period", { ascending: false }),
    );
    if (error) return [];
    return (data ?? []).map((r: any) => ({ period: r.period, generatedAt: r.generated_at, status: r.status }));
  } catch {
    return [];
  }
});
