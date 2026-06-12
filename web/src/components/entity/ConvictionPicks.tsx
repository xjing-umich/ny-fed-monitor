import React from "react";
import type { ConvictionPick, ConvictionSignal } from "@/lib/managers/conviction";
import type { Lang } from "@/lib/nav";
import { stockPath } from "@/lib/urls";
import { EntityName } from "@/components/common/EntityName";
import { TrackedLink } from "@/components/common/TrackedLink";

const COPY = {
  zh: {
    title: "高信念持仓",
    asOf: (period: string) => `基于 ${period} 数据`,
    chip: {
      accumulating: (p: ConvictionPick) => `连续加仓·${p.addStreak}季`,
      fresh_conviction: () => "重磅新建/加仓",
      long_core: (p: ConvictionPick) => `长期重仓·${p.quartersHeld}季`,
      never_trimmed: (p: ConvictionPick) => `从不减仓·${p.quartersHeld}季`,
    },
    reason: {
      accumulating: (p: ConvictionPick) => `连续 ${p.addStreak} 个季度增持。`,
      fresh_conviction: (p: ConvictionPick) =>
        `最新季重仓${p.quartersHeld <= 1 ? "新建" : "加仓"}，占组合 ${fmtWeight(p.latestWeight)}。`,
      long_core: (p: ConvictionPick) => `连续持有 ${p.quartersHeld} 季的核心仓位。`,
      never_trimmed: (p: ConvictionPick) => `持有 ${p.quartersHeld} 季，从未减持。`,
    },
  },
  en: {
    title: "High-conviction",
    asOf: (period: string) => `Based on ${period} data`,
    chip: {
      accumulating: (p: ConvictionPick) => `Adding · ${p.addStreak}q`,
      fresh_conviction: () => "Big new buy",
      long_core: (p: ConvictionPick) => `Core · ${p.quartersHeld}q`,
      never_trimmed: (p: ConvictionPick) => `Never trimmed · ${p.quartersHeld}q`,
    },
    reason: {
      accumulating: (p: ConvictionPick) => `Added for ${p.addStreak} straight quarters.`,
      fresh_conviction: (p: ConvictionPick) =>
        `Big ${p.quartersHeld <= 1 ? "new buy" : "add"} last quarter — ${fmtWeight(p.latestWeight)} of the book.`,
      long_core: (p: ConvictionPick) => `A core position held ${p.quartersHeld} quarters running.`,
      never_trimmed: (p: ConvictionPick) => `Held ${p.quartersHeld} quarters, never sold a share.`,
    },
  },
} as const;

// 线色/chip 色随信号：加仓正色、新建强调色、长期信息色、其余中性（spec §4.3）
const SIGNAL_COLOR: Record<ConvictionSignal, string> = {
  accumulating: "var(--tt-positive)",
  fresh_conviction: "var(--tt-accent)",
  long_core: "var(--tt-muted)",
  never_trimmed: "var(--tt-faint)",
};

const fmtWeight = (w: number | null): string => (w != null ? `${(w * 100).toFixed(1)}%` : "—");

/** 纯内联 SVG sparkline：X=季序(升序)，Y=按该证券自己的 [min,max] 归一化；未持有季=0。 */
function Sparkline({ series, color }: { series: readonly number[]; color: string }): React.ReactElement {
  const W = 120;
  const H = 28;
  const PAD = 2;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1; // 全平序列 → 画一条水平线
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;
  const points = series
    .map((v, i) => {
      const x = PAD + i * step;
      const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 「高信念持仓」精选区块（服务端组件：静态 SVG + 确定性文案全部渲进 HTML，零 client JS）。
 * picks 空 → null（区块整体不渲染，无空状态占位）。
 */
export function ConvictionPicks({
  picks,
  lang,
  investor,
  cusipToTicker,
  asOfPeriod,
}: {
  picks: ConvictionPick[];
  lang: Lang;
  investor: string; // manager slug，仅用于打点 payload（组件无其他业务知识）
  cusipToTicker: Map<string, string>; // 页面已算好，传入复用，不重算
  asOfPeriod?: string; // stale 时传 latest.period，区块级 as-of 警示（spec freshness-guard §C3）
}): React.ReactElement | null {
  if (picks.length === 0) return null;
  const t = COPY[lang];
  return (
    <section>
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.title}
        </span>
        {asOfPeriod && (
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-warn)]">
            {t.asOf(asOfPeriod)}
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((p) => {
          const ticker = cusipToTicker.get(p.cusip) ?? p.cusip;
          const color = SIGNAL_COLOR[p.signal];
          return (
            <TrackedLink
              key={p.cusip}
              href={stockPath(lang, ticker)}
              event="conviction_card_click"
              payload={{ investor, ticker, signal: p.signal, lang }}
              className="block rounded-lg border border-[var(--tt-border)] bg-[var(--tt-surface)] p-4 no-underline transition-colors hover:border-[var(--tt-accent)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-[var(--tt-text)]">
                  <EntityName issuer={p.issuer} ticker={cusipToTicker.get(p.cusip)} />
                </span>
                <span
                  className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]"
                  style={{ color, borderColor: color }}
                >
                  {t.chip[p.signal](p)}
                </span>
              </div>
              <div className="mt-3">
                <Sparkline series={p.series} color={color} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--tt-muted)]">{t.reason[p.signal](p)}</p>
            </TrackedLink>
          );
        })}
      </div>
    </section>
  );
}
