import React from "react";
import type { HoldingChange } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";

// QoQ 方向原语 —— 从投资人页 WeightQoQ 1:1 抽出，供投资人页 / 个股页共用。
// 颜色语义诚实、非指示性：▲绿/▼琥珀 描述「机构这季做了什么动作」，不是买卖建议。
// 减持用 --tt-warn(琥珀) 而非 --tt-negative(红)——红会读成「卖出/坏」，违反品牌无判决。
// 数字一律 font-mono tabular-nums（列对齐）。

const NEW_LABEL: Record<Lang, string> = { zh: "新建", en: "New" };

/** 权重百分比，1 位小数；缺失 → 「—」。 */
export const fmtPct1 = (w: number | undefined): string =>
  w != null ? `${(w * 100).toFixed(1)}%` : "—";

/**
 * QoQ 权重单元格: 数字取权重, 箭头/色取自 change.kind(持股口径)。
 * - 新建(prior 不存在该持仓) → 「新建/New · X%」+ 绿
 * - increased → ▲ + 绿(--tt-positive)
 * - decreased → ▼ + 琥珀(--tt-warn)
 * - hold(无 kind) → 无箭头 + faint(--tt-faint)
 */
export function WeightQoQ({
  cur,
  prior,
  kind,
  lang,
}: {
  cur?: number;
  prior?: number;
  kind?: HoldingChange["kind"];
  lang: Lang;
}): React.ReactElement {
  // 新建: prior 不存在该持仓
  if (prior == null) {
    return (
      <span className="font-mono tabular-nums text-[var(--tt-positive)]">
        {NEW_LABEL[lang]} · {fmtPct1(cur)}
      </span>
    );
  }
  const up = cur != null && prior != null && cur > prior;
  const down = cur != null && prior != null && cur < prior;
  const arrow = up ? "▲" : down ? "▼" : "";
  const colorClass = up
    ? "text-[var(--tt-positive)]"
    : down
    ? "text-[var(--tt-warn)]"
    : "text-[var(--tt-faint)]";
  return (
    <span className="font-mono tabular-nums text-[var(--tt-muted)]">
      {fmtPct1(prior)} <span className={colorClass}>→ {fmtPct1(cur)} {arrow}</span>
    </span>
  );
}
