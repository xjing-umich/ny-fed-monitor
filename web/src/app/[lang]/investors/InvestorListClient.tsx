"use client";

import React, { useState, useMemo } from "react";
import type { ManagerSummary, ManagerQoQ } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath } from "@/lib/urls";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { displayFundName } from "@/lib/managers/profileProse";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import PageHeader from "@/components/common/PageHeader";

type Row = ManagerSummary & { qoq?: ManagerQoQ };

const COPY = {
  zh: {
    eyebrow: "SEC 13F · 季度披露",
    heading: "超级投资者",
    subtitle: "按组合市值排列 · 最新 13F 季",
    search: "搜索投资人或机构…",
    sortValue: "按市值",
    sortCount: "按持仓数",
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
    noResults: "无匹配结果",
    count: (m: number, n: number) => (m === n ? `共 ${n} 位` : `匹配 ${m} / 共 ${n} 位`),
    filterAll: "全部动向",
    filterBuying: "加仓",
    filterSelling: "减仓",
    filterMixed: "微调",
  },
  en: {
    eyebrow: "SEC 13F · quarterly filings",
    heading: "Superinvestors",
    subtitle: "Ranked by portfolio value · latest 13F quarter",
    search: "Search by name or firm…",
    sortValue: "By value",
    sortCount: "By count",
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
    noResults: "No results",
    count: (m: number, n: number) => (m === n ? `${n} investors` : `${m} of ${n}`),
    filterAll: "Any move",
    filterBuying: "Buying",
    filterSelling: "Selling",
    filterMixed: "Held",
  },
} as const;

type SortKey = "value" | "count";
type VerdictFilter = "all" | "buying" | "selling" | "mixed";

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

export function InvestorListClient({
  lang,
  managers,
}: {
  lang: Lang;
  managers: Row[];
}): React.ReactElement {
  const t = COPY[lang];
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("value");
  const [vf, setVf] = useState<VerdictFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? managers.filter(
          (m) =>
            m.person.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q)
        )
      : managers;
    const afterVf = vf === "all" ? base : base.filter((m) => m.qoq?.verdict === vf);
    return [...afterVf].sort((a, b) =>
      sort === "value" ? b.totalValue - a.totalValue : b.holdingCount - a.holdingCount
    );
  }, [managers, query, sort, vf]);

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
      cell: (m) => m.period,
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

      {/* Controls — quiet hairline style */}
      <div className="space-y-3">
        {/* Row 1: 搜索 + 计数 */}
        <div className="flex flex-wrap gap-4 items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            aria-label={t.search}
            className="flex-1 min-w-[200px] border-0 border-b border-[var(--tt-border)] bg-transparent px-0 py-1.5 text-sm text-[var(--tt-text)] placeholder:text-[var(--tt-faint)] focus:outline-none focus:border-[var(--tt-accent)]"
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
            {t.count(filtered.length, managers.length)}
          </span>
        </div>

        {/* Row 2: 本季动作快筛 + 排序 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["all", t.filterAll],
                ["buying", t.filterBuying],
                ["selling", t.filterSelling],
                ["mixed", t.filterMixed],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setVf(k as VerdictFilter)}
                aria-pressed={vf === k}
                className={[
                  "max-sm:min-h-[44px] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors",
                  "max-sm:border sm:border-0 sm:border-b",
                  vf === k
                    ? "text-[var(--tt-accent)] max-sm:border-[var(--tt-accent)] max-sm:bg-[var(--tt-accent)]/10 sm:border-[var(--tt-accent)]"
                    : "text-[var(--tt-muted)] max-sm:border-[var(--tt-border)] hover:text-[var(--tt-text)] sm:border-transparent hover:sm:border-[var(--tt-border)]",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setSort("value")}
              aria-pressed={sort === "value"}
              className={[
                "max-sm:min-h-[44px] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors",
                "max-sm:border sm:border-0 sm:border-b",
                sort === "value"
                  ? "text-[var(--tt-accent)] max-sm:border-[var(--tt-accent)] max-sm:bg-[var(--tt-accent)]/10 sm:border-[var(--tt-accent)]"
                  : "text-[var(--tt-muted)] max-sm:border-[var(--tt-border)] hover:text-[var(--tt-text)] sm:border-transparent hover:sm:border-[var(--tt-border)]",
              ].join(" ")}
            >
              {t.sortValue}
            </button>
            <button
              onClick={() => setSort("count")}
              aria-pressed={sort === "count"}
              className={[
                "max-sm:min-h-[44px] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors",
                "max-sm:border sm:border-0 sm:border-b",
                sort === "count"
                  ? "text-[var(--tt-accent)] max-sm:border-[var(--tt-accent)] max-sm:bg-[var(--tt-accent)]/10 sm:border-[var(--tt-accent)]"
                  : "text-[var(--tt-muted)] max-sm:border-[var(--tt-border)] hover:text-[var(--tt-text)] sm:border-transparent hover:sm:border-[var(--tt-border)]",
              ].join(" ")}
            >
              {t.sortCount}
            </button>
          </div>
        </div>
      </div>

      {/* Responsive table → 移动端堆叠卡片 */}
      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(m) => m.cik}
        rowHref={(m) => investorPath(lang, m.slug)}
        breakpoint="lg"
        showRank
        emptyText={t.noResults}
      />
    </div>
  );
}
