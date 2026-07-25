import { cn } from "@/lib/utils";

export type BadgeTone = "positive" | "warn" | "negative" | "neutral" | "accent";

const TONE: Record<BadgeTone, string> = {
  positive: "text-[var(--tt-positive)] border-[var(--tt-positive)]",
  warn: "text-[var(--tt-warn)] border-[var(--tt-warn)]",
  negative: "text-[var(--tt-negative)] border-[var(--tt-negative)]",
  neutral: "text-[var(--tt-faint)] border-[var(--tt-border)]",
  accent: "text-[var(--tt-accent)] border-[var(--tt-accent)]",
};

/**
 * 编辑风格描边徽章(--tt token)。用于表格/卡片里的状态标签(净买入/净卖出等)。
 * 注:买卖动作用 MoveTag(实心绿/红),数据新鲜度用 FreshnessDot — 各有专属语义,未并入此处。
 */
export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] leading-none",
        TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
