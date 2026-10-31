import type { Lang } from "@/lib/nav";
import { cleanIssuer } from "@/lib/format";
import { isLikelyTicker } from "@/lib/externalLinks";

export type BlurbRow = { ticker: string; issuer: string; primary: number; delta?: number | null };

/** 句中称呼: 有真 ticker 用 ticker, 否则用标题化公司名(不暴露 CUSIP id)。 */
function subjectName(r: BlurbRow): string {
  return isLikelyTicker(r.ticker) ? r.ticker : cleanIssuer(r.issuer);
}

/** 共识页解读句。事实派生、无推荐措辞。空数据 → null(不渲染)。 */
export function consensusBlurb(rows: BlurbRow[], managerCount: number, lang: Lang, quarterLabel?: string): string | null {
  if (rows.length === 0) return null;
  const top = rows[0];
  const sumTop5 = rows.slice(0, 5).reduce((s, r) => s + r.primary, 0);
  const d = top.delta ?? 0;
  if (lang === "zh") {
    const deltaTxt = d === 0 ? "环比持平" : `环比 ${d > 0 ? "+" : "−"}${Math.abs(d)} 家`;
    return `${quarterLabel ?? "该申报季"}纳入统计的 ${managerCount} 家机构中，${subjectName(top)} 被 ${top.primary} 家同时持有、居共识首位，${deltaTxt}；前 ${Math.min(5, rows.length)} 只股票合计有 ${sumTop5} 次机构持仓记录，同一机构可重复计数。`;
  }
  const deltaTxt = d === 0 ? "unchanged vs last quarter" : `${d > 0 ? "+" : "−"}${Math.abs(d)} vs last quarter`;
  return `Among the ${managerCount} superinvestors counted ${quarterLabel ? `in ${quarterLabel}` : "in this filing period"}, ${subjectName(top)} is the most widely held — in ${top.primary} portfolios (${deltaTxt}). The top ${Math.min(5, rows.length)} stocks account for ${sumTop5} fund-stock holdings, counting a portfolio once for each stock it owns.`;
}

/** 买/卖页解读句。 */
export function movesBlurb(rows: BlurbRow[], side: "buy" | "sell", lang: Lang, quarterLabel: string): string | null {
  if (rows.length === 0) return null;
  const [a, b, c] = rows;
  const sep = lang === "zh" ? "、" : " and ";
  const names = [...new Set([b, c].filter(Boolean).map((r) => subjectName(r as BlurbRow)))].join(sep);
  if (lang === "zh") {
    const verb = side === "buy" ? "买入（新进或增持）" : "卖出（清仓或减持）";
    const tail = names ? `，其后是 ${names}` : "";
    return `${quarterLabel}，${subjectName(a)} 获最多机构${verb}——${a.primary} 家${tail}。`;
  }
  const verb = side === "buy" ? "managers opening or increasing positions" : "managers exiting or trimming positions";
  const tail = names ? `, followed by ${names}` : "";
  return `In ${quarterLabel}, ${subjectName(a)} drew the most ${verb} (${a.primary} ${a.primary === 1 ? "manager" : "managers"})${tail}.`;
}
