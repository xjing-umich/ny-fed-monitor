import type { Lang } from "@/lib/nav";
import { BAND_COPY, type StockAnchor } from "@/lib/stocks/stockConclusion";

// 页内锚点:≥768px 纯 CSS sticky,避开顶栏(768–1023px 56px / ≥1024px 60px);手机不吸顶,免得两条常驻栏挤占阅读空间。零 JS,不做当前区块高亮。
export function StockAnchorNav({ lang, anchors }: { lang: Lang; anchors: StockAnchor[] }) {
  return (
    <nav
      aria-label={BAND_COPY[lang].anchorsAria}
      className="relative md:sticky md:top-14 lg:top-[60px] z-20 border-b border-[var(--tt-border)] bg-[var(--tt-bg)]"
    >
      <ul className="flex list-none gap-1 overflow-x-auto p-0">
        {anchors.map((a) => (
          <li key={a.id}>
            <a
              href={`#${a.id}`}
              className="inline-flex min-h-[44px] items-center whitespace-nowrap px-2 text-sm text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-text)]"
            >
              {a.label}
            </a>
          </li>
        ))}
      </ul>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-[var(--tt-bg)] via-[var(--tt-bg)]/80 to-transparent pl-6 pr-1 text-xs text-[var(--tt-muted)] sm:hidden">→</span>
    </nav>
  );
}
