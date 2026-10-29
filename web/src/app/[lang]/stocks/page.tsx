import { date as formatDate } from "@/lib/i18n/format";
import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { consensusHeld } from "@/lib/aggregations";
import { getCusipMap } from "@/lib/managers/securities";
import { getManagerIndex } from "@/lib/managers/source";
import { altFor, ogFor, collectionLd, breadcrumbLd, listMetadata } from "@/lib/seo";
import { localePath, stockPath } from "@/lib/urls";
import { effectiveMovesPeriod, quarterLabel, displayedDataModified } from "@/lib/freshness/derive";
import { stockDisplayName } from "@/lib/stocks/zhNames";
import { isLikelyTicker } from "@/lib/externalLinks";
import { cleanIssuer } from "@/lib/format";
import { LinkDirectory } from "@/components/list/LinkDirectory";
import { ListFallback } from "@/components/list/ListFallback";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { StocksTable, type StockRow } from "./StocksTable";
import { stockUi } from "@/lib/stocks/stockCopy";
import { readBargainVerdicts } from "@/lib/valuation/valuationSnapshot";
import { latestIsoDate } from "@/lib/valuation/asOf";

// 共识持仓为季度级数据,无需每请求重算。静态预渲染 + ISR → 列表页 CDN 秒开,
// 且不会把 consensusHeld(最多 5000 行)反复读出(egress)。
// 周期按 Vercel Hobby 额度定(ISR Writes 按 8KB 计、全站 ~2200 页):列表页 3 天、详情页 7 天;
// 数据批量更新后的整站刷新由 workflow 调 /api/revalidate 承担(13F 有新 filing 时 + 估值每周六)。
export const revalidate = 259200;

// ── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const alternates = altFor(lang, "/stocks");
  const { directory, asOfLabel } = await getStocksPageData(lang);
  const meta = listMetadata(lang, "stocks", directory.length, asOfLabel ?? null);
  return {
    ...meta,
    alternates,
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, "/stocks") }),
  };
}

// Metadata and page share the same shaped rows and directory within this render.
const getStocksPageData = cache(async (lang: Lang) => {
  // Full consensus set (held by ≥2 funds) — every stock we submit to search has
  // an internal link from this hub. Single-holder long tail stays out (crawlable
  // but not promoted). Shared source with the sitemap so the two never drift.
  // getManagerIndex 有 cache()，与站内其他页共享，只为 dateline 取全局最新季。
  const [rows, cusipMap, idx, bargains] = await Promise.all([
    consensusHeld(),
    getCusipMap(),
    getManagerIndex(),
    readBargainVerdicts(),
  ]);

  // 绿标来自估值快照:标出所用收盘价日期(快照 + ISR 可能比 13F 数据新或旧)。
  const bargainAsOf = latestIsoDate([...bargains.values()].map((b) => b.priceDate));
  // 与首页 masthead / 个股页"截至"同一口径:申报季内不跟单只早申报者跳到新季。
  const displayPeriod = effectiveMovesPeriod(idx.managers.map((m) => m.period), new Date()).period;
  const asOfLabel = quarterLabel(displayPeriod, lang) || undefined;

  // 服务端预塑形为可序列化行,交给 client 组件(DataTable + 分页)。
  const maxHolders = rows[0]?.holderCount ?? 1;
  const tableRows: StockRow[] = rows.map((row) => {
    const info = cusipMap.get(row.cusip);
    // mostHeld 的 cusip 字段实为 ticker(consensusRead/tickerizeRows 已 tickerize)。
    const ticker = info?.ticker ?? row.cusip;
    const bargain = bargains.get(ticker.toUpperCase());
    return {
      ticker,
      issuer: row.issuer,
      holderCount: row.holderCount,
      totalValue: row.totalValue,
      barWidth: Math.round((row.holderCount / maxHolders) * 32),
      bargain: bargain ? { inStrikeZone: bargain.inStrikeZone, marginPct: bargain.marginPct } : null,
    };
  });

  const seen = new Set<string>();
  const directory = tableRows.flatMap((r) => {
    if (!isLikelyTicker(r.ticker) || seen.has(r.ticker)) return [];
    seen.add(r.ticker);
    return [{ href: stockPath(lang, r.ticker), label: r.ticker, note: cleanIssuer(r.issuer) }];
  });

  return { idx, bargainAsOf, asOfLabel, tableRows, directory };
});

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StocksIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  const { idx, bargainAsOf, asOfLabel, tableRows, directory } = await getStocksPageData(lang);
  const isZh = lang === "zh";
  const ui = stockUi(lang);
  const meta = listMetadata(lang, "stocks", directory.length, asOfLabel ?? null);

  // 结构化数据:目录(已按 isLikelyTicker 去重,与表格同序,即按持有人数)的前 50 只;数量是目录总数。
  const path = localePath(lang, "/stocks");
  const ld = [
    collectionLd({
      lang,
      name: ui.stocksTitle,
      description: meta.description,
      path,
      items: directory.map((d) => ({ name: stockDisplayName(lang, d.label, d.note), path: d.href })),
      limit: 50,
      dateModified: displayedDataModified(idx.managers, new Date()),
    }),
    breadcrumbLd(lang, [{ name: ui.stocksTitle, path }]),
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <SubNav lang={lang} section="stocks" active="held" />

      <div className="mb-4">
        <PageHeader
          eyebrow={isZh ? "SEC 13F · 最多人持有" : "SEC 13F · most widely held"}
          title={ui.stocksTitle}
          dateline={<DataAsOfBadge lang={lang} asOf={asOfLabel} />}
          intro={isZh
            ? `按持有机构数排列，数据来源：SEC 13F 持仓披露。少数落在击球区（价格不高于内在价值扣除安全边际后的值）的以绿色标出${bargainAsOf ? `，估值截至 ${formatDate(bargainAsOf, lang)} 收盘价` : ""}。`
            : `Ranked by number of superinvestors holding the security. Source: SEC 13F filings. The few in the strike zone — price at or below intrinsic value minus a margin of safety — are marked in green${bargainAsOf ? ` (valuations as of the ${formatDate(bargainAsOf, lang)} close)` : ""}.`}
        />
      </div>

      <Suspense fallback={<ListFallback />}>
        <StocksTable lang={lang} rows={tableRows} />
      </Suspense>
      {/* 全量目录:与 sitemap 同一谓词(isLikelyTicker + 去重),保证 sitemap 里每个个股 URL
          都有一条服务端可见的站内链接。 */}
      <LinkDirectory
        eyebrow={isZh ? "目录" : "Directory"}
        title={
          isZh
            ? `全部 ${directory.length} 只被两位及以上投资人持有的股票，按代码排序`
            : `All ${directory.length} stocks held by two or more investors, by ticker`
        }
        items={directory}
      />
    </>
  );
}
