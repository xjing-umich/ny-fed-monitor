import React from "react";
import type { Lang } from "@/lib/nav";
import type { MovesCount } from "@/lib/entity/quarterMovesText";
import { QuarterMovesLine } from "@/components/entity/QuarterMovesLine";
import { HolderTrend } from "@/components/entity/HolderTrend";
import { BAND_COPY } from "@/lib/stocks/stockConclusion";

// 个股页首屏结论带(spec 2026-10-25 §三.1):左 = 价格相对价值带,右 = 谁在持有。RSC,只渲染页面已算好的值。
export function StockConclusionBand({
  lang,
  left,
  marginText,
  holders,
}: {
  lang: Lang;
  left: React.ReactNode;
  marginText: string | null;
  holders: {
    line: string;
    quarter: string;
    moves: MovesCount;
    exited: { name: string; href: string }[];
    trend: number[];
  };
}): React.ReactElement {
  const c = BAND_COPY[lang];
  return (
    // 只画上边线:下边由紧随其后的锚点栏 border-b 收口,避免两条 hairline 叠成双线。
    <section
      aria-label={`${c.left} · ${c.right}`}
      className="grid gap-6 border-t border-[var(--tt-border)] pt-5 md:grid-cols-[3fr_2fr] md:gap-8"
    >
      <div className="min-w-0 space-y-3">
        <p className="text-xs text-[var(--tt-muted)]">{c.left}</p>
        {marginText && <p className="font-data text-sm font-medium text-[var(--val-below)]">{marginText}</p>}
        {left}
      </div>
      <div className="min-w-0 space-y-2 md:border-l md:border-[var(--tt-border)] md:pl-8">
        <p className="text-xs text-[var(--tt-muted)]">{c.right}</p>
        <p className="font-display text-xl font-medium text-[var(--tt-text)]">{holders.line}</p>
        <QuarterMovesLine q={holders.quarter} moves={holders.moves} exited={holders.exited} unit="investor" lang={lang} />
        {holders.trend.length >= 2 && <HolderTrend series={holders.trend} lang={lang} variant="inline" />}
      </div>
    </section>
  );
}
