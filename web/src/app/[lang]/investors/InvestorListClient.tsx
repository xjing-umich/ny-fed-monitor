"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import type { ManagerSummary, ManagerQoQ } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath } from "@/lib/urls";
import { formatUSD } from "@/lib/format";

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

const VERDICT_CLASS: Record<NonNullable<ManagerQoQ["verdict"]>, string> = {
  buying: "text-[var(--tt-positive)] border-[var(--tt-positive)]",
  selling: "text-[var(--tt-warn)] border-[var(--tt-warn)]",
  mixed: "text-[var(--tt-faint)] border-[var(--tt-border)]",
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
                <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-44">
                  {t.cols.move}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const pd = fmtPctDelta(m.qoq?.valueDeltaPct);
                const cd = fmtCountDelta(m.qoq?.countDelta);
                const v = m.qoq?.verdict ?? null;
                const issuer = m.qoq?.topMoveIssuer ?? null;
                const kind = m.qoq?.topMoveKind ?? null;
                return (
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
                      {pd && <span className={`ml-1.5 text-[11px] ${pd.cls}`}>{pd.text}</span>}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-text)]">
                      {m.holdingCount}
                      {cd && <span className={`ml-1.5 text-[11px] ${cd.cls}`}>{cd.text}</span>}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-muted)] hidden sm:table-cell">
                      {m.period}
                    </td>
                    <td className="py-3 text-right">
                      {v ? (
                        <>
                          <span
                            className={[
                              "inline-block font-mono text-[10px] uppercase tracking-[0.04em] px-1.5 py-0.5 border rounded-sm",
                              VERDICT_CLASS[v],
                            ].join(" ")}
                          >
                            {t.verdict[v]}
                          </span>
                          {issuer && kind && (
                            <span className="block text-[11px] text-[var(--tt-muted)] mt-1 hidden sm:block">
                              {t.topPrefix}
                              <span className="text-[var(--tt-text)]">{issuer}</span>{" "}
                              <span className={KIND_CLASS[kind]}>{t.kind[kind]}</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[var(--tt-faint)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
