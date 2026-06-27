import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { consensusHeld } from "@/lib/aggregations";
import { getCusipMap, getTickerExchangeMap } from "@/lib/managers/securities";
import { isLikelyTicker } from "@/lib/externalLinks";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { StocksTable, type StockRow } from "./StocksTable";

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
  const alternates = {
    canonical: `/${lang}/stocks`,
    languages: { en: "/en/stocks", "zh-CN": "/zh/stocks", "x-default": "/en/stocks" },
  };
  return lang === "zh"
    ? {
        title: "个股 · 最多机构持有 — Compounder · 复利",
        description: "统计顶级投资者 13F 持仓中，被最多机构同时持有的股票。",
        alternates,
      }
    : {
        title: "Stocks · Most held — Compounder",
        description: "Securities held by the most superinvestors simultaneously, derived from 13F filings.",
        alternates,
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
  const rows = await consensusHeld();
  const cusipMap = await getCusipMap();
  // Google Finance 链接需 TICKER:EXCHANGE; 与个股详情页一致取交易所, 否则回退搜索。
  const exchangeMap = await getTickerExchangeMap();

  const isZh = lang === "zh";

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
    <div className="mx-auto max-w-5xl px-2 py-8 sm:py-10">
      {/* Section sub-nav */}
      <SubNav lang={lang} section="stocks" active="held" />

      {/* Editorial section heading */}
      <div className="mb-8">
        <PageHeader
          eyebrow={isZh ? "SEC 13F · 最多机构持有" : "SEC 13F · most held"}
          title={isZh ? "个股" : "Stocks"}
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
