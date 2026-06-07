import type { MoveKind } from "@/lib/aggregations";

const MAP: Record<MoveKind, { label: string; solid: boolean; tone: "buy" | "sell" }> = {
  new: { label: "NEW", solid: true, tone: "buy" },
  increased: { label: "ADD", solid: false, tone: "buy" },
  exited: { label: "EXIT", solid: true, tone: "sell" },
  decreased: { label: "TRIM", solid: false, tone: "sell" },
};

/** Compact buy/sell change-type chip. Green = buy, red = sell; solid = strong (NEW/EXIT). */
export default function MoveTag({ kind }: { kind: MoveKind }) {
  const cfg = MAP[kind];
  const cls = cfg.tone === "buy"
    ? (cfg.solid ? "bg-emerald-600 text-white" : "border border-emerald-600/60 text-emerald-700 dark:text-emerald-400")
    : (cfg.solid ? "bg-rose-600 text-white" : "border border-rose-600/60 text-rose-700 dark:text-rose-400");
  return (
    <span className={`inline-block rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] leading-none ${cls}`}>
      {cfg.label}
    </span>
  );
}
