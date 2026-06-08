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
  positive: "text-[color:var(--color-positive)]",
  warn:     "text-[color:var(--color-warn)]",
  negative: "text-destructive",
  neutral:  "text-card-foreground",
};

export function KeyFacts({ facts }: { facts: KeyFact[] }) {
  if (!facts.length) return null;

  return (
    // 移动端: 干净的 2 列网格(无左边框,避免换行后首项错位);
    // sm+ 恢复单行 flex + 竖线分隔的编辑风格。
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:flex sm:flex-wrap sm:items-stretch sm:gap-y-4">
      {facts.map((fact, i) => (
        <div
          key={fact.label}
          className={cn(
            "flex min-w-0 flex-col gap-1.5",
            "sm:min-w-[8rem] sm:px-6 sm:first:pl-0",
            i > 0 && "sm:border-l sm:border-border"
          )}
        >
          <span className="tt-label">{fact.label}</span>
          {fact.node != null ? (
            <span className="flex items-center leading-none">{fact.node}</span>
          ) : (
            <span
              className={cn(
                "tnum font-mono text-lg font-medium leading-tight break-words sm:text-xl sm:leading-none",
                fact.tone ? VALUE_TONE_CLASS[fact.tone] : "text-card-foreground"
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
