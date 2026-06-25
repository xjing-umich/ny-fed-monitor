import React from "react";
import type { Lang } from "@/lib/nav";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";

// 位置档徽章(RSC, 零 JS)。纯位置语言, 无 BUY/SELL/目标价。
// inStrikeZone(below 的深折扣子集)用更强样式; single_lamp 挂 title 提示单灯口径。
// 缺数据 → 静默 "—"(覆盖诚实)。a11y: 文字标签承载语义, 颜色仅增强。
const COPY = {
  zh: { strike: "进入区", below: "低于价值带", within: "带内", above: "高于价值", none: "—", lamp: "金融单灯口径" },
  en: { strike: "Strike zone", below: "Below value", within: "Within band", above: "Above value", none: "—", lamp: "Single-lamp basis (financials)" },
} as const;

export function ValuationBadge({ verdict, lang }: { verdict?: SnapshotVerdict; lang: Lang }): React.ReactElement {
  const t = COPY[lang];
  if (!verdict) return <span className="text-[var(--tt-faint)]">{t.none}</span>;

  const { label, cls } = verdict.inStrikeZone
    ? { label: t.strike, cls: "border-[var(--tt-positive)] text-[var(--tt-positive)] bg-[var(--tt-positive)]/10" }
    : verdict.bucket === "below"
      ? { label: t.below, cls: "border-[var(--tt-positive)]/50 text-[var(--tt-positive)]" }
      : verdict.bucket === "within"
        ? { label: t.within, cls: "border-[var(--tt-border)] text-[var(--tt-muted)]" }
        : { label: t.above, cls: "border-[var(--tt-warn)]/50 text-[var(--tt-warn)]" };

  return (
    <span
      title={verdict.coverage === "single_lamp" ? t.lamp : undefined}
      className={`inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[11px] ${cls}`}
    >
      {label}
      {verdict.coverage === "single_lamp" ? <span aria-hidden className="ml-0.5 opacity-60">*</span> : null}
    </span>
  );
}
