import React, { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { mostHeld, holderDeltas } from "@/lib/aggregations";
import { getManagerIndex } from "@/lib/managers/source";
import { stockPath, absoluteUrl, localePath } from "@/lib/urls";
import { cleanIssuer } from "@/lib/format";
import { isLikelyTicker } from "@/lib/externalLinks";
import { altFor, ogFor, rankingMetadata } from "@/lib/seo";
import { ShareButton } from "@/components/share/ShareButton";
import { buildShareText, shareLabels } from "@/lib/share/shareText";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { NotCountedNote } from "@/components/aggregate/NotCountedNote";
import { AggregateBlurb } from "@/components/aggregate/AggregateBlurb";
import { AggregateRankingList, type RankRow } from "@/components/aggregate/AggregateRankingList";
import { consensusBlurb, type BlurbRow } from "@/lib/aggregate/blurb";
import { countsAsCurrentHolder, effectiveMovesPeriod, quarterLabel } from "@/lib/freshness/derive";
import { readValuationVerdicts } from "@/lib/valuation/valuationSnapshot";
import { latestIsoDate, valuationAsOfText } from "@/lib/valuation/asOf";

export const revalidate = 259200; // 季度级数据;列表页 3 天,见 app/[lang]/page.tsx 注释

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const isZh = rawLang === "zh";
  const lang = isZh ? "zh" : "en";
  const alternates = altFor(lang, "/investors/consensus");
  const { rows, effective } = await getConsensusData();
  const meta = rankingMetadata(lang, 'consensus', effective.period, rows[0] ? { ticker: rows[0].cusip, count: rows[0].holderCount } : null);
  return {
    ...meta,
    alternates,
    // 本路由自带 opengraph-image,不带品牌卡图以免盖掉它。
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, "/investors/consensus"), brandImage: false }),
  };
}

export default async function ConsensusPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";

  const { rows, deltas, idx, effective } = await getConsensusData();
  const verdicts = await readValuationVerdicts(rows.map((r) => r.cusip));
  // 榜上估值徽章来自估值快照:标出所用收盘价日期。
  const valuationAsOf = valuationAsOfText(lang, latestIsoDate([...verdicts.values()].map((v) => v.priceDate)));
  // 已过最近到期季截止日仍没交 13F 的 manager 不计入持有人(与 consensus 快照同一判定),分母同步扣除。
  const now = new Date();
  const overdueManagers = idx.managers.filter((m) => !countsAsCurrentHolder(m.period, now));
  const managerCount = idx.managers.length - overdueManagers.length;
  // 「数据截至」与首页 masthead、buys/sells、个股页同一口径(effectiveMovesPeriod)。
  const asOfLabel = quarterLabel(effective.period, lang) || undefined;
  const totalSum = rows.reduce((s, r) => s + r.totalValue, 0) || 1;

  const rankRows: RankRow[] = rows.map((r) => ({
    ticker: r.cusip, issuer: r.issuer, primary: r.holderCount,
    delta: deltas.get(r.cusip) ?? null,
    pctOfAggregate: r.totalValue / totalSum,
    href: stockPath(lang, r.cusip),
    valuation: verdicts.get(r.cusip.toUpperCase()),
  }));
  const blurbRows: BlurbRow[] = rankRows.map((r) => ({ ticker: r.ticker, issuer: r.issuer, primary: r.primary, delta: r.delta }));
  const top = rankRows[0];
  const shareUrl = absoluteUrl(localePath(lang, "/investors/consensus"));
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
          // 条目带清洗后的名称和个股页链接,AI/搜索引擎能把榜单项对到具体实体。
          itemListElement: rankRows.slice(0, 20).map((r, i) => ({
            "@type": "ListItem", position: i + 1, name: cleanIssuer(r.issuer),
            ...(isLikelyTicker(r.ticker) ? { url: absoluteUrl(stockPath(lang, r.ticker)) } : {}),
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
            dateline={<DataAsOfBadge lang={lang} asOf={asOfLabel} />}
            action={
              <ShareButton
                url={shareUrl}
                text={shareText}
                labels={shareLabels(lang)}
                meta={{ entity: "consensus", entityType: "consensus", lang }}
              />
            }
          />
          <NotCountedNote lang={lang} managers={overdueManagers} />
        </div>
        <AggregateBlurb text={consensusBlurb(blurbRows, managerCount, lang)} />
        {valuationAsOf && (
          <p className="mb-2 font-data text-xs text-[var(--tt-faint)]">
            {isZh ? `估值徽章：${valuationAsOf}（SEC 财报 × 收盘价）` : `Valuation badges: ${valuationAsOf} (SEC filings × closing prices)`}
          </p>
        )}
        <AggregateRankingList lang={lang} rows={rankRows} primaryLabel={isZh ? "持有" : "holders"} />
      </div>
    </>
  );
}

const getConsensusData = cache(async () => {
  const [rows, deltas, idx] = await Promise.all([mostHeld(50), holderDeltas(), getManagerIndex()]);
  return { rows, deltas, idx, effective: effectiveMovesPeriod(idx.managers.map((m) => m.period), new Date()) };
});
