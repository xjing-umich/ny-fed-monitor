import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getCusipMap } from "@/lib/managers/securities";
import { stockPath } from "@/lib/urls";
import { isLikelyTicker } from "@/lib/externalLinks";

export const revalidate = 86400;

export function generateStaticParams() { return [{ lang: "zh" }, { lang: "en" }]; }

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return lang === "zh"
    ? { title: "个股目录 — Compounder · 复利", description: "浏览顶级投资者 13F 覆盖的全部个股；或查看共识持仓榜单。" }
    : { title: "Stock directory — Compounder", description: "Browse every stock covered by superinvestor 13F filings, or see the consensus ranking." };
}

export default async function StocksDirectoryPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";

  // 全集 ticker(去重 + 仅保留像 ticker 的), 按字母排序做索引。
  const cusipMap = await getCusipMap();
  const tickers = Array.from(new Set(Array.from(cusipMap.values()).map((v) => v.ticker)))
    .filter((t): t is string => !!t && isLikelyTicker(t))
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-4xl px-2 py-8 sm:py-10">
      <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {isZh ? "个股目录" : "Stock directory"}
        </h1>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">
          {isZh ? "顶级投资者 13F 覆盖的全部个股。想看哪只票被最多投资者持有？" : "Every stock covered by superinvestor 13F filings. Looking for what the most superinvestors hold?"}
          <Link href={`/${lang}/investors/consensus`} className="ml-1 text-[var(--tt-accent)] no-underline hover:underline">
            {isZh ? "查看共识持仓榜 →" : "See the consensus ranking →"}
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {tickers.map((t) => (
          <Link key={t} href={stockPath(lang, t)} className="font-mono text-sm text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">
            {t}
          </Link>
        ))}
      </div>

      {tickers.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--tt-muted)]">{isZh ? "暂无数据" : "No data available"}</p>
      )}
    </div>
  );
}
