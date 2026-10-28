import React from "react";
import type { HoldingChange } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";

// QoQ 原语 —— 供投资人页 / 个股页共用。权重只写数字;动作由 MoveMark 按股数标出。
// 数字一律 font-data tabular-nums（列对齐）。

const MOVE_LABEL: Record<Lang, Record<"new" | "increased" | "decreased", string>> = {
  zh: { new: "新进", increased: "增持", decreased: "减持" },
  en: { new: "New", increased: "Added", decreased: "Trimmed" },
};

/** 权重百分比，1 位小数；缺失 → 「—」。 */
export const fmtPct1 = (w: number | undefined): string =>
  w != null ? `${(w * 100).toFixed(1)}%` : "—";

/** 本季动作(按申报股数判断,与报告页同口径);持平 / 不同期 / 清仓 → null。 */
export function moveMarkText(kind: HoldingChange["kind"] | undefined, lang: Lang): string | null {
  if (kind === "new" || kind === "increased" || kind === "decreased") return MOVE_LABEL[lang][kind];
  return null;
}

/** 名字旁的动作小标:中性色,不带方向箭头(颜色与字形语义留给第 3 步)。 */
export function MoveMark({ kind, lang }: { kind?: HoldingChange["kind"]; lang: Lang }): React.ReactElement | null {
  const text = moveMarkText(kind, lang);
  return text ? <span className="font-data text-xs text-[var(--tt-faint)]">{text}</span> : null;
}

/**
 * QoQ 权重单元格:只写数字(上季 → 本季)。不带箭头 —— 权重会随股价涨跌变,方向可能与股数相反;
 * 动作另由 MoveMark 按股数标出(spec 2026-10-23 §三.3)。上季无该持仓 → “— → X%”。
 */
export function WeightQoQ({ cur, prior }: { cur?: number; prior?: number; lang: Lang }): React.ReactElement {
  return (
    <span className="font-data tabular-nums text-[var(--tt-muted)]">
      {prior == null ? "—" : fmtPct1(prior)} → {fmtPct1(cur)}
    </span>
  );
}
