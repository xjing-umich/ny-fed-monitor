"use client";

import { useSearchParams } from "next/navigation";
import type { Lang } from "@/lib/nav";

const VIEW_COPY = {
  overview: {
    title: { zh: "美债市场监控", en: "Treasury Market Monitor" },
    description: {
      zh: "先看市场摘要、核心快照和异动，再下钻到资金面、供给面、政策面与宏观定价。",
      en: "Start with the market summary, core snapshot, and watch items, then drill into funding, supply, policy, and macro pricing.",
    },
  },
  funding: {
    title: { zh: "资金面", en: "Funding" },
    description: {
      zh: "观察短端资金是否开始变贵、分层，或通过回购、RRP/SRF、结算失败传导成压力。",
      en: "Watch whether short-end funding is becoming expensive, tiered, or transmitting through repo, RRP/SRF, and settlement fails.",
    },
  },
  supply: {
    title: { zh: "供给面", en: "Supply" },
    description: {
      zh: "判断市场是否顺利吸收新增久期供给，以及交易商资产负债表是否承压。",
      en: "Judge whether the market is absorbing new duration supply and whether dealer balance sheets are under pressure.",
    },
  },
  policy: {
    title: { zh: "政策面", en: "Policy" },
    description: {
      zh: "跟踪政策路径、降息节奏和调查预期是否仍在压住曲线前端。",
      en: "Track whether policy path, easing timing, and survey expectations are still anchoring the front end.",
    },
  },
  "macro-pricing": {
    title: { zh: "宏观定价", en: "Macro Pricing" },
    description: {
      zh: "拆解收益率变化背后的实际利率、通胀补偿、增长确认和工资黏性，并检查它们是否互相确认。",
      en: "Decompose yield moves into real rates, inflation compensation, growth confirmation, and wage stickiness, then check whether they confirm one another.",
    },
  },
  system: {
    title: { zh: "系统", en: "System" },
    description: {
      zh: "检查数据新鲜度、来源链路、展示规则和方法论，判断当前读数是否可信。",
      en: "Check freshness, lineage, display rules, and methodology to judge whether current readings are trustworthy.",
    },
  },
} as const;

type ViewKey = keyof typeof VIEW_COPY;

function normalizeView(value: string | null): ViewKey {
  if (value && value in VIEW_COPY) return value as ViewKey;
  return "overview";
}

export default function MacroViewHero({ lang }: { lang: Lang }) {
  const searchParams = useSearchParams();
  const view = normalizeView(searchParams.get("view"));
  const copy = VIEW_COPY[view];
  const isOverview = view === "overview";

  return (
    <header className="border-b border-[var(--tt-border)] pb-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
        {isOverview
          ? (lang === "zh" ? "宏观 / 流动性" : "Macro / Liquidity")
          : (lang === "zh" ? "美债市场监控" : "Treasury Market Monitor")}
      </div>
      <h1 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
        {copy.title[lang]}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--tt-muted)]">
        {copy.description[lang]}
      </p>
    </header>
  );
}
