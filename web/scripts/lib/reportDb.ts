import type { ReportRow } from "../../src/lib/reports/types";

export function mapRow(r: any): ReportRow {
  return {
    period: r.period, status: r.status, payload: r.payload, payloadHash: r.payload_hash,
    coverageFiled: r.coverage_filed, coverageTotal: r.coverage_total, valuationAsOf: r.valuation_as_of,
    firstLiveAt: r.first_live_at, generatedAt: r.generated_at, previewPayload: r.preview_payload,
    previewValuationAsOf: r.preview_valuation_as_of, previewSentAt: r.preview_sent_at,
    finalizedAt: r.finalized_at, sends: r.sends ?? {},
  };
}

export async function readReport(db: any, period: string): Promise<ReportRow | null> {
  const { data, error } = await db.from("quarterly_reports").select("*").eq("period", period).maybeSingle();
  if (error) throw new Error(`quarterly_reports read: ${error.message}`);
  return data ? mapRow(data) : null;
}
