// 季度报告双语文案。页面与邮件都从这里取字,保证同一事实同一说法。
// 只描述已发生的申报与估值位置,不给买卖建议。
import { effectiveFilingDeadline, parseUTC, quarterLabel } from "../freshness/derive";
import { localePath, stockPath, SITE_ORIGIN } from "../urls";
import { reportSlug } from "./period";
import type { EmptyReason, FeaturedEntry, MoveKind, ReportLang, ReportPayload, ReportStatus, ReportStock } from "./types";

export const pct = (x: number): string => `${Number((x * 100).toFixed(1))}%`;
const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
const label = (s: ReportStock): string => s.ticker ?? s.issuer;

export function reportTitle(period: string, lang: ReportLang): string {
  const q = quarterLabel(period);
  return lang === "zh" ? `${q} 超级投资者共识报告` : `${q} Superinvestor Consensus Report`;
}

/** 英文单复数:1 superinvestor / 2 superinvestors。中文统一“N 位”。 */
export function superinvestorCount(n: number, lang: ReportLang): string {
  return lang === "zh" ? `${n} 位` : `${n} ${n === 1 ? "superinvestor" : "superinvestors"}`;
}
export function holderCountText(n: number, lang: ReportLang): string {
  return lang === "zh" ? `${n} 位` : `${n} ${n === 1 ? "holder" : "holders"}`;
}
/** 持有人数环比(成句):0 → “较上季持平” / “unchanged vs. last quarter”。 */
export function holderDeltaText(d: number, lang: ReportLang): string {
  if (lang === "zh") return d === 0 ? "较上季持平" : `较上季 ${signed(d)}`;
  return d === 0 ? "unchanged vs. last quarter" : `${signed(d)} vs. last quarter`;
}
/** 持有人数环比(表格列,列名已写“较上季”):0 → “持平” / “unchanged”。 */
export function holderDeltaCell(d: number, lang: ReportLang): string {
  if (d === 0) return lang === "zh" ? "持平" : "unchanged";
  return signed(d);
}

export function reportDescription(p: ReportPayload, status: ReportStatus, lang: ReportLang): string {
  const q = quarterLabel(p.period);
  const parts: string[] = [];
  const b = p.bought.items[0];
  const h = p.mostHeld.items[0];
  const sz = p.strikeZone.items.length;
  if (lang === "zh") {
    if (b) parts.push(`${b.managerCount} 位超级投资者新建或加仓 ${label(b)}`);
    if (h) parts.push(`持有人数最多的是 ${label(h)}（${holderCountText(h.holderCount, lang)}，${holderDeltaText(h.holderDelta, lang)}）`);
    if (sz) parts.push(`被至少 2 位持有的股票中，有 ${sz} 只处在击球区或价值带以下`);
    const body = parts.length ? parts.join("；") : "已申报的投资人中暂无满足条件的共识动作";
    const prefix = status === "live" ? `${q}，截至目前（${p.coverage.total} 位中 ${p.coverage.filed} 位已申报）` : q;
    return `${prefix}：${body}。`;
  }
  if (b) parts.push(`${superinvestorCount(b.managerCount, lang)} opened or added to ${label(b)}`);
  if (h) parts.push(`the most widely held stock is ${label(h)} (${holderCountText(h.holderCount, lang)}, ${holderDeltaText(h.holderDelta, lang)})`);
  if (sz) parts.push(sz === 1 ? "1 stock held by two or more sits in the strike zone or below the value band" : `${sz} stocks held by two or more sit in the strike zone or below the value band`);
  const body = parts.length ? parts.join("; ") : "no consensus moves qualify among the funds that have filed";
  const prefix = status === "live" ? `${q}, so far (${p.coverage.filed} of ${p.coverage.total} filed)` : q;
  return `${prefix}: ${body}.`;
}

export function statusLine(
  row: { status: ReportStatus; coverageFiled: number; coverageTotal: number; finalizedAt: string | null },
  lang: ReportLang,
): string {
  const day = row.finalizedAt ? row.finalizedAt.slice(0, 10) : "";
  if (row.status === "live") {
    return lang === "zh"
      ? `${row.coverageTotal} 位中已有 ${row.coverageFiled} 位申报 · 每次有新申报后更新`
      : `${row.coverageFiled} of ${row.coverageTotal} have filed · updates after each new filing`;
  }
  return lang === "zh"
    ? `定稿于 ${day} · ${row.coverageTotal} 位中 ${row.coverageFiled} 位已申报`
    : `Final as of ${day} · ${row.coverageFiled} of ${row.coverageTotal} filed`;
}

/** 估值快照晚于该季实际申报截止日这么多天以上时,注明“晚于该季申报季”(spec §3.6,如 Q2 补发)。 */
export const LATE_VALUATION_DAYS = 30;

export function valuationNote(asOf: string | null, lang: ReportLang, period?: string): string {
  if (!asOf) return lang === "zh" ? "估值位置暂不可用。" : "Valuation positions are not available yet.";
  const deadline = period ? effectiveFilingDeadline(period) : null;
  const at = parseUTC(asOf);
  const late = !!deadline && !!at && at.getTime() - deadline.getTime() > LATE_VALUATION_DAYS * 86_400_000;
  return lang === "zh"
    ? `价值位置按 ${asOf} 收盘价计算${late ? "（晚于该季申报季）" : ""}。`
    : `Valuation positions use closing prices as of ${asOf}${late ? " (later than that quarter's filing season)" : ""}.`;
}

export function emptyText(reason: EmptyReason, lang: ReportLang): string {
  const zh: Record<EmptyReason, string> = {
    no_filers: "本季还没有投资人申报。",
    no_qualifying: "本季暂无满足条件的股票。",
    no_valuation: "估值数据暂不可用，本节暂缺。",
  };
  const en: Record<EmptyReason, string> = {
    no_filers: "No tracked investor has filed for this quarter yet.",
    no_qualifying: "No stock meets the criteria this quarter.",
    no_valuation: "Valuation data is unavailable, so this section is empty for now.",
  };
  return (lang === "zh" ? zh : en)[reason];
}

export function kindLabel(kind: MoveKind, lang: ReportLang): string {
  const zh: Record<MoveKind, string> = { new: "新建仓", increased: "加仓", decreased: "减仓", exited: "清仓" };
  const en: Record<MoveKind, string> = { new: "New position", increased: "Added", decreased: "Trimmed", exited: "Sold out" };
  return (lang === "zh" ? zh : en)[kind];
}

export function sectionTitles(lang: ReportLang) {
  return lang === "zh"
    ? { bought: "共识买入", sold: "共识卖出", mostHeld: "持有人数最多", strikeZone: "被共同持有、处在击球区或价值带以下", featured: "名家动作", method: "方法与口径", source: "来源：SEC EDGAR 13F 申报" }
    : { bought: "Consensus buys", sold: "Consensus sells", mostHeld: "Most widely held", strikeZone: "Co-held stocks in the strike zone or below the value band", featured: "Notable investors", method: "Method and definitions", source: "Source: SEC EDGAR 13F filings" };
}

export function stockHref(s: ReportStock, lang: ReportLang): string | null {
  return s.ticker ? stockPath(lang, encodeURIComponent(s.ticker)) : null;
}

export function positionLabel(pos: "strike_zone" | "below", lang: ReportLang): string {
  return lang === "zh"
    ? (pos === "strike_zone" ? "击球区" : "价值带以下")
    : (pos === "strike_zone" ? "Strike zone" : "Below value band");
}

export function notFiledText(lang: ReportLang): string {
  return lang === "zh" ? "未申报" : "Not filed yet";
}

export function noComparableMovesText(lang: ReportLang): string {
  return lang === "zh" ? "本季无可比动作（缺上一季申报）" : "No comparable moves (no prior filing)";
}

export function disclaimerText(lang: ReportLang): string {
  return lang === "zh" ? "仅供学习，不构成投资建议。" : "For education only. Not investment advice.";
}

export function reportUrl(period: string, lang: ReportLang): string {
  return `${SITE_ORIGIN}${localePath(lang, `/learn/${reportSlug(period)}`)}`;
}

export function personName(f: FeaturedEntry, lang: ReportLang): string {
  return lang === "zh" && f.personZh ? f.personZh : f.person;
}
