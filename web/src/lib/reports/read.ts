import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb, withRetry } from "@/lib/managers/db";
import type { ReportPayload, ReportRow, ReportStatus } from "./types";

/** 页面读取的公开列(不含 preview_* 与 sends)。 */
type PublicReportDbRow = {
  period: string;
  status: ReportStatus;
  payload: ReportPayload;
  payload_hash: string;
  coverage_filed: number;
  coverage_total: number;
  valuation_as_of: string | null;
  first_live_at: string;
  generated_at: string;
  finalized_at: string | null;
};
type ReportListDbRow = Pick<PublicReportDbRow, "period" | "generated_at" | "finalized_at" | "status">;

function mapRow(r: PublicReportDbRow): ReportRow {
  return {
    period: r.period, status: r.status, payload: r.payload, payloadHash: r.payload_hash,
    coverageFiled: r.coverage_filed, coverageTotal: r.coverage_total, valuationAsOf: r.valuation_as_of,
    firstLiveAt: r.first_live_at, generatedAt: r.generated_at, previewPayload: null,
    previewValuationAsOf: null, previewSentAt: null, finalizedAt: r.finalized_at, sends: {},
  };
}

const isMissingTable = (error: unknown): boolean => {
  const code = (error as { code?: string }).code;
  return code === "42P01" || code === "PGRST205";
};

/**
 * 读一份报告。页面只需要公开字段:不取 preview_* 与 sends(既省 egress,也不把未定稿预览暴露到页面)。
 * 返回 null 仅限:无 Supabase env、表不存在、查询成功但无此行。
 * 其它错误一律 throw(→ 500/构建失败),绝不转成 null → notFound() 缓存 7 天假 404(见 managers/db.ts withRetry 契约)。
 */
export const readReportRow = cache(async (period: string): Promise<ReportRow | null> => {
  if (!hasSupabaseEnv()) return null;
  try {
    const { data, error } = await withRetry(() =>
      getDb().from("quarterly_reports")
        .select("period,status,payload,payload_hash,coverage_filed,coverage_total,valuation_as_of,first_live_at,generated_at,finalized_at")
        .eq("period", period).maybeSingle(),
    );
    if (error) {
      if (isMissingTable(error)) return null;
      throw new Error(`readReportRow 失败: ${(error as Error).message}`);
    }
    return data ? mapRow(data as PublicReportDbRow) : null;
  } catch (e) {
    console.error(`readReportRow 异常: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
});

/** 无 env / 表不存在 → [];其它错误 throw(generateStaticParams 在真实故障时让构建大声失败)。 */
export type ReportListing = { period: string; generatedAt: string; finalizedAt: string | null; status: ReportStatus };

export const listReportPeriods = cache(async (): Promise<ReportListing[]> => {
  if (!hasSupabaseEnv()) return [];
  try {
    const { data, error } = await withRetry(() =>
      getDb().from("quarterly_reports").select("period,generated_at,finalized_at,status").order("period", { ascending: false }),
    );
    if (error) {
      if (isMissingTable(error)) return [];
      throw new Error(`listReportPeriods 失败: ${(error as Error).message}`);
    }
    return ((data ?? []) as ReportListDbRow[]).map((r) => ({
      period: r.period, generatedAt: r.generated_at, finalizedAt: r.finalized_at, status: r.status,
    }));
  } catch (e) {
    console.error(`listReportPeriods 异常: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
});
