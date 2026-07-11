import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { consensusHeld } from "@/lib/aggregations";
import { getCusipMap, getTickerExchangeMap } from "@/lib/managers/securities";
import { getManagerIndex } from "@/lib/managers/source";
import { isLikelyTicker } from "@/lib/externalLinks";
import { altFor, ogFor } from "@/lib/seo";
import { localePath } from "@/lib/urls";
import { globalLatestPeriod, quarterLabel } from "@/lib/freshness/derive";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { DataAsOfBadge } from "@/components/aggregate/DataAsOfBadge";
import { StocksTable, type StockRow } from "./StocksTable";
import { stockUi } from "@/lib/stocks/stockCopy";

// 共识持仓为季度级数据,无需每请求重算。静态预渲染 + 日级 ISR → 列表页 CDN 秒开,
// 且不会每小时把 consensusHeld(最多 5000 行)反复读出(egress)。
export const revalidate = 86400;

// ── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const alternates = altFor(lang, "/stocks");
  const meta =
    lang === "zh"
      ? {
          title: "个股 · 最多人持有 — Compounder · 复利",
          description: "统计顶级投资者 13F 持仓中，最多人持有的股票。",
        }
      : {
          title: "Stocks · Most held — Compounder",
          description: "Most widely held securities among tracked superinvestors, derived from 13F filings.",
        };
  return {
    ...meta,
    alternates,
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, "/stocks") }),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StocksIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  // Full consensus set (held by ≥2 funds) — every stock we submit to search has
  // an internal link from this hub. Single-holder long tail stays out (crawlable
  // but not promoted). Shared source with the sitemap so the two never drift.
  // getManagerIndex 有 cache()，与站内其他页共享，只为 dateline 取全局最新季。
  const [rows, cusipMap, exchangeMap, idx] = await Promise.all([
    consensusHeld(),
    getCusipMap(),
    getTickerExchangeMap(),
    getManagerIndex(),
  ]);

  const isZh = lang === "zh";
  const ui = stockUi(lang);
  const globalLatest = globalLatestPeriod(idx.managers.map((m) => m.period));
  const asOfLabel = quarterLabel(globalLatest) || undefined;

  // 服务端预塑形为可序列化行,交给 client 组件(DataTable + 分页)。
  const maxHolders = rows[0]?.holderCount ?? 1;
  const tableRows: StockRow[] = rows.map((row) => {
    const info = cusipMap.get(row.cusip);
    // mostHeld 的 cusip 字段实为 ticker(consensusRead/tickerizeRows 已 tickerize)。
    const ticker = info?.ticker ?? row.cusip;
    return {
      ticker,
      issuer: row.issuer,
      holderCount: row.holderCount,
      totalValue: row.totalValue,
      barWidth: Math.round((row.holderCount / maxHolders) * 32),
      exchange: exchangeMap.get(ticker) ?? null,
      isTicker: isLikelyTicker(ticker),
    };
  });

  return (
    <div className="mx-auto max-w-5xl py-8 sm:py-10">
      {/* Section sub-nav */}
      <SubNav lang={lang} section="stocks" active="held" />

      {/* Editorial section heading */}
      <div className="mb-8">
        <PageHeader
          eyebrow={isZh ? "SEC 13F · 最多人持有" : "SEC 13F · most widely held"}
          title={ui.stocksTitle}
          dateline={<DataAsOfBadge lang={lang} asOf={asOfLabel} />}
          intro={isZh
            ? "按持有机构数排列，数据来源：SEC 13F 持仓披露。"
            : "Ranked by number of superinvestors holding the security. Source: SEC 13F filings."}
        />
      </div>

      {/* Responsive table + 分页(client) */}
      <StocksTable lang={lang} rows={tableRows} />

      <p className="mt-8 text-xs text-[var(--tt-faint)]">
        {isZh
          ? "数据来源：SEC EDGAR 13F 季度报告。持仓数据存在 45 天延迟，仅供参考。"
          : "Source: SEC EDGAR 13F quarterly filings. Holdings data has a 45-day lag and is for reference only."}
      </p>
    </div>
  );
}
