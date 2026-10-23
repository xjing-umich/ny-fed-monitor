import type { Lang } from "@/lib/nav";
import { quarterLabel } from "@/lib/freshness/derive";

/** 「计入 N 位」少于名单时,写明少的是谁、为什么(spec 2026-10-23 §三.1)。空名单 → 不渲染。 */
export function NotCountedNote({
  lang,
  managers,
}: {
  lang: Lang;
  managers: { person: string; period: string | null }[];
}): React.ReactElement | null {
  if (managers.length === 0) return null;
  return (
    <p className="mt-3 text-xs text-[var(--tt-muted)]">
      {lang === "zh"
        ? `未计入：${managers.map((m) => `${m.person}${m.period ? `（最新 13F 停在 ${quarterLabel(m.period)}）` : "（尚无 13F）"}`).join("、")}。申报截止日已过仍未交新一季，旧仓位不算当前持有。`
        : `Not counted: ${managers.map((m) => `${m.person} ${m.period ? `(latest 13F: ${quarterLabel(m.period)})` : "(no 13F yet)"}`).join(", ")}. They missed the latest filing deadline, so their old positions don't count as current holdings.`}
    </p>
  );
}
