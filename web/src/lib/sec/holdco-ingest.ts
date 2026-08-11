import { SupabaseClient } from "@supabase/supabase-js";
import type { FundamentalPeriod } from "./normalize-facts";
import type { NormalizedFiling } from "./company-submissions";
import { filingIndexUrl, secFetchJson, secFetchText, sleep } from "./sec-client";
import { extractInstanceFacts } from "./instance-facts";
import { extractHoldcoInvestments } from "./holdco-investments";
import { extractSegmentYears } from "./segment-facts";

/**
 * 件⑤ 窄闸:只有件④会判为 holdco_not_assessable 的那类主体才拉 instance 解析。
 *
 * 这里用**取数侧可得的代理条件**复刻件④的触发形状(引擎侧的 holdco_not_assessable 依赖估值
 * 中间量,ingest 时算不出来):有投资性重估损益(marks 的原料)+ 全窗口无营业利润。作用域被
 * 天然框住,其余票零新增取数。宁可窄:漏触发只是没有 SOTP(退回件④抑制),误触发才是浪费。
 */
export function needsHoldcoSotp(annual: FundamentalPeriod[]): boolean {
  if (annual.length < 3) return false;
  const hasMarks = annual.filter((p) => p.investment_fv_gain_loss != null).length >= 3;
  const noOperatingIncome = annual.every((p) => p.operating_income == null);
  return hasMarks && noOperatingIncome;
}

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
 * 拉最近 MAX_10K_INSTANCES 份 10-K 的 instance,写 company_holdco_investments 与
 * company_segment_periods。任何一步失败都**只记零、不 throw** —— 件⑤是增量能力,不得
 * 让它把既有 fundamentals ingest 带崩。
 */
export async function ingestHoldcoSotp(
  supabase: SupabaseClient,
  ticker: string,
  annual: FundamentalPeriod[],
  filings: NormalizedFiling[],
): Promise<{ investments: number; segment_rows: number }> {
  const out = { investments: 0, segment_rows: 0 };
  try {
    const tenKs = filings
      .filter((f) => f.form === "10-K" && f.primary_document)
      .sort((a, b) => (b.filing_date ?? "").localeCompare(a.filing_date ?? ""))
      .slice(0, MAX_10K_INSTANCES);
    if (!tenKs.length) return out;

    const investmentRows: Record<string, unknown>[] = [];
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
            raw_facts: { source: filing.filing_url },
            updated_at: new Date().toISOString(),
          });
        }
      }

      // 第二、三栏:一份 10-K 带 3 个 FY,全收。
      for (const year of extractSegmentYears(facts)) {
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
            raw_facts: {
              total_pretax: year.total_pretax,
              total_tax: year.total_tax,
              insurance_pretax: year.insurance_pretax,
              insurance_tax: year.insurance_tax,
              underwriting_pretax: year.underwriting_pretax,
              investments_pretax: year.investments_pretax,
              source: filing.filing_url,
            },
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    if (investmentRows.length) {
      const unique = Array.from(
        new Map(investmentRows.map((r) => [`${r.ticker}|${r.period_end}|${r.fiscal_period}`, r])).values(),
      );
      const { error } = await supabase
        .from("company_holdco_investments")
        .upsert(unique, { onConflict: "ticker,period_end,fiscal_period" });
      if (!error) out.investments = unique.length;
    }
    if (segmentRows.length) {
      const unique = Array.from(
        new Map(
          segmentRows.map((r) => [`${r.ticker}|${r.period_end}|${r.fiscal_period}|${r.segment_member}`, r]),
        ).values(),
      );
      const { error } = await supabase
        .from("company_segment_periods")
        .upsert(unique, { onConflict: "ticker,period_end,fiscal_period,segment_member" });
      if (!error) out.segment_rows = unique.length;
    }
  } catch {
    // 静默降级:件⑤不可得 → 该票退回件④的抑制状态,不影响其余 ingest。
  }
  return out;
}
