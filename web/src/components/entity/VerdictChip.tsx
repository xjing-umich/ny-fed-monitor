import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "positive" | "warn" | "negative" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  positive: "bg-[color:var(--color-positive)]/15 text-[color:var(--color-positive)] border-[color:var(--color-positive)]/30",
  warn:     "bg-[color:var(--color-warn)]/15 text-[color:var(--color-warn)] border-[color:var(--color-warn)]/30",
  negative: "bg-destructive/10 text-destructive border-destructive/30",
  neutral:  "bg-muted text-muted-foreground border-border",
};

export type VerdictChipProps = {
  label: string;
  tone: Tone;
};

export function VerdictChip({ label, tone }: VerdictChipProps) {
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-semibold px-2.5 py-0.5", TONE_CLASS[tone])}
    >
      {label}
    </Badge>
  );
}
