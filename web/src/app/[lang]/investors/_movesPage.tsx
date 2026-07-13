import React from "react";
import { notFound } from "next/navigation";
import type { Lang } from "@/lib/nav";
import type { MoveRow, MoveKind } from "@/lib/aggregations";
import { notableMoves } from "@/lib/aggregations";
import { stockPath, absoluteUrl, localePath } from "@/lib/urls";
import { ShareButton } from "@/components/share/ShareButton";
import { buildShareText, shareLabels } from "@/lib/share/shareText";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { AggregateBlurb } from "@/components/aggregate/AggregateBlurb";
import { AggregateRankingList, type RankRow } from "@/components/aggregate/AggregateRankingList";
import { movesBlurb, type BlurbRow } from "@/lib/aggregate/blurb";
import { getManagerIndex } from "@/lib/managers/source";
import { effectiveMovesPeriod, quarterLabel } from "@/lib/freshness/derive";

const KIND_LABEL: Record<MoveKind, { zh: string; en: string; tone: "positive" | "warn" }> = {
  new: { zh: "新建仓", en: "Opened", tone: "positive" },
  increased: { zh: "加仓", en: "Added", tone: "positive" },
  exited: { zh: "清仓", en: "Exited", tone: "warn" },
  decreased: { zh: "减仓", en: "Trimmed", tone: "warn" },
};

function movesFootnote(
  lang: Lang,
  effective: ReturnType<typeof effectiveMovesPeriod>,
  lagged: { person: string; period: string }[],
): string {
  const baseline = effective.period ?? "—";
  const max = effective.maxPeriod;
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
      s += `未计入（最新申报更早）：${lagged.map((m) => `${m.person}（${m.period}）`).join("、")}。`;
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
    s += ` Not counted (older latest filing): ${lagged.map((m) => `${m.person} (${m.period})`).join(", ")}.`;
  }
  return s;
}

export async function MovesPage({ lang, side }: { lang: Lang; side: "buy" | "sell" }) {
  const isZh = lang === "zh";
  const [{ mostBought, mostSold }, idx] = await Promise.all([notableMoves(30), getManagerIndex()]);
  const data: MoveRow[] = side === "buy" ? mostBought : mostSold;
  const periods = idx.managers.map((m) => m.period);
  const effective = effectiveMovesPeriod(periods, new Date());
  const baseline = effective.period;
  // Only managers older than the moves baseline — early maxPeriod filers are
  // covered by the “另有 N 位已交 max” clause, not this “older filing” list.
  const lagged = idx.managers.filter(
    (m) => baseline != null && m.period < baseline,
  );
  const qLabel = quarterLabel(baseline) || baseline || "—";

  const rankRows: RankRow[] = data.map((r) => {
    const k = KIND_LABEL[r.dominantKind];
    return {
      ticker: r.cusip, issuer: r.issuer, primary: r.count, value: r.value,
      kindLabel: isZh ? k.zh : k.en, kindTone: k.tone,
      href: stockPath(lang, r.cusip),
    };
  });
  const blurbRows: BlurbRow[] = rankRows.map((r) => ({ ticker: r.ticker, issuer: r.issuer, primary: r.primary }));

  const heading = side === "buy" ? (isZh ? "最多人买" : "Top buys") : (isZh ? "最多人卖" : "Top sells");
  const top = rankRows[0];
  const shareSlug = side === "buy" ? "buys" : "sells";
  const shareUrl = absoluteUrl(localePath(lang, `/investors/${shareSlug}`));
  const shareText = buildShareText(
    side === "buy"
      ? { kind: "buys", topName: top?.issuer ?? null, count: top?.primary ?? null }
      : { kind: "sells", topName: top?.issuer ?? null, count: top?.primary ?? null },
    lang,
    heading,
  );
  const sub = side === "buy"
    ? (isZh ? `在 ${qLabel} 被最多超级投资者新建仓或加仓的股票。` : `Stocks most superinvestors opened or added in ${qLabel}.`)
    : (isZh ? `在 ${qLabel} 被最多超级投资者清仓或减仓的股票。` : `Stocks most superinvestors exited or trimmed in ${qLabel}.`);

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
      <SubNav lang={lang} section="investors" active={side === "buy" ? "buys" : "sells"} />
      <div className="pb-8 sm:pb-10">
        <div className="mb-6">
          <PageHeader
            eyebrow={isZh ? `13F 动向 · ${qLabel}` : `13F moves · ${qLabel}`}
            title={heading}
            intro={sub}
            dateline={<DataAsOfBadge lang={lang} />}
            action={
              <ShareButton
                url={shareUrl}
                text={shareText}
                labels={shareLabels(lang)}
                meta={{ entity: shareSlug, entityType: shareSlug, lang }}
              />
            }
          />
          <p className="mt-3 text-xs text-[var(--tt-faint)]">
            {movesFootnote(lang, effective, lagged)}
          </p>
        </div>
        <AggregateBlurb text={movesBlurb(blurbRows, side, lang)} />
        <AggregateRankingList lang={lang} rows={rankRows} primaryLabel={isZh ? "位投资者" : "managers"} />
      </div>
    </>
  );
}

export function notFoundIfBadLang(rawLang: string): asserts rawLang is Lang {
  if (rawLang !== "zh" && rawLang !== "en") notFound();
}
