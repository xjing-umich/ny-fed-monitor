import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";
import type { Tone } from "@/components/entity/types";
import type { Lang } from "@/lib/nav";

// 标签复用 ValuationBadge 同款位置词(进入区/低于价值带/带内/高于价值)。纯位置陈述, 无荐买卖。
const COPY = {
  zh: { strike: "进入区", below: "低于价值带", within: "带内", above: "高于价值" },
  en: { strike: "Strike zone", below: "Below value", within: "Within band", above: "Above value" },
} as const;

/**
 * 估值 verdict → masthead 徽章 {label,tone}。null → 无徽章。
 * 便宜档(进入区/低于价值带)可信才 positive; 红旗(reliable=false)降 neutral(不标已确认便宜,
 * 与 ValuationBadge / screener strike_zone 信心闸同口径)。带内 neutral, 高于价值 warn。
 */
export function valuationVerdictChip(
  v: ValuationVerdict | null,
  lang: Lang,
): { label: string; tone: Tone } | null {
  if (v == null) return null;
  const t = COPY[lang];
  if (v.inStrikeZone || v.bucket === "below") {
    const label = v.inStrikeZone ? t.strike : t.below;
    return { label, tone: v.reliable ? "positive" : "neutral" };
  }
  if (v.bucket === "within") return { label: t.within, tone: "neutral" };
  return { label: t.above, tone: "warn" };
}
