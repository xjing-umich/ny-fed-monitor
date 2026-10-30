import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { MovesCount } from "@/lib/entity/quarterMovesText";
import { QuarterMovesLine } from "@/components/entity/QuarterMovesLine";
import { BAND_COPY } from "@/lib/stocks/stockConclusion";

// 结论、持仓身份和实际快照日期按阅读顺序纵向展开。只渲染页面已算好的值。
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
    count: number;
    total: string;
    leaders: { name: string; href: string }[];
    snapshotNote: string;
    quarter: string;
    moves: MovesCount;
    exited: { name: string; href: string }[];
  };
}): React.ReactElement {
  const c = BAND_COPY[lang];
  return (
    // 只画上边线:下边由紧随其后的锚点栏 border-b 收口,避免两条 hairline 叠成双线。
    <section
      aria-label={`${c.left} · ${c.right}`}
      className="space-y-6 border-t border-[var(--tt-border)] pt-5"
    >
      <div className="min-w-0 space-y-3">
        {marginText && <p className="font-data text-sm font-medium text-[var(--val-below)]">{marginText}</p>}
        {left}
      </div>
      <div className="min-w-0 space-y-2 border-t border-[var(--tt-border)] pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-xl font-medium text-[var(--tt-text)]">{lang === "zh" ? `${holders.count} 位超级投资者持有` : `${holders.count} tracked investor${holders.count === 1 ? " holds" : "s hold"} this stock`}</h2>
          <Link href="#holders" className="inline-flex min-h-11 items-center text-xs text-[var(--tt-muted)] hover:text-[var(--tt-accent)]">{lang === "zh" ? "查看持仓" : "View holdings"} →</Link>
        </div>
        <p className="font-data text-sm text-[var(--tt-muted)]">{lang === "zh" ? "申报持仓合计 " : "Reported holdings total "}{holders.total}</p>
        {holders.leaders.length > 0 && <p className="text-sm leading-relaxed text-[var(--tt-text)]">
          <span className="text-[var(--tt-muted)]">{lang === "zh" ? "主要持有人：" : "Major holders: "}</span>
          {holders.leaders.map((leader, i) => <React.Fragment key={leader.href}>
            {i > 0 && <span aria-hidden="true"> · </span>}
            <Link href={leader.href} className="inline-block min-h-11 content-center break-words hover:text-[var(--tt-accent)]">{leader.name}</Link>
          </React.Fragment>)}
        </p>}
        <p className="text-xs leading-relaxed text-[var(--tt-muted)]">{holders.snapshotNote}</p>
        <div className="border-t border-[var(--tt-border)] pt-3">
        <QuarterMovesLine q={holders.quarter} moves={holders.moves} exited={holders.exited} unit="investor" lang={lang} />
        <p className="text-xs text-[var(--tt-muted)]">
          {lang === "zh" ? "动作按股数变化判断；权重也会随价格变化。" : "Actions compare share counts; weights also move with prices."}
        </p>
        </div>
      </div>
    </section>
  );
}
