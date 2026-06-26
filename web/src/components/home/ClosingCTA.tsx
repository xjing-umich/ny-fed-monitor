import Link from "next/link";
import type { Lang } from "@/lib/nav";

const COPY = {
  zh: { line: "从任意一位投资者、任意一只股票开始。", investors: "投资者", stocks: "股票", valuation: "估值" },
  en: { line: "Start with any investor, any stock.", investors: "Investors", stocks: "Stocks", valuation: "Valuation" },
} as const;

export default function ClosingCTA({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-12 text-center">
      <p className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">{c.line}</p>
      <nav className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <Link href={`/${lang}/investors`} className="font-display text-[15px] text-[var(--tt-text)] no-underline [border-bottom:1px_solid_var(--tt-accent)] hover:text-[var(--tt-accent)]">{c.investors}</Link>
        <Link href={`/${lang}/stocks`} className="font-display text-[15px] text-[var(--tt-text)] no-underline [border-bottom:1px_solid_var(--tt-accent)] hover:text-[var(--tt-accent)]">{c.stocks}</Link>
        <Link href="#valuation" className="font-display text-[15px] text-[var(--tt-text)] no-underline [border-bottom:1px_solid_var(--tt-accent)] hover:text-[var(--tt-accent)]">{c.valuation}</Link>
      </nav>
    </section>
  );
}
