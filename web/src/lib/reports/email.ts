// 季度报告邮件(纯函数)。与报告页同一份 payload、同一套文案;表格式简单 HTML,兼容主流邮件客户端。
import {
  emptyText, kindLabel, personName, pct, reportDescription, reportTitle, reportUrl, sectionTitles, stockHref, valuationNote,
} from "./copy";
import { SITE_ORIGIN } from "../urls";
import type { EmptyReason, ReportLang, ReportPayload, ReportStatus, ReportStock } from "./types";

export const UNSUBSCRIBE_TOKEN = "{{{RESEND_UNSUBSCRIBE_URL}}}";
const EMAIL_TOP = 3;

export type EmailMeta = {
  status: ReportStatus;
  coverageFiled: number;
  coverageTotal: number;
  finalizedAt: string | null;
  valuationAsOf: string | null;
  isFirstIssue: boolean;
  postalAddress?: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function stockCellHtml(s: ReportStock, lang: ReportLang): string {
  const href = stockHref(s, lang);
  const name = esc(s.ticker ?? s.issuer);
  return href ? `<a href="${SITE_ORIGIN}${href}" style="color:#1a1a1a">${name}</a>` : name;
}
const stockText = (s: ReportStock) => s.ticker ?? s.issuer;

type Row = { cells: string[]; textCells: string[] };

function block(title: string, sec: { emptyReason: EmptyReason | null }, rows: Row[], lang: ReportLang) {
  const html = rows.length
    ? `<table role="presentation" width="100%" cellpadding="6" style="border-collapse:collapse;font-size:14px">${rows
        .map((r) => `<tr>${r.cells.map((c) => `<td style="border-bottom:1px solid #eee">${c}</td>`).join("")}</tr>`)
        .join("")}</table>`
    : `<p style="color:#666;font-size:14px">${esc(emptyText(sec.emptyReason ?? "no_qualifying", lang))}</p>`;
  const text = rows.length ? rows.map((r) => `- ${r.textCells.join(" · ")}`).join("\n") : emptyText(sec.emptyReason ?? "no_qualifying", lang);
  return {
    html: `<h2 style="font-size:16px;margin:24px 0 8px">${esc(title)}</h2>${html}`,
    text: `${title}\n${text}`,
  };
}

export function renderReportEmail(p: ReportPayload, meta: EmailMeta, lang: ReportLang) {
  const t = sectionTitles(lang);
  const zh = lang === "zh";
  const title = reportTitle(p.period, lang);
  const conclusion = reportDescription(p, meta.status, lang);
  const people = zh ? "位" : "funds";

  const moveRows = (items: typeof p.bought.items): Row[] =>
    items.slice(0, EMAIL_TOP).map((i) => ({
      cells: [stockCellHtml(i, lang), esc(`${i.managerCount} ${people}`), esc(kindLabel(i.dominantKind, lang))],
      textCells: [stockText(i), `${i.managerCount} ${people}`, kindLabel(i.dominantKind, lang)],
    }));
  const heldRows: Row[] = p.mostHeld.items.slice(0, EMAIL_TOP).map((i) => {
    const d = i.holderDelta > 0 ? `+${i.holderDelta}` : `${i.holderDelta}`;
    const c = zh ? `${i.holderCount} 位（较上季 ${d}）` : `${i.holderCount} holders (${d})`;
    return { cells: [stockCellHtml(i, lang), esc(c)], textCells: [stockText(i), c] };
  });
  const szRows: Row[] = p.strikeZone.items.slice(0, EMAIL_TOP).map((i) => {
    const pos = i.position === "strike_zone" ? (zh ? "击球区" : "Strike zone") : (zh ? "价值带以下" : "Below value band");
    const c = zh ? `${i.holderCount} 位持有` : `${i.holderCount} holders`;
    return { cells: [stockCellHtml(i, lang), esc(c), esc(pos)], textCells: [stockText(i), c, pos] };
  });
  const featRows: Row[] = p.featured.map((f) => {
    const name = personName(f, lang);
    const what = !f.filed
      ? (zh ? "未申报" : "Not filed yet")
      : f.moves.length
        ? f.moves.map((m) => `${kindLabel(m.kind, lang)} ${stockText(m)} ${pct(m.weightBefore)} → ${pct(m.weightAfter)}`).join(zh ? "；" : "; ")
        : (zh ? "本季无可比动作" : "No comparable moves");
    return { cells: [esc(name), esc(what)], textCells: [name, what] };
  });

  const blocks = [
    block(t.bought, p.bought, moveRows(p.bought.items), lang),
    block(t.sold, p.sold, moveRows(p.sold.items), lang),
    block(t.mostHeld, p.mostHeld, heldRows, lang),
    block(t.strikeZone, p.strikeZone, szRows, lang),
    block(t.featured, { emptyReason: "no_qualifying" }, featRows, lang),
  ];

  const url = reportUrl(p.period, lang);
  const zhLink = reportUrl(p.period, "zh");
  const first = meta.isFirstIssue
    ? (zh ? "你之前在 thecompounder.fyi 订阅了季度更新，这是第一期。" : "You subscribed to quarterly updates on thecompounder.fyi. This is the first issue.")
    : "";
  const cta = zh ? "看完整报告" : "Read the full report";
  const disclaimer = zh ? "仅供学习，不构成投资建议。" : "For education only. Not investment advice.";
  const unsub = zh ? "退订" : "Unsubscribe";
  const source = `${t.source} · ${valuationNote(meta.valuationAsOf, lang)}`;
  const addr = meta.postalAddress ? meta.postalAddress : "";

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#fff;color:#1a1a1a;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;line-height:1.5">
<div style="max-width:600px;margin:0 auto">
${zh ? "" : `<p style="font-size:13px;margin:0 0 12px"><a href="${zhLink}" style="color:#555">中文版 →</a></p>`}
${first ? `<p style="font-size:14px;color:#555">${esc(first)}</p>` : ""}
<h1 style="font-size:20px;margin:0 0 8px">${esc(title)}</h1>
<p style="font-size:15px">${esc(conclusion)}</p>
${blocks.map((b) => b.html).join("\n")}
<p style="margin:28px 0"><a href="${url}" style="background:#1a1a1a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px">${esc(cta)}</a></p>
<p style="font-size:12px;color:#666">${esc(source)}<br>${esc(disclaimer)}${addr ? `<br>${esc(addr)}` : ""}<br><a href="${UNSUBSCRIBE_TOKEN}" style="color:#666">${unsub}</a></p>
</div></body></html>`;

  const text = [
    zh ? "" : `中文版: ${zhLink}`,
    first,
    title,
    conclusion,
    ...blocks.map((b) => b.text),
    `${cta}: ${url}`,
    source,
    disclaimer,
    addr,
    `${unsub}: ${UNSUBSCRIBE_TOKEN}`,
  ].filter(Boolean).join("\n\n");

  const subject = zh
    ? `${title}：${p.coverage.filed} 家机构这季动了什么`
    : `${title}: what ${p.coverage.filed} funds did`;
  return { subject, previewText: conclusion.slice(0, 200), html, text };
}
