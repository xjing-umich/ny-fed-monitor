import React from "react";
import type { Lang } from "@/lib/nav";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";

// 位置档徽章(RSC, 零 JS)。纯位置语言, 无 BUY/SELL/目标价。
// inStrikeZone(below 的深折扣子集)用更强样式; single_lamp 挂 title 提示单灯口径。
// reliable=false 的"便宜"档(进入区/低于价值带)弱化为中性样式 + ⚠ —— 与 /stocks/screener
// 同口径:位置可算但带红旗(盈利下滑/高杠杆/模型不稳/per-share疑错),不据此标"便宜"。
// 缺数据 → 静默 "—"(覆盖诚实)。a11y: 文字标签承载语义, 颜色仅增强。
const COPY = {
  zh: {
    strike: "进入区", below: "低于价值带", within: "带内", above: "高于价值", none: "—",
    lamp: "金融单灯口径",
    flag: "估值带红旗(盈利下滑/高杠杆/模型不稳/每股口径疑错),边际不可信，未计入便宜信号。",
  },
  en: {
    strike: "Strike zone", below: "Below value", within: "Within band", above: "Above value", none: "—",
    lamp: "Single-lamp basis (financials)",
    flag: "Valuation flagged (declining earnings / high leverage / model instability / per-share doubt); margin not trustworthy, excluded from the cheap signal.",
  },
} as const;

export function ValuationBadge({ verdict, lang }: { verdict?: SnapshotVerdict; lang: Lang }): React.ReactElement {
  const t = COPY[lang];
  if (!verdict) return <span className="text-[var(--tt-faint)]">{t.none}</span>;

  // "便宜"档(进入区 / 低于价值带)是唯一受 reliable 影响的:带红旗则不以强样式断言便宜。
  const isCheap = verdict.inStrikeZone || verdict.bucket === "below";
  const flagged = isCheap && verdict.reliable === false;

  const { label, cls } = flagged
    ? // 弱化为中性样式 —— 位置仍如实标(进入区/低于价值带),但不用绿色断言"便宜"。
      { label: verdict.inStrikeZone ? t.strike : t.below, cls: "border-[var(--tt-border)] text-[var(--tt-muted)]" }
    : verdict.inStrikeZone
      ? { label: t.strike, cls: "border-[var(--tt-positive)] text-[var(--tt-positive)] bg-[var(--tt-positive)]/10" }
      : verdict.bucket === "below"
        ? { label: t.below, cls: "border-[var(--tt-positive)]/50 text-[var(--tt-positive)]" }
        : verdict.bucket === "within"
          ? { label: t.within, cls: "border-[var(--tt-border)] text-[var(--tt-muted)]" }
          : { label: t.above, cls: "border-[var(--tt-warn)]/50 text-[var(--tt-warn)]" };

  return (
    <span
      title={flagged ? t.flag : verdict.coverage === "single_lamp" ? t.lamp : undefined}
      className={`inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[11px] ${cls}`}
    >
      {label}
      {flagged ? (
        <span aria-hidden className="ml-0.5 text-[var(--tt-warning,#b58900)]">⚠</span>
      ) : verdict.coverage === "single_lamp" ? (
        <span aria-hidden className="ml-0.5 opacity-60">*</span>
      ) : null}
    </span>
  );
}
