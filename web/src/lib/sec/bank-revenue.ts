import type { CompanyFacts, SecFactUnit } from "./company-facts";

/**
 * 银行口径总营收 = 净利息收入 + 非利息收入,合成为 RevenuesNetOfInterestExpense 注入 facts。
 *
 * 为什么:银行几乎不标 Revenues / RevenueFromContract…(或只把手续费部分标成后者),
 * 我们原先拿不到营收 → 季度营收全空 → TTM 合成被闸4挡掉,估值只能用上一份年报。
 * 2026-10 审计 52 只金融股停在 FY2025 基点,其中 42 家银行两项都标了。
 * 更糟的是 COLB 一类:FY 只把手续费 $1.77 亿标成 RevenueFromContract…,被当成全部营收(真实 $23 亿)。
 *
 * 口径核对(2026-10-19 SEC companyfacts):BNY FY2025 Revenues 200.80 亿 = NII+NonII 200.80 亿;
 * JPM/GS/MS/WFC 自标的 RevenuesNetOfInterestExpense 与 NII+NonII 在 FY2025 和 Q2 2026 逐位相等。
 *
 * 规则:同一份申报(accn)里同一期间(start,end)两项都有才合成;该期间已有真实
 * RevenuesNetOfInterestExpense 的不覆盖。YTD 期间一并合成,供 normalizer 的 YTD 链推单季。
 * 就地修改 facts,返回合成条数。
 */
export const BANK_NII = "InterestIncomeExpenseNet";
export const BANK_NON_II = "NoninterestIncome";
export const BANK_TOTAL = "RevenuesNetOfInterestExpense";

const keyOf = (u: SecFactUnit) => `${u.accn ?? ""}|${u.start ?? ""}|${u.end ?? ""}`;

export function synthesizeBankRevenue(facts: CompanyFacts): number {
  const ns = facts.facts?.["us-gaap"];
  if (!ns) return 0;
  const nii = ns[BANK_NII]?.units?.USD ?? [];
  const non = ns[BANK_NON_II]?.units?.USD ?? [];
  if (!nii.length || !non.length) return 0;

  const nonByKey = new Map<string, SecFactUnit>();
  for (const u of non) if (u.start && u.end) nonByKey.set(keyOf(u), u);
  const existing = ns[BANK_TOTAL]?.units?.USD ?? [];
  const realPeriods = new Set(existing.map((u) => `${u.start ?? ""}|${u.end ?? ""}`));

  const out: SecFactUnit[] = [];
  const seen = new Set<string>();
  for (const a of nii) {
    if (!a.start || !a.end) continue;
    const k = keyOf(a);
    const b = nonByKey.get(k);
    if (!b || seen.has(k) || realPeriods.has(`${a.start}|${a.end}`)) continue;
    seen.add(k);
    out.push({ start: a.start, end: a.end, val: a.val + b.val, accn: a.accn, fy: a.fy, fp: a.fp, form: a.form, filed: a.filed });
  }
  if (!out.length) return 0;
  ns[BANK_TOTAL] = { ...(ns[BANK_TOTAL] ?? {}), units: { ...(ns[BANK_TOTAL]?.units ?? {}), USD: [...existing, ...out] } };
  return out.length;
}
