import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { MACRO_GROUPS } from "@/lib/nav";
import { macroPath } from "@/lib/urls";
import { buildAllSections } from "@/lib/build";
import { sectionLabel, badgeTone } from "@/lib/dashboard";
import { INDICATOR_BLURBS } from "@/lib/indicatorBlurbs";
import SubNav from "@/components/shell/SubNav";

// 宏观数据由 cron 周期更新;与 /macro/[indicator] 子页一致用 10 分钟 ISR 静态化,
// 而非每请求重算 → 概览页 CDN 秒开,数据最多滞后 10 分钟。
export const revalidate = 600;

// ── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  return lang === "zh"
    ? {
        title: "宏观 / 流动性 — Treasury Market Monitor",
        description:
          "资金面、供给面、政策面全景：回购融资、基准利率、美联储工具、国债拍卖、SOMA 持仓与政策预期。",
      }
    : {
        title: "Macro / Liquidity — Treasury Market Monitor",
        description:
          "Full-spectrum view of funding, supply, and policy: repo financing, reference rates, Fed facilities, Treasury auctions, SOMA portfolio, and policy expectations.",
      };
}

// ── Group heading labels ───────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, { zh: string; en: string }> = {
  funding: { zh: "资金面", en: "Funding" },
  supply:  { zh: "供给面", en: "Supply" },
  policy:  { zh: "政策面", en: "Policy" },
};

// ── Single-language indicator names (overrides raw section.title_zh which may contain mixed scripts) ──

const INDICATOR_NAME: Record<string, { zh: string; en: string }> = {
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

// ── Tone → signal color ───────────────────────────────────────────────────────

const TONE_ACCENT: Record<string, string> = {
  red:    "var(--tt-negative)",
  orange: "var(--tt-warn)",
  yellow: "var(--tt-warn)",
  green:  "var(--tt-positive)",
  gray:   "var(--tt-faint)",
};

// ── Indicator cell (editorial hairline style) ──────────────────────────────────

function IndicatorCard({
  lang,
  indicator,
  name,
  blurb,
  signal,
  signalTone,
}: {
  lang: Lang;
  indicator: string;
  name: string;
  blurb: string;
  signal?: string;
  signalTone?: string;
}) {
  const accentColor = signalTone ? (TONE_ACCENT[signalTone] ?? TONE_ACCENT.gray) : TONE_ACCENT.gray;

  return (
    <Link
      href={macroPath(lang, indicator)}
      className="indicator-card block no-underline"
    >
      <div className="border-t border-[var(--tt-border)] pt-3 pb-4 flex flex-col gap-2">
        {/* Name + freshness badge */}
        <div className="flex items-start justify-between gap-2">
          <span className="font-display text-sm font-medium text-[var(--tt-text)] leading-snug">
            {name}
          </span>
          {signal && (
            <span
              className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-sm"
              style={{ color: accentColor, border: `1px solid ${accentColor}` }}
            >
              {signal}
            </span>
          )}
        </div>

        {/* One-liner blurb */}
        <p className="text-xs text-[var(--tt-muted)] leading-relaxed m-0">
          {blurb}
        </p>

        {/* Money-green arrow link */}
        <span className="font-mono text-[11px] text-[var(--tt-accent)]">
          {lang === "zh" ? "查看详情 →" : "View details →"}
        </span>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MacroOverviewPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<React.ReactElement> {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  const data = await buildAllSections();

  return (
    <div className="mx-auto max-w-4xl px-2 py-8 sm:py-10 flex flex-col gap-10">
      {/* CSS hover: indicator links darken text on hover — no JS event handlers */}
      <style>{`.indicator-card:hover span.font-display { color: var(--tt-accent); }`}</style>

      {/* Section sub-nav */}
      <SubNav lang={lang} section="macro" />

      {/* Editorial page heading */}
      <div className="border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {lang === "zh" ? "宏观 / 流动性" : "Macro / Liquidity"}
        </h1>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">
          {lang === "zh"
            ? "追踪美国国债市场资金面、供给面与政策面动态，数据来自 NY Fed 及 Treasury.gov。"
            : "Track US Treasury market funding, supply, and policy dynamics sourced from NY Fed and Treasury.gov."}
        </p>
      </div>

      {/* 3 macro groups */}
      {MACRO_GROUPS.map((group) => {
        const groupLabel = GROUP_LABELS[group.key] ?? { zh: group.key, en: group.key };
        return (
          <section key={group.key} id={group.key}>
            {/* Group label — uppercase tracked, hairline below */}
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)] border-b border-[var(--tt-border)] pb-2 mb-0">
              {lang === "zh" ? groupLabel.zh : groupLabel.en}
            </div>

            {/* Indicator cells — hairline-ruled grid */}
            <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {group.indicators.map((indicator) => {
                const section = data.sections[indicator];
                const localizedName = INDICATOR_NAME[indicator];
                const name = localizedName ? localizedName[lang] : (sectionLabel(lang, section) ?? indicator);
                const blurb = INDICATOR_BLURBS[indicator]?.[lang] ?? "";

                // Headline signal: freshness_status or mode-derived label
                const signalRaw = section?.freshness_status ?? section?.mode;
                const signalTone = signalRaw ? badgeTone(signalRaw) : "gray";
                // Only show signal if meaningful
                const showSignal =
                  signalRaw &&
                  !["live", "manual-live"].includes(signalRaw) &&
                  signalRaw !== "unavailable" &&
                  signalRaw !== "mock";
                const signalLabel = showSignal ? signalRaw : undefined;
                const tone = showSignal ? signalTone : undefined;

                return (
                  <IndicatorCard
                    key={indicator}
                    lang={lang}
                    indicator={indicator}
                    name={name}
                    blurb={blurb}
                    signal={signalLabel}
                    signalTone={tone}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {/* System area */}
      <section>
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)] border-b border-[var(--tt-border)] pb-2 mb-0">
          {lang === "zh" ? "系统" : "System"}
        </div>

        <Link
          href={macroPath(lang, "data-freshness")}
          className="indicator-card block no-underline"
        >
          <div className="border-t border-[var(--tt-border)] pt-3 pb-4 flex flex-col gap-2 max-w-xs">
            <span className="font-display text-sm font-medium text-[var(--tt-text)] leading-snug">
              {lang === "zh" ? "数据新鲜度" : "Data Freshness"}
            </span>
            <p className="text-xs text-[var(--tt-muted)] leading-relaxed m-0">
              {INDICATOR_BLURBS["data-freshness"]?.[lang] ?? ""}
            </p>
            <span className="font-mono text-[11px] text-[var(--tt-accent)]">
              {lang === "zh" ? "查看详情 →" : "View details →"}
            </span>
          </div>
        </Link>
      </section>
    </div>
  );
}
