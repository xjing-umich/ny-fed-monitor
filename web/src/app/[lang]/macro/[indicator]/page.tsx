import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import type { Lang } from "@/lib/nav";
import { MACRO_GROUPS, indicatorToGroup } from "@/lib/nav";
import { macroPath, absoluteUrl, localePath } from "@/lib/urls";
import { altFor } from "@/lib/seo";
import { readMacroSnapshot } from "@/lib/macroSnapshot";
import { MacroRefreshing } from "../MacroRefreshing";
import { sectionLabel, metricLabel, badgeTone } from "@/lib/dashboard";
import { indicatorBlurb, INDICATOR_BLURBS } from "@/lib/indicatorBlurbs";
import { EntityPage } from "@/components/entity/EntityPage";
import { SectionBody } from "@/components/dashboard/SectionBody";
import type { Tone } from "@/components/entity/types";
import { ALL_SECTION_KEYS, SECTION_NAME, type IndicatorKey } from "@/lib/macroNames";
import { MACRO_INDICATOR_RESEARCH } from "@/lib/macroResearch";

// ISR:预渲染 + 日级重校验。读物化快照(零外部抓取),让 macro:ingest(日更 cron)写入的
// 新数据无需重新部署即可在一天内自动出现(与 /macro 概览页 ISR 口径一致)。
export const revalidate = 86400;

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

  const alternates = altFor(lang, `/macro/${indicator}`);
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

function ResearchContext({
  indicator,
  lang,
}: {
  indicator: string;
  lang: Lang;
}): React.ReactElement | null {
  const note = MACRO_INDICATOR_RESEARCH[indicator];
  if (!note) return null;

  const blockStyle: React.CSSProperties = {
    borderTop: "1px solid var(--tt-border)",
    paddingTop: 12,
  };
  const headingStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--tt-faint)",
    marginBottom: 8,
  };
  const itemStyle: React.CSSProperties = {
    fontSize: 13,
    lineHeight: 1.65,
    color: "var(--tt-muted)",
    margin: 0,
  };

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <div style={blockStyle}>
        <div style={headingStyle}>{lang === "zh" ? "观察重点" : "What To Watch"}</div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {note.watch.map((item) => (
            <li key={item.en} style={itemStyle}>{item[lang]}</li>
          ))}
        </ul>
      </div>

      <div style={blockStyle}>
        <div style={headingStyle}>{lang === "zh" ? "可能误导的地方" : "What Can Mislead"}</div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {note.misleading.map((item) => (
            <li key={item.en} style={itemStyle}>{item[lang]}</li>
          ))}
        </ul>
      </div>

      <div style={blockStyle}>
        <div style={headingStyle}>{lang === "zh" ? "数据链路" : "Data Lineage"}</div>
        <p style={itemStyle}>{note.lineage[lang]}</p>
        <p style={{ ...itemStyle, marginTop: 6 }}>
          {lang === "zh" ? "来源：" : "Sources: "}
          {note.sources.join(" / ")}
        </p>
      </div>
    </section>
  );
}

function groupLabel(lang: Lang, groupKey: string | null): string | null {
  if (!groupKey) return null;
  const group = MACRO_GROUPS.find((item) => item.key === groupKey);
  if (!group) return null;
  return lang === "zh" ? group.zh : group.en;
}

function groupViewHref(lang: Lang, groupKey: string | null): string | null {
  if (!groupKey) return null;
  if (!["funding", "supply", "policy", "macro-pricing", "system"].includes(groupKey)) return localePath(lang, "/macro");
  return localePath(lang, `/macro?view=${groupKey}`);
}

function MacroContextNotice({
  lang,
  groupKey,
}: {
  lang: Lang;
  groupKey: string | null;
}): React.ReactElement | null {
  const label = groupLabel(lang, groupKey);
  if (!label) return null;

  return (
    <div className="border-y border-[var(--tt-border)] py-3 text-xs leading-relaxed text-[var(--tt-muted)]">
      <span className="text-[var(--tt-faint)]">
        {lang === "zh" ? "所属模块" : "Module"}
      </span>
      <span className="mx-2 text-[var(--tt-faint)]">/</span>
      <span className="font-medium text-[var(--tt-text)]">{label}</span>
    </div>
  );
}

function MacroBackButton({
  lang,
  groupKey,
}: {
  lang: Lang;
  groupKey: string | null;
}): React.ReactElement | null {
  const label = groupLabel(lang, groupKey);
  const href = groupViewHref(lang, groupKey);
  if (!label || !href) return null;

  return (
    <Link
      href={href}
      aria-label={lang === "zh" ? `返回${label}视图` : `Back to ${label} view`}
      className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--tt-border)] px-3 py-2 text-sm font-medium text-[var(--tt-muted)] no-underline transition-colors hover:border-[var(--tt-accent)] hover:text-[var(--tt-accent)]"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      <span>{lang === "zh" ? `返回${label}` : `Back to ${label}`}</span>
    </Link>
  );
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

  // 已知指标集是静态的(ALL_SECTION_KEYS)→ 未知才 404。
  if (!(ALL_SECTION_KEYS as readonly string[]).includes(indicator)) notFound();

  // 从物化快照读(构建期不再实时抓 NY Fed/FRED/Treasury → 杜绝静态导出超时)。
  const data = await readMacroSnapshot();
  const section = data?.sections[indicator];
  if (!data || !section) {
    // 快照暂无(首次摄取前 / DB 抖动)→ 优雅"刷新中":绝不 404、不抛错、不实时抓 → 构建必成功。
    const names = SECTION_NAME[indicator as IndicatorKey];
    return <MacroRefreshing lang={lang} title={names ? names[lang] : indicator} />;
  }

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
  const researchNote = MACRO_INDICATOR_RESEARCH[indicator];
  const sources = (researchNote?.sources.length ? researchNote.sources : ["NY Fed / Treasury.gov"])
    .map((name) => ({ name, asOf: sourceDate }));

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

  // Dataset structured data — helps search/AI engines treat each indicator as a
  // citable time-series with a clear source and recency.
  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name:
      lang === "zh"
        ? `${title} — 美债市场 / 流动性指标`
        : `${title} — US Treasury market & liquidity indicator`,
    description:
      subtitle ||
      (lang === "zh"
        ? `${title} 的最新读数与历史走势。`
        : `Latest reading and historical trend for ${title}.`),
    url: absoluteUrl(localePath(lang, `/macro/${indicator}`)),
    inLanguage: lang === "zh" ? "zh-CN" : "en",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "Compounder", url: "https://thecompounder.fyi" },
    ...(sourceDate ? { dateModified: sourceDate, temporalCoverage: sourceDate } : {}),
    sourceOrganization: sources.map((source) => ({
      "@type": "Organization",
      name: source.name,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }} />
      <EntityPage
        lang={lang}
        title={title}
        subtitle={subtitle}
        verdict={verdict}
        keyFacts={keyFacts}
        topAction={<MacroBackButton lang={lang} groupKey={groupKey} />}
        notice={<MacroContextNotice lang={lang} groupKey={groupKey} />}
        sources={sources}
        related={related}
      >
        <ResearchContext indicator={indicator} lang={lang} />
        <SectionBody
          sectionKey={indicator}
          section={section}
          lang={lang}
          headless
          hideMetricStrip
        />
      </EntityPage>
    </>
  );
}
