"use client";

import React, { useMemo } from "react";
import type { ManagerSummary, ManagerQoQ } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath } from "@/lib/urls";
import { MOVE_GLYPH, MOVE_LABEL } from "@/lib/entity/quarterMovesText";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { displayFundName } from "@/lib/managers/profileProse";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { quarterLabel, freshness13F, daysAgo, globalLatestPeriod, isScopeChange, parseUTC } from "@/lib/freshness/derive";
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

type Row = ManagerSummary & { qoq?: ManagerQoQ; label?: string };

const COPY = {
  zh: {
    search: "搜索投资人或机构…",
    cols: {
      investor: "投资人 / 机构",
      portfolio: "持仓市值",
      holdings: "持仓数",
      period: "报告期",
      // 申报季里"本季"会指错季(10 月底列的是 Q2),写成最新一季。
      move: "最新一季变动",
    },
    verdict: { buying: "▲ 净买入", selling: "▼ 净卖出", mixed: "基本持平" },
    unchanged: "无变动",
    kind: { new: `${MOVE_GLYPH.new} ${MOVE_LABEL.zh.new}`, exited: `${MOVE_GLYPH.exited} ${MOVE_LABEL.zh.exited}`, increased: `${MOVE_GLYPH.increased} ${MOVE_LABEL.zh.increased}`, decreased: `${MOVE_GLYPH.decreased} ${MOVE_LABEL.zh.decreased}` },
    topPrefix: "最大：",
    noResults: "没有匹配的投资者，换个关键词或清空筛选试试。",
    count: (m: number, n: number) => (m === n ? `共 ${n} 位` : `匹配 ${m} / 共 ${n} 位`),
    filedAgo: (d: number) => (d === 0 ? "今天提交" : `${d} 天前提交`),
    scopeNote: "13F 申报原文数字。股价一季变不了这么多，多为资金赎回、清盘或申报范围变化，不等于主动卖出/买入。",
    filterAll: "全部动向",
    filterBuying: "净买入",
    filterSelling: "净卖出",
    filterMixed: "基本持平",
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
    search: "Search by name or firm…",
    cols: {
      investor: "Investor / Firm",
      portfolio: "Portfolio",
      holdings: "Holdings",
      period: "Period",
      move: "Latest 13F changes",
    },
    verdict: { buying: "▲ Net buyer", selling: "▼ Net seller", mixed: "Roughly unchanged" },
    unchanged: "No changes",
    kind: { new: `${MOVE_GLYPH.new} ${MOVE_LABEL.en.new}`, exited: `${MOVE_GLYPH.exited} ${MOVE_LABEL.en.exited}`, increased: `${MOVE_GLYPH.increased} ${MOVE_LABEL.en.increased}`, decreased: `${MOVE_GLYPH.decreased} ${MOVE_LABEL.en.decreased}` },
    topPrefix: "Top: ",
    noResults: "No investors match — try a different spelling or clear the filter.",
    count: (m: number, n: number) => (m === n ? `${n} investors` : `${m} of ${n}`),
    filedAgo: (d: number) => (d === 0 ? "filed today" : `filed ${d}d ago`),
    scopeNote: "As reported in the 13F. Prices don't move this much in a quarter: usually redemptions, a wind-down, or a change in reporting scope — not necessarily active selling or buying.",
    filterAll: "Any move",
    filterBuying: "Net buyers",
    filterSelling: "Net sellers",
    filterMixed: "Roughly unchanged",
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

// 市值环比:中性色展示,绿色只用于估值。
function fmtPctDelta(p: number | null | undefined): { text: string; cls: string } | null {
  if (p == null || p === 0) return null;
  const cls = p > 0 ? "text-[var(--tt-muted)]" : "text-[var(--tt-muted)]";
  return { text: `${p > 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(0)}%`, cls };
}

// 持仓数Δ: 非空且非 0 才显。
function fmtCountDelta(n: number | null | undefined): { text: string; cls: string } | null {
  if (n == null || n === 0) return null;
  const cls = n > 0 ? "text-[var(--tt-muted)]" : "text-[var(--tt-muted)]";
  return { text: `${n > 0 ? "+" : "−"}${Math.abs(n)}`, cls };
}

const VERDICT_TONE: Record<NonNullable<ManagerQoQ["verdict"]>, BadgeTone> = {
  buying: "neutral",
  selling: "neutral",
  mixed: "neutral",
};

const KIND_CLASS: Record<NonNullable<ManagerQoQ["topMoveKind"]>, string> = {
  new: "text-[var(--tt-muted)]",
  increased: "text-[var(--tt-muted)]",
  decreased: "text-[var(--tt-muted)]",
  exited: "text-[var(--tt-muted)]",
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
          <span className={i < 10 ? "font-semibold" : ""}>{m.label ?? m.person}</span>
          <span className="mt-0.5 block text-xs font-normal text-[var(--tt-faint)]">
            {displayFundName(m.name)}
          </span>
        </>
      ),
    },
    {
      key: "portfolio",
      header: lang === "zh" ? `${t.cols.portfolio}（美元）` : t.cols.portfolio,
      align: "right",
      width: "w-36",
      sortKey: "value",
      cell: (m) => {
        const pd = fmtPctDelta(m.qoq?.valueDeltaPct);
        // 量级异常(≤−50% / ≥+100%)标 * 并附说明:多为赎回/清盘/申报范围变化,不是价格或主动调仓。
        const scope = isScopeChange(m.qoq?.valueDeltaPct);
        return (
          <span className="font-medium text-[var(--tt-text)]">
            {formatUSD(m.totalValue, lang, "table")}
            {pd && (
              <span className={`ml-1.5 text-xs ${pd.cls}`} title={scope ? t.scopeNote : undefined}>
                {pd.text}
                {scope && "*"}
              </span>
            )}
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
            {cd && <span className={`ml-1.5 text-xs ${cd.cls}`}>{cd.text}</span>}
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
              {quarterLabel(m.period, lang)}
            </span>
            {justFiled && (
              <span className="font-data text-xs text-[var(--tt-muted)]">{t.filedAgo(days)}</span>
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
            {/* mixed = 估算净额不到上季市值的 2%;没有动作时单独说"无变动" */}
            <Badge tone={VERDICT_TONE[v]}>{v === "mixed" && !kind ? t.unchanged : t.verdict[v]}</Badge>
            {issuer && kind && (
              <span className="mt-1 hidden text-xs text-[var(--tt-muted)] lg:block">
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
