import { cn } from "@/lib/utils";
import type { Tone } from "./types";

// Restrained editorial tag: a colored dot + uppercase-tracked label, hairline rule.
const DOT_CLASS: Record<Tone, string> = {
  positive: "bg-[color:var(--color-positive)]",
  warn:     "bg-[color:var(--color-warn)]",
  negative: "bg-destructive",
  neutral:  "bg-muted-foreground",
};

const TEXT_CLASS: Record<Tone, string> = {
  positive: "text-[color:var(--color-positive)]",
  warn:     "text-[color:var(--color-warn)]",
  negative: "text-destructive",
  neutral:  "text-muted-foreground",
};

export type VerdictChipProps = {
  label: string;
  tone: Tone;
};

export function VerdictChip({ label, tone }: VerdictChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5">
      <span className={cn("size-1.5 rounded-full", DOT_CLASS[tone])} aria-hidden />
      <span
        className={cn(
          "text-[10px] font-medium uppercase tracking-[0.12em]",
          TEXT_CLASS[tone]
        )}
      >
        {label}
      </span>
    </span>
  );
}
