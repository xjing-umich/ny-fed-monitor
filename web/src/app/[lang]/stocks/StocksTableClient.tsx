"use client";

import React from "react";
import type { Lang } from "@/lib/nav";
import { stockPath } from "@/lib/urls";
import { formatUSD } from "@/lib/format";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Paginated } from "@/components/common/Paginated";
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

const PAGE_SIZE = 50;

export function StocksTableClient({
  lang,
  rows,
}: {
  lang: Lang;
  rows: StockRow[];
}) {
  const isZh = lang === "zh";

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
            <ExternalFinanceLinks
              ticker={r.ticker}
              exchange={r.exchange}
              variant="table"
              lang={lang}
            />
          </span>
        ) : null,
    },
  ];

  return (
    <Paginated
      items={rows}
      pageSize={PAGE_SIZE}
      moreLabel={isZh ? "加载更多" : "Load more"}
      render={(visible) => (
        <DataTable
          columns={columns}
          rows={visible}
          getKey={(r) => r.ticker}
          rowHref={(r) => stockPath(lang, r.ticker)}
          showRank
        />
      )}
    />
  );
}
