import React from "react";
import type { Lang } from "@/lib/nav";

// 本季动向摘要（中性陈述，非买卖建议）：把已聚合的 moves 计数渲成一行小 chip。
// 颜色诚实非指示性：新进/加仓=绿(机构这季买了)、减仓/清仓=琥珀(机构这季卖了)，描述动作不下判决。
// 全零 → null（无动向不渲染，不留空盒）。零 hydration，全 RSC。

export type QuarterMoves = {
  opened: number;
  added: number;
  trimmed: number;
  exited: number;
};

const COPY = {
  zh: {
    eyebrow: "本季动向",
    opened: (n: number) => `${n} 家新进`,
    added: (n: number) => `${n} 家加仓`,
    trimmed: (n: number) => `${n} 家减仓`,
    exited: (n: number) => `${n} 家清仓`,
  },
  en: {
    eyebrow: "This quarter",
    opened: (n: number) => `${n} opened`,
    added: (n: number) => `${n} added`,
    trimmed: (n: number) => `${n} trimmed`,
    exited: (n: number) => `${n} exited`,
  },
} as const;

const CHIP = "inline-flex items-center rounded-md border px-2.5 py-0.5 font-mono text-[11px] tabular-nums";

export function QuarterMovesPill({
  moves,
  lang,
}: {
  moves: QuarterMoves;
  lang: Lang;
}): React.ReactElement | null {
  const t = COPY[lang];
  // 买入动作=绿(--tt-positive)，卖出动作=琥珀(--tt-warn)：描述机构动作，非投资建议。
  const segs: Array<{ key: string; text: string; color: string }> = [];
  if (moves.opened > 0) segs.push({ key: "opened", text: t.opened(moves.opened), color: "var(--tt-positive)" });
  if (moves.added > 0) segs.push({ key: "added", text: t.added(moves.added), color: "var(--tt-positive)" });
  if (moves.trimmed > 0) segs.push({ key: "trimmed", text: t.trimmed(moves.trimmed), color: "var(--tt-warn)" });
  if (moves.exited > 0) segs.push({ key: "exited", text: t.exited(moves.exited), color: "var(--tt-warn)" });

  if (segs.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
        {t.eyebrow}
      </span>
      {segs.map((s) => (
        <span key={s.key} className={CHIP} style={{ color: s.color, borderColor: s.color }}>
          {s.text}
        </span>
      ))}
    </div>
  );
}
