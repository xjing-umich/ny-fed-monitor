import { cn } from "@/lib/utils";
import type { Tone } from "./types";

// Restrained editorial tag: a colored dot + uppercase-tracked label, hairline rule.
const DOT_CLASS: Record<Tone, string> = {
  positive: "bg-[var(--tt-positive)]",
  warn:     "bg-[var(--tt-warn)]",
  negative: "bg-[var(--tt-negative)]",
  neutral:  "bg-[var(--tt-muted)]",
};

const TEXT_CLASS: Record<Tone, string> = {
  positive: "text-[var(--tt-positive)]",
  warn:     "text-[var(--tt-warn)]",
  negative: "text-[var(--tt-negative)]",
  neutral:  "text-[var(--tt-muted)]",
};

export type VerdictChipProps = {
  label: string;
  tone: Tone;
};

export function VerdictChip({ label, tone }: VerdictChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-[var(--tt-border)] px-2 py-0.5">
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
