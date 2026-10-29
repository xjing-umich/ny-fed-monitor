import React from "react";
import type { Lang } from "@/lib/nav";
import { date as formatDate } from "@/lib/i18n/format";

/** 数据截至 + 13F 45 天滞后徽标。asOf 省略时只显示滞后说明。 */
export function DataAsOfBadge({ lang, asOf }: { lang: Lang; asOf?: string }) {
  const isZh = lang === "zh";
  const datePart = asOf ? (isZh ? `数据截至 ${formatDate(asOf, lang)} · ` : `As of ${formatDate(asOf, lang)} · `) : "";
  const lagPart = isZh ? "13F，最多滞后 45 天" : "13F, up to 45-day lag";
  return (
    <span className="inline-flex items-center rounded border border-[var(--tt-border)] bg-[var(--tt-surface)] px-2 py-1 font-data text-xs text-[var(--tt-muted)]">
      {datePart}{lagPart}
    </span>
  );
}
