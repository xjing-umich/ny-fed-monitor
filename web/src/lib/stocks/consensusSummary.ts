import type { Lang } from "@/lib/nav";
import type { QuarterMoves } from "@/components/entity/QuarterMovesPill";

// 纯函数:把已聚合的本季动向派生成一句自足、带实体计数 + as-of 的事实句(GEO 可引用)。
// 中性陈述,描述机构动作,非买卖建议。全零动向 → 退化为"本季无披露变动"。

export function buildConsensusSentence(
  input: { issuer: string; ticker: string; n: number; moves: QuarterMoves; period: string },
  lang: Lang,
): string {
  const { issuer, ticker, n, moves, period } = input;

  if (lang === "zh") {
    const parts: string[] = [];
    if (moves.opened > 0) parts.push(`${moves.opened} 家新进`);
    if (moves.added > 0) parts.push(`${moves.added} 家加仓`);
    if (moves.trimmed > 0) parts.push(`${moves.trimmed} 家减仓`);
    if (moves.exited > 0) parts.push(`${moves.exited} 家清仓`);
    const head = `${n} 位超级投资者持有 ${issuer}（${ticker}）`;
    const body = parts.length > 0 ? `本季 ${parts.join("、")}` : "本季无披露变动";
    return `${head}；${body}（截至 ${period}）。`;
  }

  const parts: string[] = [];
  if (moves.opened > 0) parts.push(`${moves.opened} opened`);
  if (moves.added > 0) parts.push(`${moves.added} added`);
  if (moves.trimmed > 0) parts.push(`${moves.trimmed} trimmed`);
  if (moves.exited > 0) parts.push(`${moves.exited} exited`);
  const noun = n === 1 ? "superinvestor" : "superinvestors";
  const head = `Held by ${n} ${noun} of ${issuer} (${ticker})`;
  const body = parts.length > 0 ? `this quarter ${parts.join(", ")}` : "no disclosed position changes this quarter";
  return `${head}; ${body} (as of ${period}).`;
}
