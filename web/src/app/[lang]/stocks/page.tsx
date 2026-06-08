import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { consensusHeld } from "@/lib/aggregations";
import { getCusipMap, getTickerExchangeMap } from "@/lib/managers/securities";
import { stockPath } from "@/lib/urls";
import { ExternalFinanceLinks } from "@/components/entity/ExternalFinanceLinks";
import { isLikelyTicker } from "@/lib/externalLinks";
import { formatUSD } from "@/lib/format";
import SubNav from "@/components/shell/SubNav";

// 共识持仓为季度级数据,无需每请求重算。静态预渲染 + 每小时 ISR → 列表页 CDN 秒开。
export const revalidate = 3600;

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
        title: "个股 · 最多机构持有 — Compounder · 复利",
        description: "统计顶级投资者 13F 持仓中，被最多机构同时持有的股票。",
      }
    : {
        title: "Stocks · Most held — Compounder · 复利",
        description: "Securities held by the most superinvestors simultaneously, derived from 13F filings.",
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

  return (
    <div className="mx-auto max-w-4xl px-2 py-8 sm:py-10">
      {/* Section sub-nav */}
      <SubNav lang={lang} section="stocks" active="held" />

      {/* Editorial section heading */}
      <div className="mb-8 border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {isZh ? "个股" : "Stocks"}
          <span className="mx-2 text-[var(--tt-faint)]">·</span>
          <span className="text-[var(--tt-muted)]">
            {isZh ? "最多机构持有" : "Most held"}
          </span>
        </h1>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">
          {isZh
            ? "按持有机构数排列，数据来源：SEC 13F 持仓披露。"
            : "Ranked by number of superinvestors holding the security. Source: SEC 13F filings."}
        </p>
      </div>

      {/* Editorial table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--tt-border)]">
              <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-8">#</th>
              <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)]">
                {isZh ? "标的" : "Security"}
              </th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-28">
                {isZh ? "持有机构数" : "Holders"}
              </th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-36">
                {isZh ? "合计市值" : "Total value"}
              </th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-24">
                {isZh ? "链接" : "Links"}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const info = cusipMap.get(row.cusip);
              const tickerOrCusip = info?.ticker ?? row.cusip;
              return (
              <tr
                key={row.cusip}
                className="group border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
              >
                <td className="py-3 pr-3 font-mono text-[11px] text-[var(--tt-faint)] tabular-nums">
                  {i + 1}
                </td>
                <td className="py-3 pr-4">
                  <Link
                    href={stockPath(lang, tickerOrCusip)}
                    className="font-display font-medium text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)] transition-colors"
                  >
                    {row.issuer}
                  </Link>
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-faint)]">
                    {info?.ticker ?? row.cusip}
                  </span>
                </td>
                <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-text)]">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <span
                      className="inline-block h-1.5 rounded-full bg-[var(--tt-accent)] opacity-70"
                      style={{ width: `${Math.round((row.holderCount / rows[0].holderCount) * 32)}px` }}
                    />
                    {row.holderCount}
                  </span>
                </td>
                <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-muted)]">
                  {formatUSD(row.totalValue)}
                </td>
                <td className="py-3 pl-3 text-right">
                  {/* mostHeld 的 cusip 字段实为 ticker(consensusRead/tickerizeRows 已 tickerize),
                      故用 tickerOrCusip;info?.ticker 按 ticker 查 cusipMap 必为 undefined。 */}
                  {isLikelyTicker(tickerOrCusip) ? (
                    <span className="inline-flex justify-end">
                      <ExternalFinanceLinks ticker={tickerOrCusip} exchange={exchangeMap.get(tickerOrCusip)} variant="table" lang={lang} />
                    </span>
                  ) : null}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--tt-muted)]">
          {isZh ? "暂无数据" : "No data available"}
        </p>
      )}

      <p className="mt-8 text-xs text-[var(--tt-faint)]">
        {isZh
          ? "数据来源：SEC EDGAR 13F 季度报告。持仓数据存在 45 天延迟，仅供参考。"
          : "Source: SEC EDGAR 13F quarterly filings. Holdings data has a 45-day lag and is for reference only."}
      </p>
    </div>
  );
}
