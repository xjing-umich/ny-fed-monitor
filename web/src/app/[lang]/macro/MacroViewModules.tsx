"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { DataPayload, Section } from "@/lib/types";
import type { Lang } from "@/lib/nav";
import { MACRO_GROUPS } from "@/lib/nav";
import { macroPath } from "@/lib/urls";
import { sectionLabel, badgeTone } from "@/lib/dashboard";
import { INDICATOR_BLURBS } from "@/lib/indicatorBlurbs";
import { DRIVER_MODULES } from "@/lib/macroResearch";

const GROUP_LABELS: Record<string, { zh: string; en: string }> = {
  funding: { zh: "资金面", en: "Funding" },
  supply: { zh: "供给面", en: "Supply" },
  policy: { zh: "政策面", en: "Policy" },
  "macro-pricing": { zh: "宏观定价", en: "Macro Pricing" },
};

const INDICATOR_NAME: Record<string, { zh: string; en: string }> = {
  "repo-financing": { zh: "回购融资", en: "Repo Financing" },
  "reference-rates": { zh: "短端利率", en: "Reference Rates" },
  "facility-usage": { zh: "资金工具", en: "ON RRP / SRP" },
  fails: { zh: "结算失败", en: "Fails / Specialness" },
  "auction-risk": { zh: "拍卖风险", en: "Auction Risk" },
  soma: { zh: "美联储持仓", en: "SOMA" },
  "dealer-inventory": { zh: "交易商库存", en: "Dealer Inventory" },
  transactions: { zh: "成交与流动性", en: "Transactions / Liquidity" },
  "market-share": { zh: "交易商集中度", en: "Market Share" },
  "policy-expectations": { zh: "政策预期", en: "Policy Expectations" },
  "macro-pricing": { zh: "宏观定价", en: "Macro Pricing" },
  "macro-conditions": { zh: "宏观确认", en: "Macro Conditions" },
  "wage-pressure": { zh: "工资压力", en: "Wage Pressure" },
  "data-freshness": { zh: "数据新鲜度", en: "Data Freshness" },
};

const TONE_ACCENT: Record<string, string> = {
  red: "var(--tt-negative)",
  orange: "var(--tt-warn)",
  yellow: "var(--tt-warn)",
  green: "var(--tt-positive)",
  gray: "var(--tt-faint)",
};

const MACRO_VIEW_KEYS = ["funding", "supply", "policy", "macro-pricing", "system"] as const;
type MacroViewKey = (typeof MACRO_VIEW_KEYS)[number];

function normalizeMacroView(value: string | null): MacroViewKey | undefined {
  return MACRO_VIEW_KEYS.includes(value as MacroViewKey) ? value as MacroViewKey : undefined;
}

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
    <Link href={macroPath(lang, indicator)} className="indicator-card block no-underline">
      <div className="border-t border-[var(--tt-border)] pt-3 pb-4 flex flex-col gap-2">
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
        <p className="text-xs text-[var(--tt-muted)] leading-relaxed m-0">
          {blurb}
        </p>
        <span className="font-mono text-[11px] text-[var(--tt-accent)]">
          {lang === "zh" ? "查看详情 →" : "View details →"}
        </span>
      </div>
    </Link>
  );
}

function DriverGroupSection({
  group,
  lang,
  data,
  featured = false,
}: {
  group: (typeof MACRO_GROUPS)[number];
  lang: Lang;
  data: DataPayload;
  featured?: boolean;
}) {
  const groupLabel = GROUP_LABELS[group.key] ?? { zh: group.key, en: group.key };
  const driver = DRIVER_MODULES.find((item) => item.key === group.key);

  return (
    <section id={group.key}>
      <div className="border-b border-[var(--tt-border)] pb-2 mb-0">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {featured ? (lang === "zh" ? "核心指标" : "Core Signals") : (lang === "zh" ? groupLabel.zh : groupLabel.en)}
        </div>
        {driver && (
          <p className="mt-1 text-xs text-[var(--tt-muted)]">
            {driver.question[lang]}
          </p>
        )}
      </div>

      <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {group.indicators.map((indicator) => {
          const section: Section | undefined = data.sections[indicator];
          const localizedName = INDICATOR_NAME[indicator];
          const name = localizedName ? localizedName[lang] : (sectionLabel(lang, section) ?? indicator);
          const blurb = INDICATOR_BLURBS[indicator]?.[lang] ?? "";
          const signalRaw = section?.freshness_status ?? section?.mode;
          const signalTone = signalRaw ? badgeTone(signalRaw) : "gray";
          const showSignal =
            signalRaw &&
            !["live", "manual-live"].includes(signalRaw) &&
            signalRaw !== "unavailable" &&
            signalRaw !== "mock";

          return (
            <IndicatorCard
              key={indicator}
              lang={lang}
              indicator={indicator}
              name={name}
              blurb={blurb}
              signal={showSignal ? signalRaw : undefined}
              signalTone={showSignal ? signalTone : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

function SystemSection({ lang }: { lang: Lang }) {
  return (
    <section id="system">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)] border-b border-[var(--tt-border)] pb-2 mb-0">
        {lang === "zh" ? "系统" : "System"}
      </div>

      <div className="grid gap-x-8 sm:grid-cols-2">
        <Link href={macroPath(lang, "data-freshness")} className="indicator-card block no-underline">
          <div className="border-t border-[var(--tt-border)] pt-3 pb-4 flex flex-col gap-2">
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

        <Link href={`/${lang}/macro/methodology`} className="indicator-card block no-underline">
          <div className="border-t border-[var(--tt-border)] pt-3 pb-4 flex flex-col gap-2">
            <span className="font-display text-sm font-medium text-[var(--tt-text)] leading-snug">
              {lang === "zh" ? "方法论与来源" : "Methodology & Sources"}
            </span>
            <p className="text-xs text-[var(--tt-muted)] leading-relaxed m-0">
              {lang === "zh"
                ? "查看信号分级、数据链路、首页展示规则和下一步接入计划。"
                : "Review signal triage, data lineage, home-display rules, and planned coverage."}
            </p>
            <span className="font-mono text-[11px] text-[var(--tt-accent)]">
              {lang === "zh" ? "查看方法论 →" : "View methodology →"}
            </span>
          </div>
        </Link>
      </div>
    </section>
  );
}

export default function MacroViewModules({
  lang,
  data,
  placement = "all",
}: {
  lang: Lang;
  data: DataPayload;
  placement?: "featured" | "remaining" | "all";
}) {
  const searchParams = useSearchParams();
  const activeView = normalizeMacroView(searchParams.get("view"));
  const featuredGroup = activeView && activeView !== "system"
    ? MACRO_GROUPS.find((group) => group.key === activeView)
    : undefined;
  const remainingGroups = featuredGroup
    ? MACRO_GROUPS.filter((group) => group.key !== featuredGroup.key)
    : MACRO_GROUPS;

  if (placement === "featured") {
    return (
      <>
        {featuredGroup && (
          <DriverGroupSection group={featuredGroup} lang={lang} data={data} featured />
        )}

        {activeView === "system" && (
          <SystemSection lang={lang} />
        )}
      </>
    );
  }

  if (placement === "remaining") {
    return (
      <>
        {remainingGroups.map((group) => (
          <DriverGroupSection key={group.key} group={group} lang={lang} data={data} />
        ))}

        {activeView !== "system" && <SystemSection lang={lang} />}
      </>
    );
  }

  return (
    <>
      {featuredGroup && (
        <DriverGroupSection group={featuredGroup} lang={lang} data={data} featured />
      )}

      {activeView === "system" && (
        <SystemSection lang={lang} />
      )}

      {remainingGroups.map((group) => (
        <DriverGroupSection key={group.key} group={group} lang={lang} data={data} />
      ))}

      {activeView !== "system" && <SystemSection lang={lang} />}
    </>
  );
}
