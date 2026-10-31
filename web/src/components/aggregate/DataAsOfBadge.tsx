import React from "react";
import type { Lang } from "@/lib/nav";
import { date as formatDate } from "@/lib/i18n/format";

/** 数据截至 + 13F 季末快照徽标。asOf 省略时只显示快照说明。 */
export function DataAsOfBadge({ lang, asOf }: { lang: Lang; asOf?: string }) {
  const isZh = lang === "zh";
  const datePart = asOf ? (isZh ? `数据截至 ${formatDate(asOf, lang)} · ` : `As of ${formatDate(asOf, lang)} · `) : "";
  const lagPart = isZh ? "13F 季末快照" : "13F quarter-end snapshot";
  return (
    <span title={isZh ? "通常在季末后 45 天内申报，遇周末或假日顺延；仓位仍属于报告期季末。" : "Usually filed within 45 days after quarter-end, extended for weekends and holidays; positions still reflect the report’s quarter-end."} className="inline-flex items-center rounded border border-[var(--tt-border)] bg-[var(--tt-surface)] px-2 py-1 font-data text-xs text-[var(--tt-muted)]">
      {datePart}{lagPart}
    </span>
  );
}
