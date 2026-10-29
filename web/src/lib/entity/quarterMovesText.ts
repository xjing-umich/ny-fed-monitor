import type { Lang } from "@/lib/nav";

// 本季动作的唯一说法(spec 2026-10-23 §三.3):个股页、投资人页都只在一处可见地说一次,四项齐全。
export type MovesCount = { opened: number; added: number; trimmed: number; exited: number };

/** 字形表达动作;正文色承载文字,估值色阶只用于估值。PR B 复用同一映射。 */
export const MOVE_GLYPH = { new: "●", increased: "▲", decreased: "▼", exited: "○" } as const;

/** "Q2：新进 0 · 增持 4 · 减持 12 · 清仓 1" —— 不含清仓名单。 */
export function quarterMovesCounts(q: string, m: MovesCount, lang: Lang): string {
  const g = MOVE_GLYPH;
  return lang === "zh"
    ? `${q}：${g.new} 新进 ${m.opened} · ${g.increased} 增持 ${m.added} · ${g.decreased} 减持 ${m.trimmed} · ${g.exited} 清仓 ${m.exited}`
    : `${q}: ${g.new} ${m.opened} new · ${g.increased} ${m.added} added · ${g.decreased} ${m.trimmed} trimmed · ${g.exited} ${m.exited} exited`;
}

/** 清仓名单:最多 3 个,其余返回 rest。 */
export function splitNames<T>(items: T[], cap = 3): { shown: T[]; rest: number } {
  return { shown: items.slice(0, cap), rest: Math.max(0, items.length - cap) };
}
