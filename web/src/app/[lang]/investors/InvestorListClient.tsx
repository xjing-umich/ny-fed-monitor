"use client";

import React, { useMemo } from "react";
import type { ManagerSummary, ManagerQoQ } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath } from "@/lib/urls";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { displayFundName } from "@/lib/managers/profileProse";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { quarterLabel, freshness13F, daysAgo, globalLatestPeriod, parseUTC } from "@/lib/freshness/derive";
import PageHeader from "@/components/common/PageHeader";
import { ListToolbar } from "@/components/list/ListToolbar";
import { ListPagination } from "@/components/list/ListPagination";
import { useListState } from "@/components/list/useListState";
import {
  LIST_PAGE_SIZE,
  clampPage,
  type VerdictFilter,
} from "@/components/list/listQuery";
import {
  filterInvestors,
  pageCount,
  sortByKey,
  visibleSlice,
} from "@/components/list/listRows";

type Row = ManagerSummary & { qoq?: ManagerQoQ };

const COPY = {
  zh: {
    eyebrow: "SEC 13F · 季度披露",
    heading: "超级投资者",
    subtitle: "按组合市值排列 · 最新 13F 季",
    search: "搜索投资人或机构…",
    cols: {
      investor: "投资人 / 机构",
      portfolio: "组合市值",
      holdings: "持仓数",
      period: "报告期",
      move: "本季动作",
    },
    verdict: { buying: "整体加仓", selling: "整体减仓", mixed: "持仓微调" },
    kind: { new: "新建", exited: "清仓", increased: "加仓", decreased: "减仓" },
    topPrefix: "最大：",
    noResults: "没有匹配的投资者，换个关键词或清空筛选试试。",
    count: (m: number, n: number) => (m === n ? `共 ${n} 位` : `匹配 ${m} / 共 ${n} 位`),
    filedAgo: (d: number) => (d === 0 ? "今天提交" : `${d} 天前提交`),
    filterAll: "全部动向",
    filterBuying: "加仓",
    filterSelling: "减仓",
    filterMixed: "微调",
    more: "加载更多",
    prev: "上一页",
    next: "下一页",
    pageOf: (p: number, n: number) => `第 ${p} / ${n} 页`,
    clear: "清空搜索",
    sortGroup: "排序",
    sortAsc: "已按升序排列",
    sortDesc: "已按降序排列",
  },
  en: {
    eyebrow: "SEC 13F · quarterly filings",
    heading: "Superinvestors",
    subtitle: "Ranked by portfolio value · latest 13F quarter",
    search: "Search by name or firm…",
    cols: {
      investor: "Investor / Firm",
      portfolio: "Portfolio",
      holdings: "Holdings",
      period: "Period",
      move: "This quarter",
    },
    verdict: { buying: "Net buying", selling: "Net selling", mixed: "Mostly held" },
    kind: { new: "New", exited: "Exited", increased: "Added", decreased: "Trimmed" },
    topPrefix: "Top: ",
    noResults: "No investors match — try a different spelling or clear the filter.",
    count: (m: number, n: number) => (m === n ? `${n} investors` : `${m} of ${n}`),
    filedAgo: (d: number) => (d === 0 ? "filed today" : `filed ${d}d ago`),
    filterAll: "Any move",
    filterBuying: "Buying",
    filterSelling: "Selling",
    filterMixed: "Held",
    more: "Load more",
    prev: "Prev",
    next: "Next",
    pageOf: (p: number, n: number) => `Page ${p} of ${n}`,
    clear: "Clear search",
    sortGroup: "Sort",
    sortAsc: "sorted ascending",
    sortDesc: "sorted descending",
  },
} as const;

// 市值环比%: 非空且非 0 才显, 绿涨橙跌。
function fmtPctDelta(p: number | null | undefined): { text: string; cls: string } | null {
  if (p == null || p === 0) return null;
  const cls = p > 0 ? "text-[var(--tt-positive)]" : "text-[var(--tt-warn)]";
  return { text: `${p > 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(0)}%`, cls };
}

// 持仓数Δ: 非空且非 0 才显。
function fmtCountDelta(n: number | null | undefined): { text: string; cls: string } | null {
  if (n == null || n === 0) return null;
  const cls = n > 0 ? "text-[var(--tt-positive)]" : "text-[var(--tt-warn)]";
  return { text: `${n > 0 ? "+" : "−"}${Math.abs(n)}`, cls };
}

const VERDICT_TONE: Record<NonNullable<ManagerQoQ["verdict"]>, BadgeTone> = {
  buying: "positive",
  selling: "warn",
  mixed: "neutral",
};

const KIND_CLASS: Record<NonNullable<ManagerQoQ["topMoveKind"]>, string> = {
  new: "text-[var(--tt-positive)]",
  increased: "text-[var(--tt-positive)]",
  decreased: "text-[var(--tt-warn)]",
  exited: "text-[var(--tt-negative)]",
};

type Props = {
  lang: Lang;
  managers: Row[];
  /** 服务端渲染时刻(ms)。用于"x 天前提交"的日历天数,避免客户端时钟差异。 */
  nowMs: number;
};

export const InvestorListClient: React.FC<Props> = ({ lang, managers, nowMs }) => {
  const t = COPY[lang];
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const globalLatest = useMemo(
    () => globalLatestPeriod(managers.map((m) => m.period)),
    [managers],
  );
  const params = useListState({
    defaultSort: "value",
    allowedSorts: ["value", "count", "filed"],
    hasVf: true,
  });

  const filteredSorted = useMemo(() => {
    let rows = filterInvestors(managers, params.q);
    if (params.vf !== "all") rows = rows.filter((m) => m.qoq?.verdict === params.vf);
    return sortByKey(rows, params.sort, params.dir, {
      value: (m) => m.totalValue,
      count: (m) => m.holdingCount,
      // 申报新近度:优先按 SEC 提交日(filedAt),缺失(RPC 未更新)回退按报告期。
      filed: (m) => {
        const d = parseUTC(m.filedAt ?? m.period);
        return d ? d.getTime() : 0;
      },
    });
  }, [managers, params.q, params.sort, params.dir, params.vf]);

  const pages = pageCount(filteredSorted.length);
  const page = clampPage(params.page, pages);
  const desktopRows = visibleSlice(filteredSorted, page, "desktop");
  const mobileRows = visibleSlice(filteredSorted, page, "mobile");
  const desktopRankStart = (page - 1) * LIST_PAGE_SIZE;

  const columns: Column<Row>[] = [
    {
      key: "investor",
      header: t.cols.investor,
      role: "primary",
      cell: (m, i) => (
        <>
          <span className={i < 10 ? "font-semibold" : ""}>{m.person}</span>
          <span className="mt-0.5 block text-[11px] font-normal text-[var(--tt-faint)]">
            {displayFundName(m.name)}
          </span>
        </>
      ),
    },
    {
      key: "portfolio",
      header: t.cols.portfolio,
      align: "right",
      width: "w-36",
      sortKey: "value",
      cell: (m) => {
        const pd = fmtPctDelta(m.qoq?.valueDeltaPct);
        return (
          <span className="font-medium text-[var(--tt-text)]">
            {formatUSD(m.totalValue)}
            {pd && <span className={`ml-1.5 text-[11px] ${pd.cls}`}>{pd.text}</span>}
          </span>
        );
      },
    },
    {
      key: "holdings",
      header: t.cols.holdings,
      align: "right",
      width: "w-24",
      sortKey: "count",
      cell: (m) => {
        const cd = fmtCountDelta(m.qoq?.countDelta);
        return (
          <span className="text-[var(--tt-text)]">
            {m.holdingCount}
            {cd && <span className={`ml-1.5 text-[11px] ${cd.cls}`}>{cd.text}</span>}
          </span>
        );
      },
    },
    {
      key: "period",
      header: t.cols.period,
      align: "right",
      width: "w-28",
      hideOnMobile: true,
      sortKey: "filed",
      cell: (m) => {
        const stale = freshness13F(m.period, globalLatest) !== "current";
        const days = daysAgo(m.filedAt, now);
        const justFiled = days != null && days <= 14;
        return (
          <span className="inline-flex flex-col items-end gap-0.5">
            <span
              className={`inline-flex items-center gap-1.5 ${
                stale ? "text-[var(--tt-faint)]" : "text-[var(--tt-text)]"
              }`}
            >
              {justFiled && (
                <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--tt-accent)]" />
              )}
              {quarterLabel(m.period)}
            </span>
            {justFiled && (
              <span className="font-mono text-[11px] text-[var(--tt-muted)]">{t.filedAgo(days)}</span>
            )}
          </span>
        );
      },
    },
    {
      key: "move",
      header: t.cols.move,
      align: "right",
      width: "w-44",
      role: "trail",
      cell: (m) => {
        const v = m.qoq?.verdict ?? null;
        const issuer = m.qoq?.topMoveIssuer ?? null;
        const kind = m.qoq?.topMoveKind ?? null;
        if (!v) return <span className="text-[var(--tt-faint)]">—</span>;
        return (
          <>
            <Badge tone={VERDICT_TONE[v]}>{t.verdict[v]}</Badge>
            {issuer && kind && (
              <span className="mt-1 hidden text-[11px] text-[var(--tt-muted)] lg:block">
                {t.topPrefix}
                <span className="text-[var(--tt-text)]">{cleanIssuer(issuer)}</span>{" "}
                <span className={KIND_CLASS[kind]}>{t.kind[kind]}</span>
              </span>
            )}
          </>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={t.eyebrow} title={t.heading} intro={t.subtitle} />

      <ListToolbar
        searchLabel={t.search}
        searchPlaceholder={t.search}
        q={params.qInput}
        onQChange={params.setQInput}
        onQSubmit={params.commitQNow}
        countText={t.count(filteredSorted.length, managers.length)}
        chips={[
          { key: "all", label: t.filterAll },
          { key: "buying", label: t.filterBuying },
          { key: "selling", label: t.filterSelling },
          { key: "mixed", label: t.filterMixed },
        ]}
        activeChip={params.vf}
        onChip={(k) => params.setVf(k as VerdictFilter)}
        clearLabel={t.clear}
      />

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          rows={desktopRows}
          getKey={(m) => m.cik}
          rowHref={(m) => investorPath(lang, m.slug)}
          breakpoint="lg"
          showRank
          rankStart={desktopRankStart}
          sortKey={params.sort}
          sortDir={params.dir}
          onSort={params.setSortKey}
          emptyText={t.noResults}
          sortAscLabel={t.sortAsc}
          sortDescLabel={t.sortDesc}
          sortGroupLabel={t.sortGroup}
        />
      </div>

      <div className="md:hidden">
        <DataTable
          columns={columns}
          rows={mobileRows}
          getKey={(m) => m.cik}
          rowHref={(m) => investorPath(lang, m.slug)}
          breakpoint="lg"
          showRank
          rankStart={0}
          sortKey={params.sort}
          sortDir={params.dir}
          onSort={params.setSortKey}
          emptyText={t.noResults}
          sortAscLabel={t.sortAsc}
          sortDescLabel={t.sortDesc}
          sortGroupLabel={t.sortGroup}
        />
      </div>

      <ListPagination
        page={page}
        pageCount={pages}
        onPage={params.setPage}
        moreLabel={t.more}
        remaining={filteredSorted.length - mobileRows.length}
        prevLabel={t.prev}
        nextLabel={t.next}
        pageLabel={t.pageOf}
      />
    </div>
  );
};
