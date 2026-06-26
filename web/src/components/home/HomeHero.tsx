import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";

// 首页 hero(RSC):三腿定位 h1 + 一句副标 + 单一主 CTA。克制、大留白、左对齐。
const COPY = {
  zh: {
    h1: "与最有耐心的投资者同行",
    sub: "追踪顶级投资者的 13F 持仓（谁在买），用保守价值带衡量个股贵贱（值不值），读懂资金与利率的大环境。数据来自 SEC EDGAR 与公开市场。",
    cta: "浏览超级投资者",
  },
  en: {
    h1: "Walk with the most patient investors",
    sub: "Track top investors' 13F holdings, weigh each stock against a conservative value band, and read the liquidity-and-rates backdrop. Sourced from SEC EDGAR and public markets.",
    cta: "Browse superinvestors",
  },
} as const;

export function HomeHero({ lang }: { lang: Lang }): React.ReactElement {
  const t = COPY[lang];
  return (
    <section className="pt-6 pb-2 sm:pt-10">
      <h1 className="max-w-2xl font-display text-3xl font-medium leading-[1.1] tracking-tight text-[var(--tt-text)] sm:text-5xl">
        {t.h1}
      </h1>
      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--tt-muted)] sm:text-base">
        {t.sub}
      </p>
      <div className="mt-7">
        <Link
          href={`/${lang}/investors`}
          className="inline-flex items-center rounded-sm border border-[var(--tt-text)] px-4 py-2 font-display text-sm font-medium text-[var(--tt-text)] no-underline transition-colors hover:bg-[var(--tt-text)] hover:text-[var(--tt-bg)]"
        >
          {t.cta} →
        </Link>
      </div>
    </section>
  );
}
