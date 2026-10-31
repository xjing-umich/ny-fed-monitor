import React from "react";
import { fmtMarginPct } from "@/lib/format";
import type { Lang } from "@/lib/nav";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import { valuationLabel, PENDING_WORD } from "@/lib/valuation/valuationLabel";

// 位置档徽章(RSC, 零 JS)。纯位置语言, 无 BUY/SELL/目标价。
// 档名 / 待确认 / 未评估 的说法全部来自 valuationLabel(与个股页标题、筛选器、共识榜同源),本组件只管样式。
// 便宜档带红旗(reliable=false)→ 中性样式 + 「待确认」后缀,照实标位置,但不进击球区/低估计数。
// single_lamp 单法口径 → * 诚实标注(title 说明)。无估值 → 灰字「未评估」。a11y: 文字承载语义, 颜色仅增强。
//
// density:
//   "full"  — 筛选器 / 共识榜:四档都出 pill
//   "table" — 持仓表:便宜档出 pill;带内 / 高于价值带用灰色小字;无估值写“未评估”(spec 2026-10-23 §三.2)
const EXPECT = {
  zh: { modest: "隐含温和", fair: "隐含公允", demanding: "隐含苛刻" },
  en: { modest: "implies modest", fair: "implies fair", demanding: "implies demanding" },
} as const satisfies Record<Lang, Record<"modest" | "fair" | "demanding", string>>;

export function ValuationBadge({
  verdict,
  lang,
  density = "full",
}: {
  verdict?: SnapshotVerdict;
  lang: Lang;
  /** full=筛选/共识四档 pill; table=持仓表便宜档 pill、其余灰字 */
  density?: "full" | "table";
}): React.ReactElement {
  const l = valuationLabel(verdict, lang);
  if (l.tier === "unassessed") {
    return <span className="text-xs text-[var(--tt-faint)]" title={l.title ?? undefined}>{l.label}{l.pending ? ` · ${PENDING_WORD[lang]}` : ""}</span>;
  }
  const isCheap = l.tier === "strike" || l.tier === "below";
  if (density === "table" && !isCheap) {
    return <span {...verdict?.publication?.attributes} className="text-xs text-[var(--tt-muted)]" title={l.title ?? undefined}>{l.label}{l.pending ? ` · ${PENDING_WORD[lang]}` : ""}</span>;
  }
  const cls = l.pending
    ? "border-[var(--tt-border)] text-[var(--tt-muted)]"
    : l.tier === "strike"
      ? "border-[var(--val-below)] text-[var(--val-below)] bg-[var(--val-below-soft)]"
      : l.tier === "below"
        ? "border-[var(--val-below)]/50 text-[var(--val-below)]"
        : l.tier === "within"
          ? "border-[var(--val-within)]/50 text-[var(--val-within)]"
          : "border-[var(--val-above)]/50 text-[var(--val-above)]";
  const marker = l.pending ? (
    <span className="ml-1 text-xs text-[var(--tt-faint)]">· {PENDING_WORD[lang]}</span>
  ) : verdict?.coverage === "single_lamp" ? (
    <span aria-hidden className="ml-0.5 opacity-60">*</span>
  ) : null;
  const title = l.title ?? undefined;
  const label = isCheap ? `${l.label} · ${lang === "zh" ? "按所示价格" : "at shown price"}` : l.label;

  const badge = (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-data text-xs ${cls}`}
    >
      {label}
      {marker}
    </span>
  );
  const exTier = verdict?.expectations?.assessable ? verdict.expectations.tier : undefined;
  if (density === "full" && exTier) {
    return (
      <span {...verdict?.publication?.attributes} className="inline-flex flex-col gap-0.5">
        {badge}{verdict?.marginPct != null && <span className="font-data text-xs">{fmtMarginPct(verdict.marginPct)}</span>}
        <span className="font-data text-xs text-[var(--tt-faint)]">{EXPECT[lang][exTier]}</span>
      </span>
    );
  }
  return <span {...verdict?.publication?.attributes}>{badge}{verdict?.marginPct != null && <span className="ml-1 font-data text-xs">{fmtMarginPct(verdict.marginPct)}</span>}</span>;
}
