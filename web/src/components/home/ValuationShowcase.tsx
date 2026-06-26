import Link from "next/link";
import type { Lang } from "@/lib/nav";

const COPY = {
  zh: {
    heading: "值多少钱",
    thesis:
      "每只股票，三法估值：Buffett 所有者收益 DCF · Greenwald 盈利能力价值 · 资产重置价值。保守为先，只为已证实的价值付费。",
    band: "价值带",
    floor: "保守下限",
    fair: "合理区间",
    optimistic: "乐观上限",
    cta: "看个股估值 →",
  },
  en: {
    heading: "What it's worth",
    thesis:
      "Every stock, valued three ways: Buffett owner-earnings DCF · Greenwald earnings-power value · asset reproduction value. Conservative first — pay only for proven value.",
    band: "Value band",
    floor: "Conservative floor",
    fair: "Fair range",
    optimistic: "Optimistic ceiling",
    cta: "See per-stock valuation →",
  },
} as const;

export default function ValuationShowcase({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section id="valuation" className="mt-16 scroll-mt-24 border-t border-[var(--tt-border)] pt-6">
      <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">
        {c.heading}
      </h2>
      <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-[var(--tt-muted)]">{c.thesis}</p>

      <div className="mt-6 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{c.band}</p>
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full">
          <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-90" />
          <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-50" />
          <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-25" />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--tt-faint)]">
          <span>{c.floor}</span>
          <span>{c.fair}</span>
          <span>{c.optimistic}</span>
        </div>
      </div>

      <Link
        href={`/${lang}/stocks`}
        className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
      >
        {c.cta}
      </Link>
    </section>
  );
}
