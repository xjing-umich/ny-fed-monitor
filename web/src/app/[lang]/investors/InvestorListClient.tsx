"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import type { ManagerSummary } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath } from "@/lib/urls";
import { formatUSD } from "@/lib/format";

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
      top: "第一大持仓",
    },
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
      top: "Top holding",
    },
    noResults: "No results",
  },
} as const;

type SortKey = "value" | "count";

export function InvestorListClient({
  lang,
  managers,
}: {
  lang: Lang;
  managers: ManagerSummary[];
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

      {/* Editorial table */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--tt-muted)]">{t.noResults}</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--tt-border)]">
                <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)]">
                  {t.cols.investor}
                </th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-36">
                  {t.cols.portfolio}
                </th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-24">
                  {t.cols.holdings}
                </th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-28 hidden sm:table-cell">
                  {t.cols.period}
                </th>
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-40 hidden md:table-cell">
                  {t.cols.top}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.cik}
                  className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={investorPath(lang, m.slug)}
                      className="font-display font-medium text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)] transition-colors"
                    >
                      {m.person}
                    </Link>
                    <span className="block text-[11px] text-[var(--tt-faint)] mt-0.5">
                      {m.name}
                    </span>
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-accent)] font-medium">
                    {formatUSD(m.totalValue)}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-text)]">
                    {m.holdingCount}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-muted)] hidden sm:table-cell">
                    {m.period}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-muted)] hidden md:table-cell truncate max-w-[160px]">
                    {m.topHolding}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
