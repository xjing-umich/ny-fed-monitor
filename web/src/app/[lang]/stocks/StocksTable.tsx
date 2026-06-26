import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { stockPath } from "@/lib/urls";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityName } from "@/components/common/EntityName";
import { ExternalFinanceLinks } from "@/components/entity/ExternalFinanceLinks";

export type StockRow = {
  ticker: string;
  issuer: string;
  holderCount: number;
  totalValue: number;
  /** 持有人数条宽(px),服务端按榜首归一化预算 */
  barWidth: number;
  exchange: string | null;
  isTicker: boolean;
};

// 前 N 名走完整富榜(响应式表 + 卡片 + 外链);其余折叠为紧凑链接列表。
// 全部行均为服务端渲染:零 hydration JS、长尾不再"桌面表 + 移动卡"双份富渲染
// (那是 /stocks 4.3MB 的根因)。长尾仍是真 <a>,爬虫可见 → 不回退孤儿修复。
const TOP_N = 50;

export function StocksTable({
  lang,
  rows,
}: {
  lang: Lang;
  rows: StockRow[];
}) {
  const isZh = lang === "zh";
  const head = rows.slice(0, TOP_N);
  const tail = rows.slice(TOP_N);

  // 榜单只回答"规模"——持有机构数与合计市值;基本面属个股详情页(参考 Google Finance 列表)。
  const columns: Column<StockRow>[] = [
    {
      key: "security",
      header: isZh ? "标的" : "Security",
      role: "primary",
      cell: (r) => <EntityName issuer={r.issuer} ticker={r.ticker} />,
    },
    {
      key: "holders",
      header: isZh ? "持有机构数" : "Holders",
      align: "right",
      width: "w-20 sm:w-28",
      mobileLabel: isZh ? "持有" : "Holders",
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5 text-[var(--tt-text)]">
          <span
            className="inline-block h-1.5 rounded-full bg-[var(--tt-accent)] opacity-70"
            style={{ width: `${r.barWidth}px` }}
          />
          {r.holderCount}
        </span>
      ),
    },
    {
      key: "value",
      header: isZh ? "合计市值" : "Total value",
      align: "right",
      width: "w-24 sm:w-36",
      mobileLabel: isZh ? "市值" : "Value",
      cell: (r) => formatUSD(r.totalValue),
    },
    {
      key: "links",
      header: isZh ? "链接" : "Links",
      align: "right",
      width: "w-24",
      hideOnMobile: true,
      cell: (r) =>
        r.isTicker ? (
          <span className="inline-flex justify-end">
            <ExternalFinanceLinks ticker={r.ticker} exchange={r.exchange} variant="table" lang={lang} />
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={head}
        getKey={(r) => r.ticker}
        rowHref={(r) => stockPath(lang, r.ticker)}
        showRank
      />

      {/* 长尾:原生 <details> 折叠的紧凑链接清单(零 JS);所有 <a> 仍在 SSR HTML 中,爬虫可见。 */}
      {tail.length > 0 && (
        <details className="group mt-4">
          <summary className="cursor-pointer list-none py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)] hover:text-[var(--tt-accent)] [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              {isZh ? `展开其余 ${tail.length} 只` : `Show ${tail.length} more`} ▸
            </span>
            <span className="hidden group-open:inline">
              {isZh ? "收起" : "Collapse"} ▾
            </span>
          </summary>
          <ul className="mt-3 grid list-none grid-cols-1 gap-x-6 gap-y-1.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {tail.map((r, i) => (
              <li key={r.ticker} className="flex items-baseline gap-2 text-sm">
                <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--tt-faint)]">
                  {TOP_N + i + 1}
                </span>
                <Link
                  href={stockPath(lang, r.ticker)}
                  className="min-w-0 truncate text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]"
                >
                  {cleanIssuer(r.issuer)}
                  <span className="ml-1.5 font-mono text-[11px] text-[var(--tt-faint)]">{r.ticker}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
