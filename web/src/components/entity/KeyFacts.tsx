import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "./types";

export type KeyFact = {
  label: string;
  value: string;
  tone?: Tone;
  /** 若提供, 渲染此 node 取代 value 文本(用于嵌入图标行等)。 */
  node?: ReactNode;
};

const VALUE_TONE_CLASS: Record<Tone, string> = {
  positive: "text-[var(--tt-positive)]",
  warn:     "text-[var(--tt-warn)]",
  negative: "text-[var(--tt-negative)]",
  neutral:  "text-[var(--tt-text)]",
};

export function KeyFacts({ facts }: { facts: KeyFact[] }) {
  if (!facts.length) return null;

  return (
    // 移动端: 干净的 2 列网格(无左边框,避免换行后首项错位);
    // sm+: 4 列网格 + 列首感知的竖线分隔(编辑风格)。用 grid 而非 flex-wrap,
    // 因为 flex-wrap 换行后无法在 CSS 里定位"每行行首",first:pl-0/border-l 会
    // 让第 2 行起的行首元素残留左缩进与孤立竖线(同 DataStrip 曾犯的族)。
    // nth-child(4n+1) 精确命中每行列首 → 去 pl / 去左边框,换行安全、无 !important。
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 sm:gap-x-0 sm:gap-y-4">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className={cn(
            "flex min-w-0 flex-col gap-1.5",
            "sm:px-6 sm:border-l sm:border-[var(--tt-border)]",
            "sm:[&:nth-child(4n+1)]:border-l-0 sm:[&:nth-child(4n+1)]:pl-0"
          )}
        >
          <span className="tt-label">{fact.label}</span>
          {fact.node != null ? (
            <span className="flex items-center leading-none">{fact.node}</span>
          ) : (
            <span
              className={cn(
                "tnum font-mono text-lg font-medium leading-tight break-words sm:text-xl sm:leading-none",
                fact.tone ? VALUE_TONE_CLASS[fact.tone] : "text-[var(--tt-text)]"
              )}
            >
              {fact.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
