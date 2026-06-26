import React from "react";
import type { Lang } from "@/lib/nav";

// 4-tile 真数据条(RSC):报告期 / 投资人数 / 共识股数 / 10Y 国债。每块带 as-of(CLAUDE.md 硬规)。
// 缺值显 "—"。克制:muted 标签 + mono 数字。
const COPY = {
  zh: { period: "最新报告期", investors: "追踪投资人", consensus: "共识持仓", dgs10: "10 年期国债", lag: "SEC 13F · 45 天延迟" },
  en: { period: "Latest period", investors: "Investors tracked", consensus: "Consensus stocks", dgs10: "10Y Treasury", lag: "SEC 13F · 45-day lag" },
} as const;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 first:pl-0">
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-faint)]">{label}</span>
      <span className="font-mono text-lg font-medium tabular-nums leading-none text-[var(--tt-text)]">{value}</span>
      {sub ? <span className="font-mono text-[10px] text-[var(--tt-faint)]">{sub}</span> : null}
    </div>
  );
}

export function DataStrip({
  lang,
  period,
  investorCount,
  consensusCount,
  dgs10,
}: {
  lang: Lang;
  period: string;
  investorCount: number;
  consensusCount: number;
  dgs10: { value: number; date: string } | null;
}): React.ReactElement {
  const t = COPY[lang];
  return (
    <section className="mt-8 grid grid-cols-2 divide-x divide-[var(--tt-border)] border-y border-[var(--tt-border)] py-1 sm:grid-cols-4">
      <Tile label={t.period} value={period || "—"} sub={t.lag} />
      <Tile label={t.investors} value={investorCount > 0 ? String(investorCount) : "—"} />
      <Tile label={t.consensus} value={consensusCount > 0 ? String(consensusCount) : "—"} />
      <Tile
        label={t.dgs10}
        value={dgs10 ? `${dgs10.value.toFixed(2)}%` : "—"}
        sub={dgs10 ? (lang === "zh" ? `截至 ${dgs10.date}` : `as of ${dgs10.date}`) : undefined}
      />
    </section>
  );
}
