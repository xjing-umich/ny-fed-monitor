import React from "react";
import Link from "next/link";
import type { Holding } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import { stockPath } from "@/lib/urls";
import { cleanIssuer } from "@/lib/format";

// strike-zone 精选条(RSC, 零 JS)。命中=自足、带实体名+as-of 日期的事实句 → GEO 可引用。
// 三态: 无任何可估值持仓 → 不渲染(null, 区分"无数据"); 有数据但零命中 → 诚实空句;
// ≥1 命中 → 句子 + chips。纯位置语言, 无 BUY/SELL/目标价。
const COPY = {
  zh: {
    eyebrow: "Strike zone 精选",
    hit: (name: string, n: number, date: string) =>
      `截至 ${date}，${name} 有 ${n} 个持仓现价低于我们的保守价值带（strike zone）。`,
    empty: (name: string) => `目前 ${name} 的可估值持仓无一落入 strike zone。`,
    footnote: (computed: string, method: string) => `估值截至 ${computed}；方法：${method}。位置观察，非买卖建议。`,
    method: "保守 Greenwald 价值带 + Owner-Earnings DCF 两法夹逼",
    cta: "点开任一只看个股估值 →",
  },
  en: {
    eyebrow: "Strike-zone picks",
    hit: (name: string, n: number, date: string) =>
      `As of ${date}, ${n} of ${name}'s tracked holdings trade below our conservative value band (strike zone).`,
    empty: (name: string) => `None of ${name}'s tracked holdings are in the strike zone right now.`,
    footnote: (computed: string, method: string) => `Valuation as of ${computed}; method: ${method}. Position observation, not advice.`,
    method: "conservative Greenwald value band + Owner-Earnings DCF",
    cta: "Open any to see the stock's valuation →",
  },
} as const;

function usd0(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function StrikeZonePicks({
  holdings,
  investorName,
  verdicts,
  cusipToTicker,
  lang,
}: {
  holdings: Holding[];
  investorName: string;
  verdicts: Map<string, SnapshotVerdict>;
  cusipToTicker: Map<string, string>;
  lang: Lang;
}): React.ReactElement | null {
  const t = COPY[lang];

  // 关联持仓 ↔ verdict, 仅保留有估值数据者(覆盖诚实)。
  const valued = holdings
    .map((h) => {
      const tk = cusipToTicker.get(h.cusip);
      const v = tk ? verdicts.get(tk.toUpperCase()) : undefined;
      return v ? { h, tk: tk as string, v } : null;
    })
    .filter((x): x is { h: Holding; tk: string; v: SnapshotVerdict } => x !== null);

  if (valued.length === 0) return null; // 无任何可估值持仓 → 不渲染(区分"无数据")

  const hits = valued
    .filter((x) => x.v.inStrikeZone)
    .sort((a, b) => (b.v.marginPct ?? 0) - (a.v.marginPct ?? 0));
  const computedAt = (valued[0].v.computedAt || "").slice(0, 10);
  const asOf = computedAt;

  return (
    <section>
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.eyebrow}
        </span>
      </div>
      <p className="text-[15px] leading-relaxed text-[var(--tt-muted)]">
        {hits.length > 0 ? t.hit(investorName, hits.length, asOf) : t.empty(investorName)}
      </p>
      {hits.length > 0 && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)]">
          {t.cta}
        </p>
      )}
      {hits.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {hits.map(({ h, tk, v }) => (
            <Link
              key={h.cusip}
              href={stockPath(lang, tk)}
              className="group inline-flex items-center gap-1.5 rounded-sm border border-[var(--tt-positive)]/40 px-2 py-1 text-xs no-underline hover:border-[var(--tt-positive)]"
            >
              <span className="font-mono font-medium text-[var(--tt-text)]">{tk}</span>
              <span className="text-[var(--tt-faint)]">{cleanIssuer(h.issuer)}</span>
              <span className="font-mono text-[var(--tt-muted)]">{usd0(v.rangeLo)}–{usd0(v.rangeHi)}/sh</span>
              {v.marginPct != null && v.marginPct > 0 && (
                <span className="font-mono text-[var(--tt-positive)]">−{Math.round(v.marginPct * 100)}%</span>
              )}
              <span aria-hidden className="text-[var(--tt-faint)] transition-colors group-hover:text-[var(--tt-accent)]">→</span>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-[var(--tt-faint)]">{t.footnote(asOf, t.method)}</p>
    </section>
  );
}
