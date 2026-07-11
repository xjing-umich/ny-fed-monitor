import React from "react";
import type { Lang } from "@/lib/nav";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";

// 位置档徽章(RSC, 零 JS)。纯位置语言, 无 BUY/SELL/目标价。
//
// 显示:"便宜"档(击球区 / 低于价值带)未被红旗(reliable)即算 **已确认** —— 与 /stocks/screener
// 的 strike_zone/below 视图、首页榜同一信心闸(reliable=true,不强求两法夹逼)。single_lamp
// 单法但无红旗仍算已确认,只额外挂 * 诚实标注单法口径。
// 带红旗(reliable=false:周期峰值/高杠杆/模型不稳/per-share疑错)的便宜位置如实标位置,但降级
// 中性样式 + 「未确认」后缀 + ⚠,明确它不会出现在 击球区 / 低于价值带 视图 —— 徽章与 tab 同口径,
// 不再出现 ALL VALUED 一片"击球区"而 STRIKE ZONE tab 却空的错觉。
// 缺数据 → 静默 "—"(覆盖诚实)。a11y: 文字标签承载语义, 颜色仅增强。
//
// density:
//   "full"   — 筛选用:四档都出 pill(位置是主列)
//   "sparse" — 持仓表用:只高亮便宜档;带内/高于价值用 "—" 消噪(巴菲特页否则满屏 Above value)
const COPY = {
  zh: {
    strike: "击球区", below: "低于价值带", within: "带内", above: "高于价值", none: "—",
    unconfirmed: "未确认",
    lamp: "金融单灯口径",
    flag: "估值带红旗(盈利下滑/高杠杆/模型不稳/每股口径疑错),边际不可信，未计入便宜信号。",
  },
  en: {
    strike: "Strike zone", below: "Below value", within: "Within band", above: "Above value", none: "—",
    unconfirmed: "unconf.",
    lamp: "Single-lamp basis (financials)",
    flag: "Valuation flagged (declining earnings / high leverage / model instability / per-share doubt); margin not trustworthy, excluded from the cheap signal.",
  },
} as const;

export function ValuationBadge({
  verdict,
  lang,
  density = "full",
}: {
  verdict?: SnapshotVerdict;
  lang: Lang;
  /** full=筛选用四档 pill; sparse=持仓表只亮便宜档 */
  density?: "full" | "sparse";
}): React.ReactElement {
  const t = COPY[lang];
  if (!verdict) return <span className="text-[var(--tt-faint)]">{t.none}</span>;

  const isCheap = verdict.inStrikeZone || verdict.bucket === "below";
  // 已确认便宜 = 未被红旗 —— 与 screener strike_zone/below 闸门同口径(reliable=true,不强求两法)。
  const unconfirmedCheap = isCheap && verdict.reliable === false;

  // 持仓表:非便宜档不刷屏(Above value × 30 行 = UX 噪音)
  if (density === "sparse" && !isCheap) {
    return <span className="text-[var(--tt-faint)]">{t.none}</span>;
  }

  let label: string;
  let cls: string;
  let marker: React.ReactElement | null = null;
  let title: string | undefined;

  if (unconfirmedCheap) {
    // 带红旗:位置如实标(击球区/低于价值带),但中性样式 + 「未确认」后缀 —— 不进 strike_zone/below 视图。
    label = verdict.inStrikeZone ? t.strike : t.below;
    cls = "border-[var(--tt-border)] text-[var(--tt-muted)]";
    marker = (
      <span className="ml-1 text-[10px] uppercase tracking-wide text-[var(--tt-faint)]">· {t.unconfirmed}</span>
    );
    title = t.flag;
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

  // single_lamp 单法口径 → * 诚实标注(已确认便宜的单法票、以及带内/高于价值均适用;红旗档已有 ⚠ 不叠)。
  if (!unconfirmedCheap && verdict.coverage === "single_lamp") {
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
