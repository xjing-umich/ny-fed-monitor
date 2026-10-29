import Link from "next/link";
import type { ReactNode } from "react";
import type { Lang } from "@/lib/nav";
import { investorPath, localePath } from "@/lib/urls";
import {
  disclaimerText, emptyText, featuredKindLabel, methodologyCoverageText, featuredWeightNote, featuredWeightText, holderDeltaCell, kindLabel,
  noComparableMovesText, notFiledText, personName, positionLabel, STRIKE_ZONE_VISIBLE, strikeZoneMoreLabel, reportDescription, reportTitle, sectionTitles, statusLine, stockHref, valuationNote,
} from "@/lib/reports/copy";
import type { ReportRow, ReportStock, Section } from "@/lib/reports/types";

function StockCell({ s, lang }: { s: ReportStock; lang: Lang }) {
  const href = stockHref(s, lang);
  const name = s.ticker ?? s.issuer;
  return href ? (
    <Link href={href} className="text-[var(--tt-text)] underline decoration-[var(--tt-faint)] underline-offset-2 hover:text-[var(--tt-accent)]">{name}</Link>
  ) : (
    <span>{name}</span>
  );
}

function Block<T>({ title, source, sec, lang, children }: { title: string; source: string; sec: Section<T>; lang: Lang; children: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-4 border-b border-[var(--tt-border)] pb-2">
        <h2 className="text-lg font-medium text-[var(--tt-text)]">{title}</h2>
        <span className="font-data text-xs text-[var(--tt-muted)]">{source}</span>
      </div>
      {sec.items.length ? children : <p className="mt-3 text-base text-[var(--tt-muted)]">{emptyText(sec.emptyReason ?? "no_qualifying", lang)}</p>}
    </section>
  );
}

const th = "py-2 pr-3 text-left text-xs font-normal text-[var(--tt-muted)]";
const td = "py-2 pr-3 text-base text-[var(--tt-text)] border-t border-[var(--tt-border)]";

export default function ReportArticle({ row, lang }: { row: ReportRow; lang: Lang }) {
  const p = row.payload;
  const t = sectionTitles(lang);
  const zh = lang === "zh";
  const src = `SEC EDGAR · ${p.period}`;
  const inProgress = row.status === "live";

  const moveTable = (items: typeof p.bought.items) => (
    <table className="mt-3 w-full">
      <thead><tr><th className={th}>{zh ? "股票" : "Stock"}</th><th className={th}>{zh ? "人数" : "Funds"}</th><th className={th}>{zh ? "主要动作" : "Main move"}</th></tr></thead>
      <tbody>{items.map((i) => (
        <tr key={i.key}><td className={td}><StockCell s={i} lang={lang} /></td><td className={`${td} font-data`}>{i.managerCount}</td><td className={td}>{kindLabel(i.dominantKind, lang)}</td></tr>
      ))}</tbody>
    </table>
  );

  const strikeTable = (items: typeof p.strikeZone.items) => (
    <table className="mt-3 w-full">
      <thead><tr><th className={th}>{zh ? "股票" : "Stock"}</th><th className={th}>{zh ? "持有人数" : "Holders"}</th><th className={th}>{zh ? "位置" : "Position"}</th></tr></thead>
      <tbody>{items.map((i) => (
        <tr key={i.key}><td className={td}><StockCell s={i} lang={lang} /></td><td className={`${td} font-data`}>{i.holderCount}</td><td className={td}>{positionLabel(i.position, lang)}</td></tr>
      ))}</tbody>
    </table>
  );

  return (
    <article className="mx-auto max-w-[720px] py-8 sm:py-10">
      <p className="tt-eyebrow">{zh ? "季度报告" : "Quarterly report"}</p>
      <h1 className="mt-2 text-balance text-3xl font-medium leading-tight text-[var(--tt-text)]">{reportTitle(p.period, lang)}</h1>
      <p className="mt-3 font-data text-xs text-[var(--tt-muted)]">{statusLine(row, lang, row.payload.coverage.excluded ?? 0)}</p>
      <p className="mt-5 text-lg leading-relaxed text-[var(--tt-text)]">{reportDescription(p, row.status, lang)}</p>
      {inProgress ? <p className="mt-2 text-sm text-[var(--tt-muted)]">{zh ? "申报季进行中，下表计数均以已申报者为准，不是终值。" : "Filing season is in progress. Counts below cover only funds that have filed and are not final."}</p> : null}

      <Block title={t.bought} source={src} sec={p.bought} lang={lang}>{moveTable(p.bought.items)}</Block>
      <Block title={t.sold} source={src} sec={p.sold} lang={lang}>{moveTable(p.sold.items)}</Block>

      <Block title={t.mostHeld} source={src} sec={p.mostHeld} lang={lang}>
        <table className="mt-3 w-full">
          <thead><tr><th className={th}>{zh ? "股票" : "Stock"}</th><th className={th}>{zh ? "持有人数" : "Holders"}</th><th className={th}>{zh ? "较上季" : "vs. last quarter"}</th></tr></thead>
          <tbody>{p.mostHeld.items.map((i) => (
            <tr key={i.key}><td className={td}><StockCell s={i} lang={lang} /></td><td className={`${td} font-data`}>{i.holderCount}</td><td className={`${td} font-data`}>{holderDeltaCell(i.holderDelta, lang)}</td></tr>
          ))}</tbody>
        </table>
      </Block>

      <Block title={t.strikeZone} source={valuationNote(row.valuationAsOf, lang, p.period)} sec={p.strikeZone} lang={lang}>
        {strikeTable(p.strikeZone.items.slice(0, STRIKE_ZONE_VISIBLE))}
        {p.strikeZone.items.length > STRIKE_ZONE_VISIBLE ? (
          <details className="mt-2">
            <summary className="cursor-pointer py-2 text-sm text-[var(--tt-accent)]">{strikeZoneMoreLabel(p.strikeZone.items.length - STRIKE_ZONE_VISIBLE, lang)}</summary>
            {strikeTable(p.strikeZone.items.slice(STRIKE_ZONE_VISIBLE))}
          </details>
        ) : null}
      </Block>

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4 border-b border-[var(--tt-border)] pb-2">
          <h2 className="text-lg font-medium text-[var(--tt-text)]">{t.featured}</h2>
          <span className="font-data text-xs text-[var(--tt-muted)]">{src}</span>
        </div>
        <p className="mt-3 text-sm text-[var(--tt-muted)]">{featuredWeightNote(lang)}</p>
        <ul className="mt-3 flex flex-col gap-3">
          {p.featured.map((f) => (
            <li key={f.slug} className="text-base text-[var(--tt-text)]">
              <Link href={investorPath(lang, f.slug)} className="font-medium text-[var(--tt-text)] hover:text-[var(--tt-accent)]">{personName(f, lang)}</Link>
              <span className="text-[var(--tt-muted)]">{zh ? "：" : ": "}</span>
              {!f.filed
                ? <span className="text-[var(--tt-muted)]">{notFiledText(lang)}</span>
                : f.moves.length === 0
                  ? <span className="text-[var(--tt-muted)]">{noComparableMovesText(lang)}</span>
                  : f.moves.map((m, i) => (
                      <span key={m.key}>{i ? (zh ? "；" : "; ") : ""}{featuredKindLabel(m.kind, lang)} <StockCell s={m} lang={lang} />{zh ? "" : " "}<span className="font-data text-[var(--tt-muted)]">{featuredWeightText(m, lang)}</span></span>
                    ))}
            </li>
          ))}
        </ul>
      </section>

      <details className="mt-10 border-t border-[var(--tt-border)] pt-4">
        <summary className="cursor-pointer text-base font-medium text-[var(--tt-text)]">{t.method}</summary>
        <div className="mt-3 flex flex-col gap-2 text-base leading-relaxed text-[var(--ink-2)]">
          {(zh ? [
            methodologyCoverageText(p.coverage, lang),
            "共识买入 / 卖出：统计本季相对上一季新进或增持 / 减持或清仓的投资人数，期权不计；没有更早申报可比的投资人不计入买卖。",
            "持有人数“较上季”：只在本季已申报、且有上一季申报的同一批投资人内比较，避免申报季中有人尚未申报造成虚降。",
            `击球区与价值区间：来自本站估值引擎的保守价值区间，只取数据可靠的结果。${valuationNote(row.valuationAsOf, lang, p.period)}这里只描述价格相对价值区间的位置，不构成买卖建议。`,
            row.status === "final" ? "本报告定稿后不再随迟到申报或修正申报变化；最新情况见实时共识页。" : "申报季结束、覆盖率达标后，本报告会定稿冻结。",
          ] : [
            methodologyCoverageText(p.coverage, lang),
            "Consensus buys / sells count the funds that opened or added to / trimmed or sold out of a position versus the prior quarter. Options are excluded, and funds with no earlier filing to compare against are left out of buys and sells.",
            "Holder change vs. last quarter compares the same funds only: those that have filed this quarter and also filed the prior one, so funds that have not filed yet do not drag counts down.",
            `Strike zone and value range come from this site's conservative valuation range, using reliable results only. ${valuationNote(row.valuationAsOf, lang, p.period)} They describe where price sits relative to value and are not a recommendation.`,
            row.status === "final" ? "This report is frozen once final; later or amended filings do not change it. See the live consensus page for the current picture." : "Once the filing season closes and coverage is high enough, this report will be finalized and frozen.",
          ]).map((s) => <p key={s.slice(0, 24)}>{s}</p>)}
          <p>
            <Link href={localePath(lang, "/learn/what-is-intrinsic-value")} className="text-[var(--tt-accent)]">{zh ? "什么是内在价值 →" : "What is intrinsic value →"}</Link>
          </p>
          <p>
            <Link href={localePath(lang, "/investors/consensus")} className="text-[var(--tt-accent)]">{zh ? "实时共识页 →" : "Live consensus page →"}</Link>
          </p>
        </div>
      </details>

      <p className="mt-8 font-data text-xs text-[var(--tt-muted)]">{t.source} · {disclaimerText(lang)}</p>
    </article>
  );
}
