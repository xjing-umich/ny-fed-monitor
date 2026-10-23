import type { Lang } from "@/lib/nav";
import { quarterLabel, type EffectiveMovesPeriod } from "@/lib/freshness/derive";

/**
 * 持有人表上方的申报季说明(spec 2026-10-23 §三.3 G):新季未切换时写“Qn 申报中 n/M”;
 * 表里有早申报者的新季行时,再说明这些行不计入展示季度的动作。已切季 / 无数据 → null。
 */
export function filingSeasonNote(eff: EffectiveMovesPeriod, hasOffQuarterRows: boolean, lang: Lang): string | null {
  if (eff.reason !== "before_deadline" && eff.reason !== "low_coverage") return null;
  if (!eff.maxPeriod || !eff.period || eff.maxPeriod === eff.period) return null;
  const next = quarterLabel(eff.maxPeriod);
  const cur = quarterLabel(eff.period);
  const { filed, total } = eff.coverage;
  if (lang === "zh") {
    const head = `${next} 申报中 ${filed}/${total}。`;
    return hasOffQuarterRows ? `${head}标 ${next} 的行是新申报，不计入上面的 ${cur} 动作。` : head;
  }
  const head = `${next} filings arriving: ${filed} of ${total}.`;
  return hasOffQuarterRows ? `${head} Rows marked ${next} are new filings and aren't counted in the ${cur} moves above.` : head;
}
