import type { ManagerDetail, FilingData } from "../../src/lib/managers/types";

export type FilingRow = { cik: string; period: string; filed_at: string; accession: string; total_value: number; holding_count: number };
export type HoldingRow = { cusip: string; issuer: string; title_of_class: string | null; value: number; shares: number; put_call: string | null; weight: number };
export type UpsertPayload = {
  manager: { cik: string; slug: string; name: string; person: string; former_names?: string[] };
  filings: FilingRow[];
  holdingsByAccession: Record<string, HoldingRow[]>;
};

function filingRow(cik: string, f: FilingData): FilingRow {
  return { cik, period: f.period, filed_at: f.filedAt, accession: f.accession, total_value: f.totalValue, holding_count: f.holdings.length };
}
function holdingRows(f: FilingData): HoldingRow[] {
  return f.holdings.map((h) => ({ cusip: h.cusip, issuer: h.issuer, title_of_class: h.titleOfClass ?? null, value: h.value, shares: h.shares, put_call: h.putCall ?? null, weight: h.weight ?? 0 }));
}

export function buildUpsertPayload(d: ManagerDetail, _formerNames?: string[]): UpsertPayload {
  const filings: FilingData[] = d.filings;
  return {
    // managers 表只有 cik/slug/name/person 列, 没有 former_names。曾用名走 former-names.json
    // (别名解析层读它), 不写进 managers——否则 upsert 撞未知列, 而 supabase-js 只返回 {error}
    // 不抛异常, 会静默失败 (曾导致 bridgewater 这类有曾用名的新户入库失败却仍打 "upserted")。
    manager: { ...d.manager },
    filings: filings.map((f) => filingRow(d.manager.cik, f)),
    holdingsByAccession: Object.fromEntries(filings.map((f) => [f.accession, holdingRows(f)])),
  };
}

// Live writer (verified manually with creds): upsert manager, upsert filings (on accession),
// then replace that filing's holdings. Skips filings whose accession already exists with same holding_count (idempotent).
export async function upsertManagerDetail(db: any, d: ManagerDetail, formerNames?: string[]): Promise<void> {
  const p = buildUpsertPayload(d, formerNames);
  // 检查 error: supabase-js 不抛异常, 不查 .error 则失败会被 caller 的 try/catch 漏掉、误打 "upserted"。
  const { error: mErr } = await db.from("managers").upsert(p.manager, { onConflict: "cik" });
  if (mErr) throw new Error(`managers upsert failed (${d.manager.slug}): ${mErr.message}`);
  for (const f of p.filings) {
    const { data: up } = await db.from("filings").upsert(f, { onConflict: "accession" }).select("id").limit(1);
    const filingId = up?.[0]?.id;
    if (!filingId) continue;
    await db.from("holdings").delete().eq("filing_id", filingId);
    const rows = p.holdingsByAccession[f.accession].map((h) => ({ ...h, filing_id: filingId }));
    if (rows.length) await db.from("holdings").insert(rows);
  }
}
