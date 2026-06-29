import Link from "next/link";
import type { Lang } from "@/lib/nav";

const COPY = {
  zh: {
    eyebrow: "开始",
    line: "从任意一位投资者、任意一只股票开始。",
    sub: "免费浏览，无需账户。每个数字都可溯源到 SEC EDGAR 原始申报。",
    investors: "投资者",
    stocks: "股票",
    valuation: "估值",
  },
  en: {
    eyebrow: "Get started",
    line: "Start with any investor, any stock.",
    sub: "Browse free, no account. Every figure traces back to the original SEC EDGAR filing.",
    investors: "Investors",
    stocks: "Stocks",
    valuation: "Valuation",
  },
} as const;

export default function ClosingCTA({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  const links = [
    { label: c.investors, href: `/${lang}/investors` },
    { label: c.stocks, href: `/${lang}/stocks` },
    { label: c.valuation, href: `/${lang}/stocks/screener` },
  ];
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-16 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{c.eyebrow}</p>
      <p className="mx-auto mt-4 max-w-3xl font-display text-3xl font-medium leading-[1.1] tracking-tight text-[var(--tt-text)] sm:text-5xl">
        {c.line}
      </p>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[var(--tt-muted)]">{c.sub}</p>
      <nav className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        {links.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="group font-display text-lg text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
          >
            <span className="[border-bottom:1px_solid_var(--tt-accent)] pb-0.5">{l.label}</span>
            <span className="ml-1.5 text-[var(--tt-accent)] transition-transform group-hover:translate-x-0.5 inline-block">→</span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
