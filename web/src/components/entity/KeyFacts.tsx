import { cn } from "@/lib/utils";

type Tone = "positive" | "warn" | "negative" | "neutral";

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
    <div className="flex flex-wrap gap-x-6 gap-y-4">
      {facts.map((fact) => (
        <div key={fact.label} className="flex flex-col gap-0.5 min-w-[7rem]">
          <span className="tt-label">{fact.label}</span>
          <span
            className={cn(
              "tnum text-base font-semibold leading-tight",
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
