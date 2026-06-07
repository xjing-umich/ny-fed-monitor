import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { mostHeld, holderDeltas } from "@/lib/aggregations";
import { getManagerIndex } from "@/lib/managers/source";
import { stockPath } from "@/lib/urls";
import SubNav from "@/components/shell/SubNav";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { AggregateBlurb } from "@/components/aggregate/AggregateBlurb";
import { AggregateRankingList, type RankRow } from "@/components/aggregate/AggregateRankingList";
import { consensusBlurb, type BlurbRow } from "@/lib/aggregate/blurb";

export const revalidate = 86400; // 季度级数据, 每日 ISR 足够

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const isZh = rawLang === "zh";
  return isZh
    ? { title: "共识持仓 · 超级投资者 — Compounder · 复利", description: "顶级价值投资者 13F 中被最多人同时持有的股票，含季度环比。" }
    : { title: "Consensus holdings · Superinvestors — Compounder", description: "Stocks held by the most superinvestors (13F), with quarter-over-quarter change." };
}

export default async function ConsensusPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";

  const [rows, deltas, idx] = await Promise.all([mostHeld(50), holderDeltas(), getManagerIndex()]);
  const managerCount = idx.managers.length;
  const totalSum = rows.reduce((s, r) => s + r.totalValue, 0) || 1;

  const rankRows: RankRow[] = rows.map((r) => ({
    ticker: r.cusip, issuer: r.issuer, primary: r.holderCount,
    delta: deltas.get(r.cusip) ?? null,
    pctOfAggregate: r.totalValue / totalSum,
    href: stockPath(lang, r.cusip),
  }));
  const blurbRows: BlurbRow[] = rankRows.map((r) => ({ ticker: r.ticker, issuer: r.issuer, primary: r.primary, delta: r.delta }));

  return (
    <div className="mx-auto max-w-4xl px-2 py-8 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: rankRows.slice(0, 20).map((r, i) => ({
            "@type": "ListItem", position: i + 1, name: r.issuer,
          })),
        }) }}
      />
      <SubNav lang={lang} section="investors" active="consensus" />
      <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {isZh ? "共识持仓" : "Consensus holdings"}
        </h1>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">
          {isZh ? "最多超级投资者同时持有的股票，按持有人数排列。" : "Stocks held by the most superinvestors, ranked by holder count."}
        </p>
        <div className="mt-3"><DataAsOfBadge lang={lang} /></div>
      </div>
      <AggregateBlurb text={consensusBlurb(blurbRows, managerCount, lang)} />
      <AggregateRankingList lang={lang} rows={rankRows} primaryLabel={isZh ? "持有" : "holders"} />
    </div>
  );
}
