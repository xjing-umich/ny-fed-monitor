import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { formatUSD } from "@/lib/format";
import { EntityName } from "@/components/common/EntityName";
import { Badge } from "@/components/common/Badge";

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
          <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-[var(--tt-faint)]">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <Link href={r.href} className="font-medium text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">
              <EntityName issuer={r.issuer} ticker={r.ticker} />
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--tt-faint)]">
              {r.pctOfAggregate != null && (
                <span className="font-mono tabular-nums">
                  {isZh ? `占聚合 ${(r.pctOfAggregate * 100).toFixed(1)}%` : `${(r.pctOfAggregate * 100).toFixed(1)}% of aggregate`}
                </span>
              )}
              {r.kindLabel && <Badge tone={r.kindTone ?? "neutral"}>{r.kindLabel}</Badge>}
              {r.value != null && <span className="font-mono tabular-nums">{formatUSD(r.value)}</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-2xl font-medium tabular-nums text-[var(--tt-text)]">{r.primary}</div>
            {r.delta != null ? (
              <div className={`font-mono text-[11px] tabular-nums ${r.delta > 0 ? "text-[var(--tt-accent)]" : r.delta < 0 ? "text-[var(--tt-negative)]" : "text-[var(--tt-faint)]"}`}>
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
