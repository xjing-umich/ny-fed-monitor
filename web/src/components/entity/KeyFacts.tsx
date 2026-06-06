import { cn } from "@/lib/utils";
import type { Tone } from "./types";

export type KeyFact = {
  label: string;
  value: string;
  tone?: Tone;
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
    <div className="flex flex-wrap items-stretch gap-y-4">
      {facts.map((fact, i) => (
        <div
          key={fact.label}
          className={cn(
            "flex flex-col gap-1.5 min-w-[8rem] px-6 first:pl-0",
            i > 0 && "border-l border-border"
          )}
        >
          <span className="tt-label">{fact.label}</span>
          <span
            className={cn(
              "tnum font-mono text-xl font-medium leading-none",
              fact.tone ? VALUE_TONE_CLASS[fact.tone] : "text-card-foreground"
            )}
          >
            {fact.value}
          </span>
        </div>
      ))}
    </div>
  );
}
