import type { Lang } from "@/lib/nav";

const COPY = {
  zh: { quote: "价格是你付出的，价值是你得到的。", who: "—— 沃伦·巴菲特" },
  en: { quote: "Price is what you pay. Value is what you get.", who: "— Warren Buffett" },
} as const;

export default function PhilosophyQuote({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-12">
      <blockquote className="mx-auto max-w-3xl text-center">
        <p className="font-display text-2xl font-medium leading-snug tracking-tight text-[var(--tt-text)] sm:text-3xl">
          "{c.quote}"
        </p>
        <footer className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--tt-faint)]">{c.who}</footer>
      </blockquote>
    </section>
  );
}
