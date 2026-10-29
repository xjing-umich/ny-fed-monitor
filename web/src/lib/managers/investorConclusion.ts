// investorConclusion.ts — 投资人页"先结论后证据"的展示决策(纯函数,无 I/O)。
// 数字全部来自 summarizeQuarter(与入库写 manager_quarter_summary 的是同一个函数),这里只决定怎么说。
import type { Lang } from "@/lib/nav";
import type { HoldingChange, ManagerDetail } from "@/lib/managers/types";
import { summarizeQuarter, type QuarterMove, type QuarterSummary } from "@/lib/managers/quarterSummary";
import { MOVE_GLYPH, MOVE_LABEL } from "@/lib/entity/quarterMovesText";
import { isScopeChange } from "@/lib/freshness/derive";

const moveWord = (kind: QuarterMove["kind"], lang: Lang) => MOVE_LABEL[lang][kind];
const moveLabel = (kind: QuarterMove["kind"], lang: Lang) => `${MOVE_GLYPH[kind]} ${moveWord(kind, lang)}`;
import { formatUSD } from "@/lib/format";

/** 本季动作块与徽章的数据;零持仓季 / 无上季 / 本季无正股变化 → null(块、徽章、锚点都不出)。 */
export function summaryForDetail(d: ManagerDetail): QuarterSummary | null {
  if (!d.prior || d.latest.holdings.length === 0) return null;
  if (!d.changes.some((c) => !c.putCall)) return null;
  return summarizeQuarter({ period: d.latest.period, priorPeriod: d.prior.period, latest: d.latest.holdings, prior: d.prior.holdings, changes: d.changes });
}

const CHIP: Record<Lang, Record<QuarterSummary["verdict"], string>> = {
  zh: { buying: "▲ 本季净买入", selling: "▼ 本季净卖出", mixed: "基本持平" },
  en: { buying: "▲ Net buyer this quarter", selling: "▼ Net seller this quarter", mixed: "Roughly unchanged" },
};
/** 标题徽章:按金额判定,中性色(绿色只给估值)。 */
export function investorVerdictChip(s: QuarterSummary | null, lang: Lang): { label: string; tone: "neutral" } | undefined {
  return s ? { label: CHIP[lang][s.verdict], tone: "neutral" } : undefined;
}

export type ValueSplit = { totalPct: number; tradePct: number; pricePct: number };
/** 组合市值变化 = 交易部分(净额)+ 价格部分(其余)。上季正股市值为 0 → null。 */
export function valueChangeSplit(s: QuarterSummary): ValueSplit | null {
  if (!(s.priorValue > 0)) return null;
  const totalPct = (s.latestValue - s.priorValue) / s.priorValue;
  if (isScopeChange(totalPct)) return null;
  const tradePct = s.netFlowUsd / s.priorValue;
  return { totalPct, tradePct, pricePct: totalPct - tradePct };
}

const signedPct = (x: number): string => {
  const r = Math.round(x * 100);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}%`;
};
export function valueSplitNote(sp: ValueSplit, lang: Lang): string {
  return lang === "zh"
    ? `较上季 ${signedPct(sp.totalPct)}：交易约 ${signedPct(sp.tradePct)}，股价约 ${signedPct(sp.pricePct)}`
    : `${signedPct(sp.totalPct)} vs last quarter: trading ≈${signedPct(sp.tradePct)}, prices ≈${signedPct(sp.pricePct)}`;
}

const EN_VERB: Record<QuarterMove["kind"], string> = { new: "a new position in", increased: "adding to", decreased: "trimming", exited: "exiting" };

/** 首屏结论句:"Q2 2026 净买入约 $1.20B（约占组合 4%）；最大一笔是新进 Uber，约 $400.0M。" */
export function conclusionSentence(s: QuarterSummary, quarter: string, nameOf: (m: QuarterMove) => string, lang: Lang): string {
  const amt = formatUSD(Math.abs(s.netFlowUsd), lang);
  const share = s.priorValue > 0 ? Math.abs(s.netFlowUsd) / s.priorValue : null;
  const shareTxt = share == null ? null
    : share < 0.01 ? (lang === "zh" ? "不到组合的 1%" : "under 1% of the portfolio")
    : lang === "zh" ? `约占组合 ${Math.round(share * 100)}%` : `about ${Math.round(share * 100)}% of the portfolio`;
  const top = s.topMoves[0];
  if (lang === "zh") {
    const head = s.verdict === "mixed"
      ? `${quarter} 买卖大致相抵（净额约 ${amt}${shareTxt ? `，${shareTxt}` : ""}）`
      : `${quarter} ${s.verdict === "buying" ? "净买入" : "净卖出"}约 ${amt}${shareTxt ? `（${shareTxt}）` : ""}`;
    return top ? `${head}；最大一笔是${moveWord(top.kind, "zh")} ${nameOf(top)}，约 ${formatUSD(Math.abs(top.flowUsd), lang)}。` : `${head}。`;
  }
  const head = s.verdict === "mixed"
    ? `${quarter}: buys and sells roughly offset (net about ${amt}${shareTxt ? `, ${shareTxt}` : ""})`
    : `${quarter}: net ${s.verdict === "buying" ? "buyer" : "seller"} of about ${amt}${shareTxt ? ` (${shareTxt})` : ""}`;
  return top ? `${head}; the biggest move was ${EN_VERB[top.kind]} ${nameOf(top)}, about ${formatUSD(Math.abs(top.flowUsd), lang)}.` : `${head}.`;
}

/** 前 5 笔与"本季"列的幅度:+35% / −20% / 不到 1% 写 <1%;新进 / 清仓直接写词。 */
export function moveDeltaText(m: Pick<QuarterMove, "kind" | "deltaPct">, lang: Lang): string {
  if (m.kind === "new" || m.kind === "exited" || m.deltaPct == null) return moveWord(m.kind, lang);
  const r = Math.round(Math.abs(m.deltaPct) * 100);
  return `${m.deltaPct > 0 ? "+" : "−"}${r === 0 ? "<1" : r}%`;
}

export function movesCountsLine(c: QuarterSummary["counts"], lang: Lang): string {
  const g = MOVE_GLYPH;
  return lang === "zh"
    ? `共 ${g.new} 新进 ${c.opened} · ${g.increased} 增持 ${c.added} · ${g.decreased} 减持 ${c.trimmed} · ${g.exited} 清仓 ${c.exited}`
    : `In all: ${g.new} ${c.opened} new · ${g.increased} ${c.added} added · ${g.decreased} ${c.trimmed} trimmed · ${g.exited} ${c.exited} exited`;
}

/** 拆股说明:系数写成小整数比。5 → "1 拆 5"、1.5 → "2 拆 3"、0.1 → "10 并 1"。 */
export function splitNote(factor: number, lang: Lang): string {
  const near = (x: number) => Math.abs(x - Math.round(x)) < 1e-3;
  let num = 0, den = 0;
  for (const d of [1, 2, 3, 4]) if (!num && near(factor * d)) { num = Math.round(factor * d); den = d; }
  for (const n of [1, 2, 3, 4]) if (!num && near(n / factor)) { num = n; den = Math.round(n / factor); }
  if (!num) return lang === "zh" ? `已按拆股调整（×${factor}）` : `Adjusted for a split (×${factor})`;
  if (lang === "zh") return num > den ? `已按 ${den} 拆 ${num} 调整` : `已按 ${den} 并 ${num} 调整`;
  return num > den ? `Adjusted for a ${num}-for-${den} split` : `Adjusted for a ${num}-for-${den} reverse split`;
}

/** 持仓表"本季"列。hasPrior=false(无上季可比)→ "—",不说"未变"。 */
export function quarterCell(change: HoldingChange | undefined, hasPrior: boolean, lang: Lang): { text: string; title?: string } {
  if (!hasPrior) return { text: "—" };
  if (!change) return { text: lang === "zh" ? "未变" : "Unchanged" };
  const text = change.kind === "new" ? moveLabel("new", lang) : `${MOVE_GLYPH[change.kind]} ${moveDeltaText(change, lang)}`;
  return change.splitFactor ? { text, title: splitNote(change.splitFactor, lang) } : { text };
}

export type InvestorAnchor = { id: "moves" | "holdings" | "valuation" | "about"; label: string };
const ANCHOR_LABEL: Record<Lang, Record<InvestorAnchor["id"], string>> = {
  zh: { moves: "本季动作", holdings: "持仓", valuation: "估值", about: "关于" },
  en: { moves: "This quarter", holdings: "Holdings", valuation: "Valuation", about: "About" },
};
export function investorAnchors(has: { moves: boolean; holdings: boolean; valuation: boolean }, lang: Lang): InvestorAnchor[] {
  const ids: InvestorAnchor["id"][] = [];
  if (has.moves) ids.push("moves");
  if (has.holdings) ids.push("holdings");
  if (has.valuation) ids.push("valuation");
  ids.push("about");
  return ids.map((id) => ({ id, label: ANCHOR_LABEL[lang][id] }));
}

// 持仓表:默认 10 行;<details> 展开到最多 100 行(Tweedy 91 只全可见);再多的给 SEC 原文链接,不撑大 HTML。
export const HOLDINGS_VISIBLE = 10;
export const HOLDINGS_MAX = 100;
export function holdingsSplit<T>(rows: T[]): { shown: T[]; folded: T[]; overflow: number } {
  return { shown: rows.slice(0, HOLDINGS_VISIBLE), folded: rows.slice(HOLDINGS_VISIBLE, HOLDINGS_MAX), overflow: Math.max(0, rows.length - HOLDINGS_MAX) };
}

/** 前 5 大持仓占正股市值的比例;无持仓 → null。 */
export function top5Share(values: number[]): number | null {
  const total = values.reduce((s, v) => s + v, 0);
  if (!(total > 0)) return null;
  return [...values].sort((a, b) => b - a).slice(0, 5).reduce((s, v) => s + v, 0) / total;
}
