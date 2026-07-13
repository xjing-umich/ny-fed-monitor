import type { Lang } from "@/lib/nav";
import { cleanIssuer } from "@/lib/format";
import { isLikelyTicker } from "@/lib/externalLinks";

export type BlurbRow = { ticker: string; issuer: string; primary: number; delta?: number | null };

/** 句中称呼: 有真 ticker 用 ticker, 否则用标题化公司名(不暴露 CUSIP id)。 */
function subjectName(r: BlurbRow): string {
  return isLikelyTicker(r.ticker) ? r.ticker : cleanIssuer(r.issuer);
}

/** 共识页解读句。事实派生、无推荐措辞。空数据 → null(不渲染)。 */
export function consensusBlurb(rows: BlurbRow[], managerCount: number, lang: Lang): string | null {
  if (rows.length === 0) return null;
  const top = rows[0];
  const sumTop5 = rows.slice(0, 5).reduce((s, r) => s + r.primary, 0);
  const d = top.delta ?? 0;
  if (lang === "zh") {
    const deltaTxt = d === 0 ? "环比持平" : `环比 ${d > 0 ? "+" : "−"}${Math.abs(d)} 位`;
    return `本季纳入统计的 ${managerCount} 位超级投资者中，${subjectName(top)} 被 ${top.primary} 位同时持有、居共识首位，${deltaTxt}；前五大共识股合计出现 ${sumTop5} 人次。`;
  }
  const deltaTxt = d === 0 ? "unchanged vs last quarter" : `${d > 0 ? "+" : "−"}${Math.abs(d)} vs last quarter`;
  return `Among ${managerCount} superinvestors tracked, ${subjectName(top)} is the most widely held — in ${top.primary} portfolios (${deltaTxt}). The top 5 consensus names appear in ${sumTop5} portfolios combined.`;
}

/** 买/卖页解读句。 */
export function movesBlurb(rows: BlurbRow[], side: "buy" | "sell", lang: Lang, quarterLabel: string): string | null {
  if (rows.length === 0) return null;
  const [a, b, c] = rows;
  const sep = lang === "zh" ? "、" : " and ";
  const names = [...new Set([b, c].filter(Boolean).map((r) => subjectName(r as BlurbRow)))].join(sep);
  if (lang === "zh") {
    const verb = side === "buy" ? "买入（新建仓或加仓）" : "卖出（清仓或减仓）";
    const tail = names ? `，其后是 ${names}` : "";
    return `${quarterLabel}，${subjectName(a)} 获最多投资者${verb}——${a.primary} 位${tail}。`;
  }
  const verb = side === "buy" ? "buying — opened or added" : "selling — sold or trimmed";
  const tail = names ? `, followed by ${names}` : "";
  return `In ${quarterLabel}, ${subjectName(a)} drew the most ${verb} (${a.primary} superinvestors)${tail}.`;
}
