import React from "react";
import type { Lang } from "@/lib/nav";
import { Sparkline } from "@/components/common/Sparkline";

// 持有人数趋势：内联 sparkline SVG，但语义由文字承载——
// 「绝对数」必须落在文字里（近 N 季 X → Y 家），sparkline 仅画形状且 aria-hidden，
// 可访问性 / GEO 抓数由文字承载。早期季可能因回填偏低，挂 faint 脚注说明，别让斜率误导。
// 全 RSC、零 hydration。<2 季 → null（不渲染空盒）。

const COPY = {
  zh: {
    eyebrow: "持有人趋势",
    sentence: (n: number, first: number, last: number) =>
      `近 ${n} 季持有该证券的超级投资者：${first} → ${last} 家。`,
    backfill: "早期季度持有人数可能因数据回填偏低，斜率仅供参考。",
    inline: (n: number, first: number, last: number) =>
      `持有人 ${first} → ${last} · 近 ${n} 季`,
  },
  en: {
    eyebrow: "Holders over time",
    sentence: (n: number, first: number, last: number) =>
      `Superinvestors holding this security over the last ${n} quarters: ${first} → ${last}.`,
    backfill: "Early quarters may understate holder counts due to data backfill — read the slope with care.",
    inline: (n: number, first: number, last: number) =>
      `Holders ${first} → ${last} · last ${n}q`,
  },
} as const;

export function HolderTrend({
  series,
  lang,
  bare = false,
  variant = "block",
}: {
  /** 持有人数序列，按季度升序（最早 → 最新），长度即季数。 */
  series: readonly number[];
  lang: Lang;
  bare?: boolean;
  variant?: "block" | "inline";
}): React.ReactElement | null {
  if (series.length < 2) return null;
  const t = COPY[lang];
  const first = series[0];
  const last = series[series.length - 1];
  if (variant === "inline") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" title={t.backfill}>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)]">
          {t.inline(series.length, first, last)}
        </span>
        <Sparkline series={series} color="var(--tt-muted)" />
      </div>
    );
  }
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm leading-relaxed text-[var(--tt-muted)]">
          {t.sentence(series.length, first, last)}
        </p>
        <Sparkline series={series} color="var(--tt-muted)" />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--tt-muted)]">{t.backfill}</p>
    </>
  );
  if (bare) return body;
  return (
    <section>
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.eyebrow}
        </span>
      </div>
      {body}
    </section>
  );
}
