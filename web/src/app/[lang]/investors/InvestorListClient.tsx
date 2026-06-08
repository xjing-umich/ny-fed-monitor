"use client";

import React, { useState, useMemo } from "react";
import type { ManagerSummary, ManagerQoQ } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath } from "@/lib/urls";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Badge, type BadgeTone } from "@/components/common/Badge";

type Row = ManagerSummary & { qoq?: ManagerQoQ };

const COPY = {
  zh: {
    heading: "超级投资者",
    subtitle: "追踪顶级基金经理的 SEC 13F 季度持仓披露，了解聪明钱在买什么。",
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
  },
  en: {
    heading: "Superinvestors",
    subtitle: "Track top fund managers' quarterly SEC 13F disclosures to see what smart money is buying.",
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
  },
} as const;

type SortKey = "value" | "count";

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? managers.filter(
          (m) =>
            m.person.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q)
        )
      : managers;
    return [...base].sort((a, b) =>
      sort === "value" ? b.totalValue - a.totalValue : b.holdingCount - a.holdingCount
    );
  }, [managers, query, sort]);

  const columns: Column<Row>[] = [
    {
      key: "investor",
      header: t.cols.investor,
      role: "primary",
      cell: (m) => (
        <>
          {m.person}
          <span className="mt-0.5 block text-[11px] font-normal text-[var(--tt-faint)]">
            {m.name}
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
          <span className="font-medium text-[var(--tt-accent)]">
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
              <span className="mt-1 hidden text-[11px] text-[var(--tt-muted)] sm:block">
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
    <div className="space-y-8">
      {/* Editorial heading */}
      <div className="border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {t.heading}
        </h1>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">{t.subtitle}</p>
      </div>

      {/* Controls — quiet hairline style */}
      <div className="flex flex-wrap gap-4 items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          aria-label={t.search}
          className="flex-1 min-w-[200px] border-0 border-b border-[var(--tt-border)] bg-transparent px-0 py-1.5 text-sm text-[var(--tt-text)] placeholder:text-[var(--tt-faint)] focus:outline-none focus:border-[var(--tt-accent)]"
        />
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setSort("value")}
            className={[
              "px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] border border-[var(--tt-border)] transition-colors",
              sort === "value"
                ? "bg-[var(--tt-accent)] text-white border-[var(--tt-accent)]"
                : "text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:border-[var(--tt-muted)]",
            ].join(" ")}
          >
            {t.sortValue}
          </button>
          <button
            onClick={() => setSort("count")}
            className={[
              "px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] border border-[var(--tt-border)] transition-colors",
              sort === "count"
                ? "bg-[var(--tt-accent)] text-white border-[var(--tt-accent)]"
                : "text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:border-[var(--tt-muted)]",
            ].join(" ")}
          >
            {t.sortCount}
          </button>
        </div>
      </div>

      {/* Responsive table → 移动端堆叠卡片 */}
      <DataTable
        columns={columns}
        rows={filtered}
        getKey={(m) => m.cik}
        rowHref={(m) => investorPath(lang, m.slug)}
        breakpoint="lg"
        emptyText={t.noResults}
      />
    </div>
  );
}
