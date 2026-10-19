import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportPayload, ReportRow, ReportSends, ReportStatus } from "../../src/lib/reports/types";

/** quarterly_reports 一行(数据库 snake_case 原样)。 */
export type ReportDbRow = {
  period: string;
  status: ReportStatus;
  payload: ReportPayload;
  payload_hash: string;
  coverage_filed: number;
  coverage_total: number;
  valuation_as_of: string | null;
  first_live_at: string;
  generated_at: string;
  preview_payload: ReportPayload | null;
  preview_valuation_as_of: string | null;
  preview_sent_at: string | null;
  finalized_at: string | null;
  sends: ReportSends | null;
};

export function mapRow(r: ReportDbRow): ReportRow {
  return {
    period: r.period, status: r.status, payload: r.payload, payloadHash: r.payload_hash,
    coverageFiled: r.coverage_filed, coverageTotal: r.coverage_total, valuationAsOf: r.valuation_as_of,
    firstLiveAt: r.first_live_at, generatedAt: r.generated_at, previewPayload: r.preview_payload,
    previewValuationAsOf: r.preview_valuation_as_of, previewSentAt: r.preview_sent_at,
    finalizedAt: r.finalized_at, sends: r.sends ?? {},
  };
}

export async function readReport(db: SupabaseClient, period: string): Promise<ReportRow | null> {
  const { data, error } = await db.from("quarterly_reports").select("*").eq("period", period).maybeSingle();
  if (error) throw new Error(`quarterly_reports read: ${error.message}`);
  return data ? mapRow(data as ReportDbRow) : null;
}

/** 其它季度里至少有一种语言真正发出(sentAt 非空)的期数。sendPreview 与 finalize 共用,保证预览里的“首期句”与真实发送一致。 */
export function countSentIssues(rows: Array<{ period: string; sends: ReportSends | null }>, period: string): number {
  return rows.filter((r) => r.period !== period && Object.values(r.sends ?? {}).some((s) => !!s?.sentAt)).length;
}

export async function countPriorIssues(db: SupabaseClient, period: string): Promise<number> {
  const { data, error } = await db.from("quarterly_reports").select("period,sends");
  if (error) throw new Error(`读历史发送记录失败: ${error.message}`);
  return countSentIssues((data ?? []) as Array<{ period: string; sends: ReportSends | null }>, period);
}
