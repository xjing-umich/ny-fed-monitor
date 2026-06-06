import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { MACRO_GROUPS, indicatorToGroup } from "@/lib/nav";
import { macroPath } from "@/lib/urls";
import { buildAllSections } from "@/lib/build";
import { sectionLabel, metricLabel, badgeTone } from "@/lib/dashboard";
import { indicatorBlurb, INDICATOR_BLURBS } from "@/lib/indicatorBlurbs";
import { EntityPage } from "@/components/entity/EntityPage";
import { SectionBody } from "@/components/dashboard/SectionBody";
import type { Tone } from "@/components/entity/types";

// ── All valid indicator keys (sections produced by buildAllSections) ───────────

const ALL_SECTION_KEYS = [
  "dealer-inventory",
  "transactions",
  "repo-financing",
  "fails",
  "reference-rates",
  "soma",
  "market-share",
  "facility-usage",
  "auction-risk",
  "policy-expectations",
  "data-freshness",
] as const;

type IndicatorKey = (typeof ALL_SECTION_KEYS)[number];

// ── Localized section name map (from i18n sidebarItems) ───────────────────────

const SECTION_NAME: Record<IndicatorKey, { zh: string; en: string }> = {
  "repo-financing":      { zh: "回购融资", en: "Repo Financing" },
  "reference-rates":     { zh: "短端利率", en: "Reference Rates" },
  "facility-usage":      { zh: "资金工具", en: "ON RRP / SRP" },
  "fails":               { zh: "结算失败", en: "Fails / Specialness" },
  "auction-risk":        { zh: "拍卖风险", en: "Auction Risk" },
  "soma":                { zh: "美联储持仓", en: "SOMA" },
  "dealer-inventory":    { zh: "交易商库存", en: "Dealer Inventory" },
  "transactions":        { zh: "成交与流动性", en: "Transactions / Liquidity" },
  "market-share":        { zh: "交易商集中度", en: "Market Share" },
  "policy-expectations": { zh: "政策预期", en: "Policy Expectations" },
  "data-freshness":      { zh: "数据新鲜度", en: "Data Freshness" },
};

// ── Static params ──────────────────────────────────────────────────────────────

export function generateStaticParams(): Array<{ lang: string; indicator: string }> {
  return (["zh", "en"] as const).flatMap((lang) =>
    ALL_SECTION_KEYS.map((indicator) => ({ lang, indicator }))
  );
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; indicator: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, indicator } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";

  const names = SECTION_NAME[indicator as IndicatorKey];
  const name = names ? names[lang] : indicator;
  const blurb = INDICATOR_BLURBS[indicator]?.[lang] ?? "";

  const l = lang === "en" ? "en" : "zh";
  const alternates = {
    canonical: `/${l}/macro/${indicator}`,
    languages: {
      "zh-CN": `/zh/macro/${indicator}`,
      en: `/en/macro/${indicator}`,
    },
  };
  return lang === "zh"
    ? {
        title: `${name} — 宏观/流动性 · Treasury Market Monitor`,
        description: blurb,
        alternates,
      }
    : {
        title: `${name} — Macro/Liquidity · Treasury Market Monitor`,
        description: blurb,
        alternates,
      };
}

// ── Verdict mapping ────────────────────────────────────────────────────────────

function deriveTone(rawSignal: string): Tone {
  const t = badgeTone(rawSignal);
  if (t === "red")    return "negative";
  if (t === "orange") return "warn";
  if (t === "yellow") return "warn";
  if (t === "green")  return "positive";
  return "neutral";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function IndicatorEntityPage({
  params,
}: {
  params: Promise<{ lang: string; indicator: string }>;
}): Promise<React.ReactElement> {
  const { lang: rawLang, indicator } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  const data = await buildAllSections();

  // Validate indicator against actual built sections
  const section = data.sections[indicator];
  if (!section) notFound();

  // Title
  const names = SECTION_NAME[indicator as IndicatorKey];
  const title = names
    ? names[lang]
    : (sectionLabel(lang, section) ?? indicator);

  // Subtitle = plain-language blurb
  const subtitle = indicatorBlurb(lang, indicator);

  // Verdict: derive from freshness_status if it carries a meaningful signal
  const signalRaw = section.freshness_status ?? section.mode;
  let verdict: { label: string; tone: Tone } | undefined;
  if (
    signalRaw &&
    !["live", "manual-live", "mock", "unavailable"].includes(signalRaw)
  ) {
    verdict = {
      label: signalRaw,
      tone: deriveTone(signalRaw),
    };
  }

  // Key facts: first 5 key_metrics
  const keyFacts = (section.key_metrics ?? []).slice(0, 5).map((m) => ({
    label: metricLabel(lang, m) ?? m.label,
    value: m.unit ? `${m.value} ${m.unit}` : m.value,
  }));

  // Sources
  const sourceDate = section.data_date ?? data.as_of.slice(0, 10);
  const sources = [{ name: "NY Fed / Treasury.gov", asOf: sourceDate }];

  // Related: other indicators in the same MACRO_GROUPS group
  const groupKey = indicatorToGroup(indicator);
  let related: { label: string; href: string }[] = [];
  if (groupKey) {
    const grp = MACRO_GROUPS.find((g) => g.key === groupKey);
    if (grp) {
      related = (grp.indicators as readonly string[])
        .filter((ind) => ind !== indicator)
        .map((ind) => {
          const n = SECTION_NAME[ind as IndicatorKey];
          const label = n ? n[lang] : ind;
          return { label, href: macroPath(lang, ind) };
        });
    }
  }

  return (
    <EntityPage
      lang={lang}
      title={title}
      subtitle={subtitle}
      verdict={verdict}
      keyFacts={keyFacts}
      aiPageKey={`macro:${indicator}`}
      sources={sources}
      related={related}
    >
      <SectionBody
        sectionKey={indicator}
        section={section}
        lang={lang}
        headless
      />
    </EntityPage>
  );
}
