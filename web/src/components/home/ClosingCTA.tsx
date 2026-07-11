import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { localePath } from "@/lib/urls";

const COPY = {
  zh: {
    line: "从任意一位投资者、任意一只股票开始。",
    sub: "从投资者名单或个股估值开始。",
    cta: "打开投资者名单",
  },
  en: {
    line: "Start with any investor, any stock.",
    sub: "Start from the investor list or a single-stock valuation.",
    cta: "Open the investor list",
  },
} as const;

export default function ClosingCTA({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-16 text-center">
      <p className="mx-auto max-w-3xl text-3xl font-medium leading-[1.1] tracking-tight text-[var(--tt-text)] sm:text-5xl">
        {c.line}
      </p>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[var(--tt-muted)]">{c.sub}</p>
      <Link
        href={localePath(lang, "/investors")}
        className="group mt-8 inline-flex items-center text-lg text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
      >
        <span className="[border-bottom:1px_solid_var(--tt-accent)] pb-0.5">{c.cta}</span>
        <span className="ml-1.5 inline-block text-[var(--tt-accent)] transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    </section>
  );
}
