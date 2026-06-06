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

export const dynamic = "force-dynamic";

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

// ── Tone → border/background color ───────────────────────────────────────────

const TONE_ACCENT: Record<string, string> = {
  red:    "var(--tt-negative)",
  orange: "var(--tt-warn)",
  yellow: "var(--tt-warn)",
  green:  "var(--tt-positive)",
  gray:   "var(--tt-faint)",
};

// ── Indicator card ─────────────────────────────────────────────────────────────

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
      style={{ textDecoration: "none", display: "block" }}
    >
      <div className="indicator-card"
        style={{
          background: "var(--tt-panel)",
          border: "1px solid var(--tt-border)",
          borderRadius: 8,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          transition: "border-color 0.15s",
          cursor: "pointer",
        }}
      >
        {/* Name row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--tt-text)",
              lineHeight: 1.3,
            }}
          >
            {name}
          </span>
          {signal && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: accentColor,
                border: `1px solid ${accentColor}`,
                borderRadius: 4,
                padding: "1px 6px",
                whiteSpace: "nowrap",
              }}
            >
              {signal}
            </span>
          )}
        </div>

        {/* One-liner blurb */}
        <p
          style={{
            fontSize: 12,
            color: "var(--tt-muted)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {blurb}
        </p>

        {/* Arrow hint */}
        <div
          style={{
            fontSize: 11,
            color: "var(--tt-accent)",
            marginTop: 2,
          }}
        >
          {lang === "zh" ? "查看详情 →" : "View details →"}
        </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* CSS hover effect for indicator cards — no JS event handlers needed */}
      <style>{`.indicator-card:hover { border-color: var(--tt-accent) !important; }`}</style>
      {/* Page heading */}
      <div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--tt-text)",
            margin: "0 0 6px",
            lineHeight: 1.2,
          }}
        >
          {lang === "zh" ? "宏观 / 流动性" : "Macro / Liquidity"}
        </h1>
        <p style={{ fontSize: 14, color: "var(--tt-muted)", margin: 0, lineHeight: 1.6 }}>
          {lang === "zh"
            ? "追踪美国国债市场资金面、供给面与政策面动态，数据来自 NY Fed 及 Treasury.gov。"
            : "Track US Treasury market funding, supply, and policy dynamics sourced from NY Fed and Treasury.gov."}
        </p>
      </div>

      {/* 3 macro groups */}
      {MACRO_GROUPS.map((group) => {
        const groupLabel = GROUP_LABELS[group.key] ?? { zh: group.key, en: group.key };
        return (
          <section key={group.key}>
            {/* Group heading */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                color: "var(--tt-faint)",
                borderBottom: "1px solid var(--tt-border)",
                paddingBottom: 8,
                marginBottom: 12,
              }}
            >
              {lang === "zh" ? groupLabel.zh : groupLabel.en}
            </div>

            {/* Indicator cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {group.indicators.map((indicator) => {
                const section = data.sections[indicator];
                const name = sectionLabel(lang, section) ?? indicator;
                const blurb = INDICATOR_BLURBS[indicator]?.[lang] ?? "";

                // Headline signal: freshness_status or mode-derived label
                const signalRaw = section?.freshness_status ?? section?.mode;
                const signalTone = signalRaw ? badgeTone(signalRaw) : "gray";
                // Only show signal if meaningful (not just "live" or "unavailable" clutter)
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
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.10em",
            color: "var(--tt-faint)",
            borderBottom: "1px solid var(--tt-border)",
            paddingBottom: 8,
            marginBottom: 12,
          }}
        >
          {lang === "zh" ? "系统" : "System"}
        </div>

        <Link
          href={macroPath(lang, "data-freshness")}
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          <div
            style={{
              background: "var(--tt-panel)",
              border: "1px solid var(--tt-border)",
              borderRadius: 8,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              minWidth: 260,
            }}
          >
            <span style={{ fontSize: 16 }}>🗄</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tt-text)" }}>
                {lang === "zh" ? "数据新鲜度" : "Data Freshness"}
              </div>
              <div style={{ fontSize: 12, color: "var(--tt-muted)", marginTop: 2 }}>
                {INDICATOR_BLURBS["data-freshness"]?.[lang] ?? ""}
              </div>
            </div>
          </div>
        </Link>
      </section>
    </div>
  );
}
