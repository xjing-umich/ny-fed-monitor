import type { MoveKind } from "@/lib/aggregations";
import type { Lang } from "@/lib/nav";

const MAP: Record<MoveKind, { en: string; zh: string; solid: boolean; tone: "buy" | "sell" }> = {
  new: { en: "NEW", zh: "新进", solid: true, tone: "buy" },
  increased: { en: "ADD", zh: "增持", solid: false, tone: "buy" },
  exited: { en: "EXIT", zh: "清仓", solid: true, tone: "sell" },
  decreased: { en: "TRIM", zh: "减持", solid: false, tone: "sell" },
};

/** Compact buy/sell change-type chip. Green = buy, red = sell; solid = strong (NEW/EXIT).
 *  全用语义 token(positive/negative),深浅主题自动正确,不硬编码色板。 */
export default function MoveTag({ kind, lang }: { kind: MoveKind; lang: Lang }) {
  const cfg = MAP[kind];
  const color = cfg.tone === "buy" ? "var(--tt-positive)" : "var(--tt-negative)";
  const cls = cfg.solid
    ? "text-[var(--primary-foreground)]"
    : "border border-current/50";
  return (
    <span
      // zh 用 13F 报道的四件套;等宽大写与字距只服务英文缩写。
      className={`inline-block rounded-sm px-1.5 py-0.5 text-xs font-semibold leading-none ${lang === "zh" ? "" : "font-mono uppercase tracking-[0.08em]"} ${cls}`}
      style={cfg.solid ? { background: color } : { color }}
    >
      {cfg[lang]}
    </span>
  );
}
