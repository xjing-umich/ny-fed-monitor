"use client";

import React, { useMemo } from "react";
import type { Lang } from "@/lib/nav";
import { stockPath } from "@/lib/urls";
import { formatUSD, fmtMarginPct } from "@/lib/format";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityName } from "@/components/common/EntityName";
import { stockGlossary, stockUi } from "@/lib/stocks/stockCopy";
import { ListToolbar } from "@/components/list/ListToolbar";
import { ListPagination } from "@/components/list/ListPagination";
import { ListQuerySync } from "@/components/list/ListQuerySync";
import { useListState } from "@/components/list/useListState";
import { LIST_PAGE_SIZE, clampPage } from "@/components/list/listQuery";
import {
  filterStocks,
  pageCount,
  sortByKey,
  visibleSlice,
} from "@/components/list/listRows";

export type StockRow = {
  ticker: string;
  issuer: string;
  holderCount: number;
  totalValue: number;
  /** 持有人数条宽(px),服务端按榜首归一化预算 */
  barWidth: number;
  /** 落在击球区/低于内在价值(reliable)才非空 —— 稀有便宜高亮;服务端按前景闸预算 */
  bargain: { inStrikeZone: boolean; marginPct: number } | null;
};

// 稀有便宜绿标:击球区显 chip「击球区/Strike zone」+ 安全边际%;低于内在价值(非严格击球区)只显绿%。
// 颜色不单独承义 —— 整体 aria-label 念全, chip/数字 aria-hidden。
function BargainMark({ bargain, lang }: { bargain: { inStrikeZone: boolean; marginPct: number }; lang: Lang }) {
  const isZh = lang === "zh";
  const pct = fmtMarginPct(bargain.marginPct);
  const label = bargain.inStrikeZone
    ? isZh ? `击球区，安全边际 ${pct}` : `In strike zone, margin of safety ${pct}`
    : isZh ? `低于内在价值，安全边际 ${pct}` : `Below intrinsic value, margin of safety ${pct}`;
  return (
    <span className="inline-flex items-baseline gap-1.5" aria-label={label}>
      {bargain.inStrikeZone && (
        <span
          aria-hidden
          className="rounded-sm border border-[var(--val-below)] px-1 py-px font-data text-xs leading-none text-[var(--val-below)]"
        >
          {isZh ? "击球区" : "Strike zone"}
        </span>
      )}
      <span aria-hidden className="font-data text-xs tabular-nums text-[var(--val-below)]">
        {pct}
      </span>
    </span>
  );
}

type Props = {
  lang: Lang;
  rows: StockRow[];
};

export const StocksTable: React.FC<Props> = ({ lang, rows }) => {
  const g = stockGlossary(lang);
  const ui = stockUi(lang);
  const params = useListState({
    defaultSort: "holders",
    allowedSorts: ["holders", "value"],
    hasVf: false,
  });

  const filteredSorted = useMemo(() => {
    const filtered = filterStocks(rows, params.q);
    return sortByKey(filtered, params.sort, params.dir, {
      holders: (r) => r.holderCount,
      value: (r) => r.totalValue,
    });
  }, [rows, params.q, params.sort, params.dir]);

  const pages = pageCount(filteredSorted.length);
  const page = clampPage(params.page, pages);
  const desktopRows = visibleSlice(filteredSorted, page, "desktop");
  const mobileRows = visibleSlice(filteredSorted, page, "mobile");
  const desktopRankStart = (page - 1) * LIST_PAGE_SIZE;

  // 榜单只回答"规模"——持有机构数与合计市值;基本面属个股详情页(参考 Google Finance 列表)。
  const columns: Column<StockRow>[] = [
    {
      key: "security",
      header: g.security,
      role: "primary",
      cell: (r) => (
        <span className="flex min-w-0 max-w-full flex-wrap items-baseline gap-2">
          <EntityName issuer={r.issuer} ticker={r.ticker} lang={lang} />
          {r.bargain ? <BargainMark bargain={r.bargain} lang={lang} /> : null}
        </span>
      ),
    },
    {
      key: "holders",
      header: g.holdersInstitution,
      align: "right",
      width: "w-20 sm:w-28",
      mobileLabel: g.holdersInstitutionShort,
      sortKey: "holders",
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
      header: lang === "zh" ? `${g.totalValue}（美元）` : g.totalValue,
      align: "right",
      width: "w-24 sm:w-36",
      mobileLabel: lang === "zh" ? `${g.totalValueShort}（美元）` : g.totalValueShort,
      sortKey: "value",
      cell: (r) => formatUSD(r.totalValue, lang, "table"),
    },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <ListQuerySync onChange={params.syncQuery} />
      <ListToolbar
        clearLabel={lang === "zh" ? "清除搜索" : "Clear search"}
        searchLabel={ui.search}
        searchPlaceholder={ui.search}
        q={params.qInput}
        onQChange={params.setQInput}
        onQSubmit={params.commitQNow}
        countText={ui.count(filteredSorted.length, rows.length)}
      />

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          rows={desktopRows}
          getKey={(r) => r.ticker}
          rowHref={(r) => stockPath(lang, r.ticker)}
          showRank
          rankStart={desktopRankStart}
          sortKey={params.sort}
          sortDir={params.dir}
          onSort={params.setSortKey}
          emptyText={ui.noResults}
          sortAscLabel={lang === "zh" ? "已按升序排列" : "sorted ascending"}
          sortDescLabel={lang === "zh" ? "已按降序排列" : "sorted descending"}
          sortGroupLabel={lang === "zh" ? "排序" : "Sort"}
        />
      </div>

      <div className="md:hidden">
        <DataTable
          columns={columns}
          rows={mobileRows}
          getKey={(r) => r.ticker}
          rowHref={(r) => stockPath(lang, r.ticker)}
          showRank
          rankStart={0}
          sortKey={params.sort}
          sortDir={params.dir}
          onSort={params.setSortKey}
          emptyText={ui.noResults}
          sortAscLabel={lang === "zh" ? "已按升序排列" : "sorted ascending"}
          sortDescLabel={lang === "zh" ? "已按降序排列" : "sorted descending"}
          sortGroupLabel={lang === "zh" ? "排序" : "Sort"}
        />
      </div>

      <ListPagination
        page={page}
        pageCount={pages}
        onPage={params.setPage}
        moreLabel={ui.more}
        remaining={filteredSorted.length - mobileRows.length}
        prevLabel={ui.prev}
        nextLabel={ui.next}
        pageLabel={ui.pageOf}
      />
    </div>
  );
};
