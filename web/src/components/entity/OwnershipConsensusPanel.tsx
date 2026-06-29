import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { formatUSD } from "@/lib/format";
import { investorPath } from "@/lib/urls";
import { QuarterMovesPill, type QuarterMoves } from "@/components/entity/QuarterMovesPill";
import { buildConsensusSentence } from "@/lib/stocks/consensusSummary";

// 持仓 · 13F 共识信号面板(RSC, 零 hydration)。与估值面板同款式(rounded-md Panel),
// 上下并置 = "值不值 × 谁在买" 两个判断并列。中性陈述,非买卖建议。

const COPY = {
  zh: {
    eyebrow: "持仓 · 13F 共识",
    title: "谁在买",
    intro: "跨基金聚合的机构持仓——共识强度与本季动向,描述动作、不下判决。",
    strength: (n: number, total: string) => `${n} 位超级投资者持有 · 合计 ${total}`,
    largest: "头号重仓",
    flat: "本季无披露变动。",
    disclaimer: "13F 持仓为机构自行申报,可能滞后最多 45 天;仅供信息参考,非买卖建议。",
  },
  en: {
    eyebrow: "Ownership · 13F consensus",
    title: "Who's buying it",
    intro: "Institutional ownership aggregated across funds — consensus strength and this quarter's moves. Describes actions, not advice.",
    strength: (n: number, total: string) => `${n} superinvestor${n === 1 ? "" : "s"} hold it · ${total} combined`,
    largest: "Largest holder",
    flat: "No disclosed position changes this quarter.",
    disclaimer: "13F positions are self-reported and can lag up to 45 days. Informational only — not investment advice.",
  },
} as const;

export default function OwnershipConsensusPanel({
  issuer,
  ticker,
  n,
  totalValue,
  moves,
  topHolder,
  period,
  lang,
}: {
  issuer: string;
  ticker: string;
  n: number;
  totalValue: number;
  moves: QuarterMoves;
  topHolder: { person: string; slug: string };
  period: string;
  lang: Lang;
}): React.ReactElement {
  const t = COPY[lang];
  const hasMoves = moves.opened + moves.added + moves.trimmed + moves.exited > 0;
  const sentence = buildConsensusSentence({ issuer, ticker, n, moves, period }, lang);

  return (
    <section className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 sm:p-6">
      <header className="border-b border-[var(--tt-border-strong)] pb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{t.eyebrow}</p>
        <h2 className="mt-1.5 font-display text-lg font-medium leading-tight tracking-tight text-[var(--tt-text)]">
          {t.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">{t.intro}</p>
      </header>

      <div className="mt-4 space-y-3">
        {/* 共识强度: 数字克制(text, 非整块绿) */}
        <p className="text-sm text-[var(--tt-text)]">
          <span className="font-mono tabular-nums">{n}</span>{" "}
          <span className="text-[var(--tt-muted)]">{t.strength(n, formatUSD(totalValue)).replace(/^\d+\s*/, "")}</span>
        </p>

        {/* 本季动向: 复用 QuarterMovesPill(全零自返 null) + 退化句 */}
        {hasMoves ? <QuarterMovesPill moves={moves} lang={lang} /> : (
          <p className="text-sm text-[var(--tt-muted)]">{t.flat}</p>
        )}

        {/* 头号重仓人 → investor 页(接力棒回拉) */}
        <p className="text-sm text-[var(--tt-text)]">
          <span className="text-[var(--tt-faint)]">{t.largest} </span>
          <Link
            href={investorPath(lang, topHolder.slug)}
            className="text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]"
          >
            {topHolder.person}
          </Link>
        </p>

        {/* 自足 GEO 事实句(SSR, 可引用) */}
        <p className="sr-only">{sentence}</p>

        <p className="text-[10px] text-[var(--tt-faint)]">{t.disclaimer}</p>
      </div>
    </section>
  );
}
