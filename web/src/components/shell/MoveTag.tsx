import type { MoveKind } from "@/lib/aggregations";

const MAP: Record<MoveKind, { label: string; solid: boolean; tone: "buy" | "sell" }> = {
  new: { label: "NEW", solid: true, tone: "buy" },
  increased: { label: "ADD", solid: false, tone: "buy" },
  exited: { label: "EXIT", solid: true, tone: "sell" },
  decreased: { label: "TRIM", solid: false, tone: "sell" },
};

/** Compact buy/sell change-type chip. Green = buy, red = sell; solid = strong (NEW/EXIT).
 *  全用语义 token(positive/negative),深浅主题自动正确,不硬编码色板。 */
export default function MoveTag({ kind }: { kind: MoveKind }) {
  const cfg = MAP[kind];
  const color = cfg.tone === "buy" ? "var(--tt-positive)" : "var(--tt-negative)";
  const cls = cfg.solid
    ? "text-[var(--primary-foreground)]"
    : "border border-current/50";
  return (
    <span
      className={`inline-block rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] leading-none ${cls}`}
      style={cfg.solid ? { background: color } : { color }}
    >
      {cfg.label}
    </span>
  );
}
