import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { mostHeld, holderDeltas } from "@/lib/aggregations";
import { getManagerIndex } from "@/lib/managers/source";
import { stockPath, absoluteUrl } from "@/lib/urls";
import { altFor } from "@/lib/seo";
import { ShareButton } from "@/components/share/ShareButton";
import { buildShareText, shareLabels } from "@/lib/share/shareText";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { AggregateBlurb } from "@/components/aggregate/AggregateBlurb";
import { AggregateRankingList, type RankRow } from "@/components/aggregate/AggregateRankingList";
import { consensusBlurb, type BlurbRow } from "@/lib/aggregate/blurb";
import { freshness13F, globalLatestPeriod } from "@/lib/freshness/derive";

export const revalidate = 86400; // 季度级数据, 每日 ISR 足够

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const isZh = rawLang === "zh";
  const lang = isZh ? "zh" : "en";
  const alternates = altFor(lang, "/investors/consensus");
  return isZh
    ? { title: "共识持仓 · 超级投资者 — Compounder · 复利", description: "顶级价值投资者 13F 中被最多人同时持有的股票，含季度环比。", alternates }
    : { title: "Consensus holdings · Superinvestors — Compounder", description: "Stocks held by the most superinvestors (13F), with quarter-over-quarter change.", alternates };
}

export default async function ConsensusPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";

  const [rows, deltas, idx] = await Promise.all([mostHeld(50), holderDeltas(), getManagerIndex()]);
  const managerCount = idx.managers.length;
  const globalLatest = globalLatestPeriod(idx.managers.map((m) => m.period));
  const staleManagers = idx.managers.filter((m) => freshness13F(m.period, globalLatest) === "stale");
  const totalSum = rows.reduce((s, r) => s + r.totalValue, 0) || 1;

  const rankRows: RankRow[] = rows.map((r) => ({
    ticker: r.cusip, issuer: r.issuer, primary: r.holderCount,
    delta: deltas.get(r.cusip) ?? null,
    pctOfAggregate: r.totalValue / totalSum,
    href: stockPath(lang, r.cusip),
  }));
  const blurbRows: BlurbRow[] = rankRows.map((r) => ({ ticker: r.ticker, issuer: r.issuer, primary: r.primary, delta: r.delta }));
  const top = rankRows[0];
  const shareUrl = absoluteUrl(`/${lang}/investors/consensus`);
  const shareText = buildShareText(
    { kind: "consensus", topName: top?.issuer ?? null, holderCount: top?.primary ?? null, managerCount },
    lang,
    isZh ? "共识持仓" : "Consensus holdings",
  );

  return (
    <>
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
      <div className="pb-8 sm:pb-10">
        <div className="mb-6">
          <PageHeader
            eyebrow={isZh ? "跨基金共识 · SEC 13F" : "Cross-fund consensus · SEC 13F"}
            title={isZh ? "共识持仓" : "Consensus holdings"}
            intro={isZh ? "最多超级投资者同时持有的股票，按持有人数排列。" : "Stocks held by the most superinvestors, ranked by holder count."}
            dateline={<DataAsOfBadge lang={lang} />}
            action={
              <ShareButton
                url={shareUrl}
                text={shareText}
                labels={shareLabels(lang)}
                meta={{ entity: "consensus", entityType: "consensus", lang }}
              />
            }
          />
          {staleManagers.length > 0 && (
            <p className="mt-3 text-xs text-[var(--tt-faint)]">
              {isZh
                ? `注：${staleManagers.map((m) => `${m.person}（数据截至 ${m.period}）`).join("、")} 的持仓按其最新申报计入，环比变动不计。`
                : `Note: ${staleManagers.map((m) => `${m.person} (as of ${m.period})`).join(", ")} counted per their latest filing; excluded from QoQ deltas.`}
            </p>
          )}
        </div>
        <AggregateBlurb text={consensusBlurb(blurbRows, managerCount, lang)} />
        <AggregateRankingList lang={lang} rows={rankRows} primaryLabel={isZh ? "持有" : "holders"} />
      </div>
    </>
  );
}
