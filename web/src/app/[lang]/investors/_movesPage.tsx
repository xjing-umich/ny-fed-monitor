import React, { cache } from "react";
import { rankingMetadata } from "@/lib/seo";
import { readStockLinkHolders } from '@/lib/managers/consensusRead';
import { currentStockKeys, availableStockHref } from '@/lib/stocks/stockLinks';
import { notFound } from "next/navigation";
import type { Lang } from "@/lib/nav";
import type { MoveRow } from "@/lib/aggregations";
import { notableMoves } from "@/lib/aggregations";
import { absoluteUrl, localePath, HTML_LANG } from "@/lib/urls";
import { cleanIssuer } from "@/lib/format";
import { isLikelyTicker } from "@/lib/externalLinks";
import { ShareButton } from "@/components/share/ShareButton";
import { buildShareText, shareLabels } from "@/lib/share/shareText";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { AggregateBlurb } from "@/components/aggregate/AggregateBlurb";
import { AggregateRankingList, type RankRow } from "@/components/aggregate/AggregateRankingList";
import { movesBlurb, type BlurbRow } from "@/lib/aggregate/blurb";
import { getManagerIndex } from "@/lib/managers/source";
import { managerLabel } from "@/lib/managers/displayName";
import { effectiveMovesPeriod, quarterLabel } from "@/lib/freshness/derive";

function movesFootnote(
  lang: Lang,
  effective: ReturnType<typeof effectiveMovesPeriod>,
  lagged: { slug: string; person: string; period: string }[],
): string {
  // 季度标签统一走 quarterLabel:同页正文与标题已是「Q2 2026」,此处若留裸 ISO
  // (「2026-06-30」)会让同一个季度在一屏里出现两种写法,还容易被读成「某天的过期数据」。
  const baseline = quarterLabel(effective.period, lang) || "—";
  const max = quarterLabel(effective.maxPeriod, lang);
  const { filed, total } = effective.coverage;
  if (lang === "zh") {
    let s = `统计基准季：${baseline}。`;
    if (effective.reason === "before_deadline" || effective.reason === "low_coverage") {
      const why =
        effective.reason === "before_deadline" ? "截止日前" : `覆盖率 ${filed}/${total}`;
      s = `统计基准季：${baseline}（${max} 尚未达到披露门槛：${why}）。`;
      if (max && max !== baseline && filed > 0) {
        s += `另有 ${filed} 位已交 ${max}。`;
      }
    }
    if (lagged.length > 0) {
      s += `未计入（最新申报更早）：${lagged.map((m) => `${managerLabel(lang, m.slug, m.person)}（${quarterLabel(m.period, lang)}）`).join("、")}。`;
    }
    return s;
  }
  let s = `Baseline quarter: ${baseline}.`;
  if (effective.reason === "before_deadline" || effective.reason === "low_coverage") {
    const why =
      effective.reason === "before_deadline"
        ? "before filing deadline"
        : `coverage ${filed}/${total}`;
    s = `Baseline quarter: ${baseline} (${max} not yet at disclosure threshold: ${why}).`;
    if (max && max !== baseline && filed > 0) {
      s += ` ${filed} managers have already filed ${max}.`;
    }
  }
  if (lagged.length > 0) {
    s += ` Not counted (older latest filing): ${lagged.map((m) => `${managerLabel(lang, m.slug, m.person)} (${quarterLabel(m.period, lang)})`).join(", ")}.`;
  }
  return s;
}

export async function MovesPage({ lang, side }: { lang: Lang; side: "buy" | "sell" }) {
  const isZh = lang === "zh";
  const { moves: { mostBought, mostSold }, idx, effective, availableStocks } = await getMovesPageData();
  const data: MoveRow[] = side === "buy" ? mostBought : mostSold;
  const baseline = effective.period;
  // Only managers older than the moves baseline — early maxPeriod filers are
  // covered by the “另有 N 位已交 max” clause, not this “older filing” list.
  const lagged = idx.managers.filter(
    (m) => baseline != null && m.period < baseline,
  );
  const qLabel = quarterLabel(baseline, lang) || baseline || "—";

  const rankRows: RankRow[] = data.map((r) => {
    return {
      ticker: r.cusip, issuer: r.issuer, primary: r.count,
      // 金额是买方期末持仓市值合计,只在买入榜带标签展示;卖出榜的金额混了两种口径(减持按剩余、清仓按上季),不展示。
      ...(side === "buy" ? { value: r.value, valueLabel: isZh ? "买方季末持仓市值合计" : "Buyers' combined quarter-end holding value" } : {}),
      kindLabel: side === "buy" ? (isZh ? "新进或增持" : "Opened or increased positions") : (isZh ? "清仓或减持" : "Exited or trimmed positions"), kindTone: side === "buy" ? "positive" : "warn",
      href: availableStockHref(lang, r.cusip, availableStocks),
    };
  });
  const blurbRows: BlurbRow[] = rankRows.map((r) => ({ ticker: r.ticker, issuer: r.issuer, primary: r.primary }));

  const heading = side === "buy" ? (isZh ? "最多人买" : "Top buys") : (isZh ? "最多人卖" : "Top sells");
  const top = rankRows[0];
  const shareSlug = side === "buy" ? "buys" : "sells";
  const shareUrl = absoluteUrl(localePath(lang, `/investors/${shareSlug}`));
  const shareText = buildShareText(
    side === "buy"
      ? { kind: "buys", topName: top?.issuer ?? null, count: top?.primary ?? null, quarterLabel: qLabel }
      : { kind: "sells", topName: top?.issuer ?? null, count: top?.primary ?? null, quarterLabel: qLabel },
    lang,
    heading,
  );
  const sub = side === "buy"
    ? (isZh ? `在 ${qLabel} 被最多超级投资者新进或增持的股票。` : `Stocks in which the most tracked managers opened or increased positions in ${qLabel}.`)
    : (isZh ? `在 ${qLabel} 被最多超级投资者清仓或减持的股票。` : `Stocks in which the most tracked managers exited or trimmed positions in ${qLabel}.`);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          inLanguage: HTML_LANG[lang],
          // 条目带清洗后的名称和个股页链接,AI/搜索引擎能把榜单项对到具体实体。
          itemListElement: rankRows.slice(0, 20).map((r, i) => ({
            "@type": "ListItem", position: i + 1, name: cleanIssuer(r.issuer),
            ...(r.href && isLikelyTicker(r.ticker) ? { url: absoluteUrl(r.href) } : {}),
          })),
        }) }}
      />
      <SubNav lang={lang} section="investors" active={side === "buy" ? "buys" : "sells"} />
      <div className="pb-8 sm:pb-10">
        <div className="mb-6">
          <PageHeader
            eyebrow={isZh ? `13F 动向 · ${qLabel}` : `13F moves · ${qLabel}`}
            title={heading}
            intro={sub}
            dateline={<DataAsOfBadge lang={lang} asOf={quarterLabel(baseline, lang) || undefined} />}
            action={
              <ShareButton
                url={shareUrl}
                text={shareText}
                labels={shareLabels(lang)}
                meta={{ entity: shareSlug, entityType: shareSlug, lang }}
              />
            }
          />
          <p className="mt-3 text-xs text-[var(--tt-muted)]">
            {movesFootnote(lang, effective, lagged)}
          </p>
        </div>
        <AggregateBlurb text={movesBlurb(blurbRows, side, lang, qLabel)} />
        <AggregateRankingList lang={lang} rows={rankRows} primaryLabel={isZh ? "位投资者" : "managers"} />
      </div>
    </>
  );
}

export function notFoundIfBadLang(rawLang: string): asserts rawLang is Lang {
  if (rawLang !== "zh" && rawLang !== "en") notFound();
}

const getMovesPageData = cache(async () => {
  const [moves, idx] = await Promise.all([notableMoves(30), getManagerIndex()]);
  const now = new Date();
  const availableStocks = currentStockKeys((await readStockLinkHolders([...moves.mostBought, ...moves.mostSold].map((r) => r.cusip))) ?? [], now);
  return { moves, idx, availableStocks, effective: effectiveMovesPeriod(idx.managers.map((m) => m.period), now) };
});

export async function movesMetadata(lang: Lang, side: 'buy' | 'sell') {
  const { moves, effective } = await getMovesPageData();
  const first = (side === 'buy' ? moves.mostBought : moves.mostSold)[0];
  return rankingMetadata(lang, side === 'buy' ? 'buys' : 'sells', effective.period, first ? { ticker: first.cusip, count: first.count } : null);
}
