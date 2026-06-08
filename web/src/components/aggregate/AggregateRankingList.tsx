import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { formatUSD } from "@/lib/format";
import { EntityName } from "@/components/common/EntityName";

export type RankRow = {
  ticker: string;
  issuer: string;
  primary: number;            // 主数字: 持有投资者数 / 动作投资者数
  href: string;
  delta?: number | null;      // 共识页: 持有人净增减
  pctOfAggregate?: number;    // 共识页: 0–1
  value?: number;             // 买卖页: 涉及金额
  kindLabel?: string;         // 买卖页: 动作标签
  kindTone?: "positive" | "warn" | "neutral";
};

const toneClass: Record<NonNullable<RankRow["kindTone"]>, string> = {
  positive: "text-[var(--tt-accent)]",
  warn: "text-[#b03a3a]",
  neutral: "text-[var(--tt-muted)]",
};

export function AggregateRankingList({
  lang, rows, primaryLabel,
}: { lang: Lang; rows: RankRow[]; primaryLabel: string }) {
  const isZh = lang === "zh";
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--tt-muted)]">
        {isZh ? "数据准备中" : "Data coming soon"}
      </p>
    );
  }
  return (
    <ul className="list-none p-0 m-0">
      {rows.map((r, i) => (
        <li key={r.ticker} className="flex items-center gap-3 border-b border-[var(--tt-border)] py-3">
          <span className="w-6 shrink-0 font-display text-xl text-[var(--tt-faint)] tabular-nums">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <Link href={r.href} className="font-display font-medium text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">
              <EntityName issuer={r.issuer} ticker={r.ticker} />
            </Link>
            <div className="mt-0.5 text-[11px] text-[var(--tt-faint)]">
              {r.pctOfAggregate != null && (isZh ? `占聚合 ${(r.pctOfAggregate * 100).toFixed(1)}%` : `${(r.pctOfAggregate * 100).toFixed(1)}% of aggregate`)}
              {r.kindLabel && <span className={toneClass[r.kindTone ?? "neutral"]}>{r.kindLabel}</span>}
              {r.value != null && <span className="ml-2">{formatUSD(r.value)}</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-2xl font-semibold tabular-nums text-[var(--tt-text)]">{r.primary}</div>
            {r.delta != null ? (
              <div className={`text-[11px] ${r.delta > 0 ? "text-[var(--tt-accent)]" : r.delta < 0 ? "text-[#b03a3a]" : "text-[var(--tt-faint)]"}`}>
                {r.delta === 0 ? (isZh ? "持平" : "—") : `${r.delta > 0 ? "+" : "−"}${Math.abs(r.delta)} ${isZh ? "位" : ""}`}
              </div>
            ) : (
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">{primaryLabel}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
