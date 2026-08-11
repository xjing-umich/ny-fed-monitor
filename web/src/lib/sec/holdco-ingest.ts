import { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedFiling } from "./company-submissions";
import { filingIndexUrl, secFetchJson, secFetchText, sleep } from "./sec-client";
import { extractInstanceFacts } from "./instance-facts";
import { extractHoldcoInvestments } from "./holdco-investments";
import { extractSegmentYears } from "./segment-facts";

// 窄闸谓词与读取侧共用一份(见 holdco-gate.ts);此处再导出,调用方沿用原 import 路径。
export { needsHoldcoSotp } from "./holdco-gate";

/** 每票最多解析的 10-K 份数。每份带 3 个 FY,2 份足够覆盖 3 年窗口并留冗余。 */
const MAX_10K_INSTANCES = 2;

type EdgarIndex = { directory?: { item?: { name?: string }[] } };

/** 提取版 instance 文件名 = primaryDocument 去 .htm 加 _htm.xml;404 时回退读目录 index.json
 *  找 *_htm.xml。照抄 class-shares-fallback.ts 已跑通的 fetchInstanceXml。 */
async function fetchInstanceXml(filing: NormalizedFiling): Promise<string | null> {
  const dir = filingIndexUrl(filing.cik, filing.accession_number);
  const guess = filing.primary_document?.replace(/\.htm$/i, "_htm.xml");
  if (guess) {
    try {
      return await secFetchText(`${dir}${guess}`);
    } catch {
      // 落到目录枚举
    }
  }
  try {
    const index = await secFetchJson<EdgarIndex>(`${dir}index.json`);
    const name = index.directory?.item?.map((i) => i.name).find((n) => n?.endsWith("_htm.xml"));
    if (!name) return null;
    return await secFetchText(`${dir}${name}`);
  } catch {
    return null;
  }
}

/**
 * 拉最近 MAX_10K_INSTANCES 份 10-K 的 instance,写 company_holdco_investments、
 * company_segment_years 与 company_segment_periods。任何一步失败都**只记零、不 throw** ——
 * 件⑤是增量能力,不得让它把既有 fundamentals ingest 带崩。
 *
 * 但「不 throw」不等于「不出声」:三次 upsert 的 error 一律 console.warn 打出来。此前失败分支
 * 什么都不做,于是「migration 没 apply」「表名/列名写错」「key 权限不足」这三种最可能的上线
 * 故障,全都表现为跑完毫无输出、表里零行 —— 与「这票本来就不触发窄闸」完全无法区分。
 */
export async function ingestHoldcoSotp(
  supabase: SupabaseClient,
  ticker: string,
  filings: NormalizedFiling[],
): Promise<{ investments: number; segment_years: number; segment_rows: number }> {
  const out = { investments: 0, segment_years: 0, segment_rows: 0 };
  try {
    const tenKs = filings
      .filter((f) => f.form === "10-K" && f.primary_document)
      .sort((a, b) => (b.filing_date ?? "").localeCompare(a.filing_date ?? ""))
      .slice(0, MAX_10K_INSTANCES);
    if (!tenKs.length) return out;

    const investmentRows: Record<string, unknown>[] = [];
    const yearRows: Record<string, unknown>[] = [];
    const segmentRows: Record<string, unknown>[] = [];

    for (const filing of tenKs) {
      const xml = await fetchInstanceXml(filing);
      await sleep(300); // SEC 速率礼节,与既有 class-shares-fallback 同口径
      if (!xml) continue;
      const facts = extractInstanceFacts(xml);

      // 第一栏:只对该 10-K 的报告期时点取,period_end 取自 filing.report_date
      // (NormalizedFiling 上的报告期字段;normalize-facts.ts 用它与 draft.period_end 做匹配,
      // 二者同为 YYYY-MM-DD 字符串)。
      const periodEnd = filing.report_date ?? null;
      if (periodEnd) {
        const inv = extractHoldcoInvestments(facts, periodEnd);
        if (inv) {
          investmentRows.push({
            ticker,
            period_end: inv.period_end,
            fiscal_period: "FY",
            cash: inv.cash,
            treasuries: inv.treasuries,
            equity_securities: inv.equity_securities,
            equity_method: inv.equity_method,
            afs_debt: inv.afs_debt,
            total: inv.total,
            unrealized_gain: inv.unrealized_gain,
            gate_attribution_ok: inv.gate_attribution_ok,
            gate_closure_ok: inv.gate_closure_ok,
            gate_upper_bound_ok: inv.gate_upper_bound_ok,
            raw_facts: { source: filing.filing_url },
            updated_at: new Date().toISOString(),
          });
        }
      }

      // 第二、三栏:一份 10-K 带 3 个 FY,全收。
      // 年度级聚合量(引擎唯一吃的那批)进 company_segment_years,一年一行、有真列;逐分部
      // 明细进 company_segment_periods,供页面展示与人工审计。此前把年度量塞进**每条**分部行的
      // raw_facts,既让读取侧被迫从 jsonb 反解析,又没有任何约束保证同年各行一致。
      for (const year of extractSegmentYears(facts)) {
        yearRows.push({
          ticker,
          period_end: year.period_end,
          fiscal_period: "FY",
          total_pretax: year.total_pretax,
          total_tax: year.total_tax,
          insurance_pretax: year.insurance_pretax,
          insurance_tax: year.insurance_tax,
          underwriting_pretax: year.underwriting_pretax,
          investments_pretax: year.investments_pretax,
          segments_pretax_sum: year.segments_pretax_sum,
          source_url: filing.filing_url,
          updated_at: new Date().toISOString(),
        });
        for (const seg of year.segments) {
          segmentRows.push({
            ticker,
            period_end: seg.period_end,
            fiscal_period: "FY",
            segment_member: seg.segment_member,
            segment_label: seg.segment_label,
            kind: seg.kind,
            pretax_income: seg.pretax_income,
            income_tax: seg.income_tax,
            raw_facts: { source: filing.filing_url },
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    /** 去重后 upsert;失败必出声(静默失败 = 上线故障与「本就不触发」无法区分)。 */
    const flush = async (
      table: string,
      rows: Record<string, unknown>[],
      keyOf: (r: Record<string, unknown>) => string,
      onConflict: string,
    ): Promise<number> => {
      if (!rows.length) return 0;
      const unique = Array.from(new Map(rows.map((r) => [keyOf(r), r])).values());
      const { error } = await supabase.from(table).upsert(unique, { onConflict });
      if (error) {
        console.warn(`  ${ticker}: ${table} upsert 失败(件⑤ 该票退回件④抑制): ${error.message}`);
        return 0;
      }
      return unique.length;
    };

    out.investments = await flush(
      "company_holdco_investments", investmentRows,
      (r) => `${r.ticker}|${r.period_end}|${r.fiscal_period}`, "ticker,period_end,fiscal_period",
    );
    out.segment_years = await flush(
      "company_segment_years", yearRows,
      (r) => `${r.ticker}|${r.period_end}|${r.fiscal_period}`, "ticker,period_end,fiscal_period",
    );
    out.segment_rows = await flush(
      "company_segment_periods", segmentRows,
      (r) => `${r.ticker}|${r.period_end}|${r.fiscal_period}|${r.segment_member}`,
      "ticker,period_end,fiscal_period,segment_member",
    );
  } catch (err) {
    // 降级但不静默:件⑤不可得 → 该票退回件④的抑制状态,不影响其余 ingest。
    console.warn(`  ${ticker}: 件⑤ 取数失败(退回件④抑制): ${err instanceof Error ? err.message : String(err)}`);
  }
  return out;
}
