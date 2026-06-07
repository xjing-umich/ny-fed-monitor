import React from "react";
import { notFound } from "next/navigation";
import type { Lang } from "@/lib/nav";
import type { MoveRow, MoveKind } from "@/lib/aggregations";
import { notableMoves } from "@/lib/aggregations";
import { stockPath } from "@/lib/urls";
import SubNav from "@/components/shell/SubNav";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { AggregateBlurb } from "@/components/aggregate/AggregateBlurb";
import { AggregateRankingList, type RankRow } from "@/components/aggregate/AggregateRankingList";
import { movesBlurb, type BlurbRow } from "@/lib/aggregate/blurb";

const KIND_LABEL: Record<MoveKind, { zh: string; en: string; tone: "positive" | "warn" }> = {
  new: { zh: "新建仓", en: "Opened", tone: "positive" },
  increased: { zh: "加仓", en: "Added", tone: "positive" },
  exited: { zh: "清仓", en: "Exited", tone: "warn" },
  decreased: { zh: "减仓", en: "Trimmed", tone: "warn" },
};

export async function MovesPage({ lang, side }: { lang: Lang; side: "buy" | "sell" }) {
  const isZh = lang === "zh";
  const { mostBought, mostSold } = await notableMoves(30);
  const data: MoveRow[] = side === "buy" ? mostBought : mostSold;

  const rankRows: RankRow[] = data.map((r) => {
    const k = KIND_LABEL[r.dominantKind];
    return {
      ticker: r.cusip, issuer: r.issuer, primary: r.count, value: r.value,
      kindLabel: isZh ? k.zh : k.en, kindTone: k.tone,
      href: stockPath(lang, r.cusip),
    };
  });
  const blurbRows: BlurbRow[] = rankRows.map((r) => ({ ticker: r.ticker, issuer: r.issuer, primary: r.primary }));

  const heading = side === "buy" ? (isZh ? "本季最多人买" : "Top buys") : (isZh ? "本季最多人卖" : "Top sells");
  const sub = side === "buy"
    ? (isZh ? "本季被最多超级投资者新建仓或加仓的股票。" : "Stocks most superinvestors opened or added this quarter.")
    : (isZh ? "本季被最多超级投资者清仓或减仓的股票。" : "Stocks most superinvestors exited or trimmed this quarter.");

  return (
    <div className="mx-auto max-w-4xl px-2 py-8 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: rankRows.slice(0, 20).map((r, i) => ({
            "@type": "ListItem", position: i + 1, name: `${r.ticker} ${r.issuer}`,
          })),
        }) }}
      />
      <SubNav lang={lang} section="investors" active={side === "buy" ? "buys" : "sells"} />
      <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">{heading}</h1>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">{sub}</p>
        <div className="mt-3"><DataAsOfBadge lang={lang} /></div>
      </div>
      <AggregateBlurb text={movesBlurb(blurbRows, side, lang)} />
      <AggregateRankingList lang={lang} rows={rankRows} primaryLabel={isZh ? "位大佬" : "managers"} />
    </div>
  );
}

export function notFoundIfBadLang(rawLang: string): asserts rawLang is Lang {
  if (rawLang !== "zh" && rawLang !== "en") notFound();
}
