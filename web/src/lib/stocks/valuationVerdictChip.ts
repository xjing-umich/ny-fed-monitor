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
