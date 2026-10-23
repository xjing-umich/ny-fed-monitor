import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";
import type { Tone } from "@/components/entity/types";
import type { Lang } from "@/lib/nav";
import { valuationLabel, PENDING_WORD } from "@/lib/valuation/valuationLabel";

/** 估值 verdict → 个股页标题徽章 {label,tone}。说法与持仓表、筛选器同源(valuationLabel)。null → 无徽章。 */
export function valuationVerdictChip(
  v: ValuationVerdict | null,
  lang: Lang,
): { label: string; tone: Tone } | null {
  if (v == null) return null;
  const l = valuationLabel(v, lang);
  return { label: l.pending ? `${l.label} · ${PENDING_WORD[lang]}` : l.label, tone: l.tone };
}

const SECTION_FALLBACK: Record<Lang, string> = { zh: "估值", en: "Valuation" };

/** 个股页估值区块标题:档名取 valuationLabel(与标题徽章同一说法),红旗便宜档带待确认。null → “估值”。 */
export function valuationSectionTitle(v: ValuationVerdict | null, lang: Lang): string {
  return valuationVerdictChip(v, lang)?.label ?? SECTION_FALLBACK[lang];
}
