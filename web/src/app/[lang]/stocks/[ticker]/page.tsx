import React from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import { getCusipMap, tickerToCusips } from "@/lib/managers/securities";
import type { Lang } from "@/lib/nav";
import { investorPath } from "@/lib/urls";
import { EntityPage } from "@/components/entity/EntityPage";
import { formatUSD } from "@/lib/format";

// NOTE: No generateStaticParams — this route renders on-demand per request.
// The union of CUSIPs across all managers is ~1000+; prerendering them all at
// build time would be prohibitively slow. Dynamic rendering is acceptable for
// Phase 0 (6 managers, fast JSON reads).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; ticker: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, ticker } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";

  // ticker 下任一 cusip 的 issuer 名作展示
  const cusips = await tickerToCusips(ticker);
  const cusipMap = await getCusipMap();
  let issuer = ticker;
  for (const c of cusips) { const info = cusipMap.get(c); if (info?.name) { issuer = info.name; break; } }

  const l = lang === "en" ? "en" : "zh";
  const alternates = {
    canonical: `/${l}/stocks/${ticker}`,
    languages: { "zh-CN": `/zh/stocks/${ticker}`, en: `/en/stocks/${ticker}` },
  };
  return lang === "zh"
    ? { title: `${issuer}（${ticker}）— 谁在持有 / 机构持仓 — Compounder · 复利`,
        description: `查看持有 ${issuer}（${ticker}）的超级投资者，了解机构持仓分布。`, alternates }
    : { title: `${issuer} (${ticker}) — Who's Holding — Compounder · 复利`,
        description: `See which superinvestors hold ${issuer} (${ticker}) and their position sizes.`, alternates };
}

// ── Holders table ─────────────────────────────────────────────────────────────

type HolderRow = {
  person: string;
  slug: string;
  value: number;
  shares: number;
  weight: number | undefined;
};

const TABLE_COPY = {
  zh: {
    title: "持有该证券的超级投资者",
    cols: {
      investor: "投资人",
      value: "市值",
      shares: "持股",
      weight: "组合权重",
    },
    coming: "股票估值（内在价值 / DCF）数据即将上线",
  },
  en: {
    title: "Superinvestors Holding This Security",
    cols: {
      investor: "Investor",
      value: "Value",
      shares: "Shares",
      weight: "Weight",
    },
    coming: "Stock valuation (intrinsic value / DCF) coming soon.",
  },
} as const;

function HoldersTable({
  holders,
  lang,
}: {
  holders: HolderRow[];
  lang: Lang;
}): React.ReactElement {
  const t = TABLE_COPY[lang];
  const sorted = [...holders].sort((a, b) => b.value - a.value);

  return (
    <section>
      {/* Section label with hairline rule */}
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.title}
        </span>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--tt-border)]">
              <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)]">
                {t.cols.investor}
              </th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-32">
                {t.cols.value}
              </th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-32">
                {t.cols.shares}
              </th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-24">
                {t.cols.weight}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.slug}
                className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
              >
                <td className="py-3 pr-4">
                  <Link
                    href={investorPath(lang, row.slug)}
                    className="font-display font-medium text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)] transition-colors"
                  >
                    {row.person}
                  </Link>
                </td>
                <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-text)]">
                  {formatUSD(row.value)}
                </td>
                <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-muted)]">
                  {row.shares.toLocaleString()}
                </td>
                <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-muted)]">
                  {row.weight != null ? `${(row.weight * 100).toFixed(2)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--tt-faint)]">{t.coming}</p>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StockTickerPage({
  params,
}: {
  params: Promise<{ lang: string; ticker: string }>;
}): Promise<React.ReactElement> {
  const { lang: rawLang, ticker: rawTicker } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  // 旧 CUSIP URL → 301 到 ticker(若该 cusip 已解析)
  const cusipMap = await getCusipMap();
  const asCusip = cusipMap.get(rawTicker);
  if (asCusip?.ticker && asCusip.ticker !== rawTicker) {
    redirect(`/${lang}/stocks/${asCusip.ticker}`);
  }

  const ticker = rawTicker;
  // 该 ticker 下的全部 cusip(含历史)；若库为空(本地)或未解析, 回退把入参当作单个 cusip
  const cusipsForTicker = await tickerToCusips(ticker);
  const targetCusips = new Set(cusipsForTicker.length ? cusipsForTicker : [ticker]);

  const idx = await getManagerIndex();
  const holders: HolderRow[] = [];
  const issuerFreq: Record<string, number> = {};
  let latestFiledAt = "";

  for (const summary of idx.managers) {
    const d = await getManagerDetail(summary.slug);
    if (!d) continue;
    const h = d.latest.holdings.find((holding) => targetCusips.has(holding.cusip));
    if (!h) continue;
    issuerFreq[h.issuer] = (issuerFreq[h.issuer] ?? 0) + 1;
    if (!latestFiledAt || d.latest.filedAt > latestFiledAt) latestFiledAt = d.latest.filedAt;
    holders.push({ person: summary.person, slug: summary.slug, value: h.value, shares: h.shares, weight: h.weight });
  }

  if (holders.length === 0) notFound();

  const issuer = Object.entries(issuerFreq).sort((a, b) => b[1] - a[1])[0][0];
  const n = holders.length;
  const totalValue = holders.reduce((sum, r) => sum + r.value, 0);
  const topHolder = [...holders].sort((a, b) => b.value - a.value)[0];

  const subtitle =
    lang === "zh"
      ? `${n} 位超级投资者持有 ${issuer}（${ticker}）。股票估值数据即将上线。`
      : `Held by ${n} superinvestor${n === 1 ? "" : "s"} (${ticker}). Valuation data coming soon.`;

  const keyFacts = [
    { label: lang === "zh" ? "代码" : "Ticker", value: ticker },
    { label: lang === "zh" ? "持有人数" : "Holder count", value: String(n) },
    { label: lang === "zh" ? "合计市值" : "Total value held", value: formatUSD(totalValue) },
    { label: lang === "zh" ? "最大持有人" : "Largest holder", value: topHolder.person },
  ];

  const related = [...holders]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((r) => ({ label: r.person, href: investorPath(lang, r.slug) }));

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: lang === "zh" ? "个股" : "Stocks", item: `https://thecompounder.fyi/${lang}/stocks` },
      { "@type": "ListItem", position: 2, name: issuer, item: `https://thecompounder.fyi/${lang}/stocks/${ticker}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <EntityPage
        lang={lang}
        title={issuer}
        subtitle={subtitle}
        keyFacts={keyFacts}
        aiPageKey={`stock:${ticker}`}
        sources={[{ name: "SEC EDGAR 13F", asOf: latestFiledAt }]}
        related={related}
      >
        <HoldersTable holders={holders} lang={lang} />
      </EntityPage>
    </>
  );
}
