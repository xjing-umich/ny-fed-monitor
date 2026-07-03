import React from "react";
import type { Lang } from "@/lib/nav";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";

// 位置档徽章(RSC, 零 JS)。纯位置语言, 无 BUY/SELL/目标价。
//
// 关键:"便宜"档(进入区 / 低于价值带)只有两法夹逼(coverage=full)且未被红旗(reliable)才算
// **已确认** —— 与 /stocks/screener 的 strike_zone/below 视图、首页榜同一信心闸。
// 未过闸的便宜位置(single_lamp 单法 或 reliable=false 红旗)如实标位置,但降级中性样式 +
// 「未确认」后缀,明确它不会出现在 进入区 / 低于价值带 视图 —— 否则 ALL VALUED 里一片
// "进入区" 而 STRIKE ZONE tab 只剩 1 只,看着像 bug(实为置信度闸门)。
// 缺数据 → 静默 "—"(覆盖诚实)。a11y: 文字标签承载语义, 颜色仅增强。
const COPY = {
  zh: {
    strike: "进入区", below: "低于价值带", within: "带内", above: "高于价值", none: "—",
    unconfirmed: "未确认",
    lamp: "金融单灯口径",
    flag: "估值带红旗(盈利下滑/高杠杆/模型不稳/每股口径疑错),边际不可信，未计入便宜信号。",
    unconfirmedWhy: "位置仅单法成立、未经两法夹逼确认，不计入进入区 / 低于价值带视图。",
  },
  en: {
    strike: "Strike zone", below: "Below value", within: "Within band", above: "Above value", none: "—",
    unconfirmed: "unconf.",
    lamp: "Single-lamp basis (financials)",
    flag: "Valuation flagged (declining earnings / high leverage / model instability / per-share doubt); margin not trustworthy, excluded from the cheap signal.",
    unconfirmedWhy: "Position holds on a single method only, not confirmed by the two-method squeeze; excluded from the Strike zone / Below value views.",
  },
} as const;

export function ValuationBadge({ verdict, lang }: { verdict?: SnapshotVerdict; lang: Lang }): React.ReactElement {
  const t = COPY[lang];
  if (!verdict) return <span className="text-[var(--tt-faint)]">{t.none}</span>;

  const isCheap = verdict.inStrikeZone || verdict.bucket === "below";
  // 已确认便宜 = 两法夹逼(full)且未被红旗 —— 与 screener strike_zone/below 闸门同口径。
  const confirmedCheap = isCheap && verdict.coverage === "full" && verdict.reliable !== false;
  const unconfirmedCheap = isCheap && !confirmedCheap;

  let label: string;
  let cls: string;
  let marker: React.ReactElement | null = null;
  let title: string | undefined;

  if (unconfirmedCheap) {
    // 位置如实标(进入区/低于价值带),但中性样式 + 「未确认」后缀 —— 不进 strike_zone/below 视图。
    label = verdict.inStrikeZone ? t.strike : t.below;
    cls = "border-[var(--tt-border)] text-[var(--tt-muted)]";
    marker = (
      <span className="ml-1 text-[10px] uppercase tracking-wide text-[var(--tt-faint)]">· {t.unconfirmed}</span>
    );
    title = verdict.reliable === false ? t.flag : t.unconfirmedWhy;
  } else if (verdict.inStrikeZone) {
    label = t.strike;
    cls = "border-[var(--tt-positive)] text-[var(--tt-positive)] bg-[var(--tt-positive)]/10";
  } else if (verdict.bucket === "below") {
    label = t.below;
    cls = "border-[var(--tt-positive)]/50 text-[var(--tt-positive)]";
  } else if (verdict.bucket === "within") {
    label = t.within;
    cls = "border-[var(--tt-border)] text-[var(--tt-muted)]";
  } else {
    label = t.above;
    cls = "border-[var(--tt-warn)]/50 text-[var(--tt-warn)]";
  }

  // 非便宜档的 single_lamp 仍以 * 诚实标注单法口径(带内/高于价值不受置信闸影响)。
  if (!isCheap && verdict.coverage === "single_lamp") {
    marker = <span aria-hidden className="ml-0.5 opacity-60">*</span>;
    title = t.lamp;
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[11px] ${cls}`}
    >
      {label}
      {marker}
    </span>
  );
}
