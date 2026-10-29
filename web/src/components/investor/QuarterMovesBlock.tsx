import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { QuarterSummary } from "@/lib/managers/quarterSummary";
import { conclusionSentence, moveDeltaText, movesCountsLine, splitNote } from "@/lib/managers/investorConclusion";
import { MOVE_GLYPH, MOVE_LABEL } from "@/lib/entity/quarterMovesText";
import { date as formatDate } from "@/lib/i18n/format";
import { splitNames } from "@/lib/entity/quarterMovesText";
import { fmtPct1 } from "@/components/common/qoqDirection";
import { formatUSD } from "@/lib/format";
import { SectionHeading } from "@/components/common/SectionHeading";

const COPY = {
  zh: {
    eyebrow: "SEC 13F · 本季对上季",
    title: "本季动作",
    approx: (v: string) => `约 ${v}`,
    weight: (w: string) => `现占 ${w}`,
    exited: "清仓：",
    rest: (n: number) => ` 等 ${n} 只`,
    lag: (p: string) => `13F 只披露季末持仓，${p} 之后的买卖这里看不到。`,
    method: "金额按季末价估算，只算正股。",
    sep: "、",
  },
  en: {
    eyebrow: "SEC 13F · quarter over quarter",
    title: "This quarter",
    approx: (v: string) => `≈${v}`,
    weight: (w: string) => `now ${w}`,
    exited: "Exited: ",
    rest: (n: number) => ` +${n} more`,
    lag: (p: string) => `13F shows quarter-end positions only; trades after ${p} aren't visible here.`,
    method: "Dollar amounts are estimated at quarter-end prices, stocks only (no options).",
    sep: ", ",
  },
} as const;

// 投资人页首屏:一句按金额的结论 + 金额最大的几笔 + 一行计数 + 清仓名单 + 滞后与口径。
// 动作用字形不用颜色(绿色只给估值);数字来自 summarizeQuarter,与列表页同源。
export function QuarterMovesBlock({ lang, summary, quarter, nameOf, hrefOf }: {
  lang: Lang;
  summary: QuarterSummary;
  quarter: string;
  nameOf: (cusip: string, issuer: string) => string;
  hrefOf: (cusip: string) => string;
}): React.ReactElement {
  const c = COPY[lang];
  const { shown, rest } = splitNames(summary.exits);
  return (
    <section id="moves" aria-label={c.title} className="scroll-mt-32">
      <SectionHeading eyebrow={c.eyebrow} title={c.title} />
      <p className="mt-3 text-base text-[var(--tt-text)]">
        {conclusionSentence(summary, quarter, (m) => nameOf(m.cusip, m.issuer), lang)}
      </p>
      {summary.topMoves.length > 0 && (
        <ul className="mt-4 list-none divide-y divide-[var(--tt-border)] border-y border-[var(--tt-border)] p-0">
          {summary.topMoves.map((m) => (
            <li key={`${m.cusip}|${m.kind}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 py-2 text-sm">
              <span className="whitespace-nowrap font-data text-xs text-[var(--tt-muted)]">{`${MOVE_GLYPH[m.kind]} ${MOVE_LABEL[lang][m.kind]}`}</span>
              <Link href={hrefOf(m.cusip)} className="min-w-0 truncate text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                {nameOf(m.cusip, m.issuer)}
              </Link>
              <span className="font-data tabular-nums text-[var(--tt-text)]">{c.approx(formatUSD(Math.abs(m.flowUsd), lang))}</span>
              <div className="col-span-2 col-start-2 flex flex-wrap gap-x-3 gap-y-1">
              {m.kind !== "new" && m.kind !== "exited" && (
                <span className="font-data tabular-nums text-[var(--tt-muted)]">{moveDeltaText(m, lang)}</span>
              )}
              {m.weightAfter != null && (
                <span className="font-data tabular-nums text-[var(--tt-faint)]">{c.weight(fmtPct1(m.weightAfter))}</span>
              )}
              </div>
              {m.splitFactor && <span className="col-span-3 text-xs text-[var(--tt-faint)]">{splitNote(m.splitFactor, lang)}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-[var(--tt-muted)]">{movesCountsLine(summary.counts, lang)}</p>
      {shown.length > 0 && (
        <p className="mt-1 text-xs text-[var(--tt-muted)]">
          {`${MOVE_GLYPH.exited} ${c.exited}`}
          {shown.map((e, i) => (
            <React.Fragment key={e.cusip}>
              {i > 0 && c.sep}
              <Link href={hrefOf(e.cusip)} className="text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                {nameOf(e.cusip, e.issuer)}
              </Link>
            </React.Fragment>
          ))}
          {rest > 0 && c.rest(rest)}
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--tt-faint)]">{c.lag(formatDate(summary.period, lang))} {c.method}</p>
    </section>
  );
}
