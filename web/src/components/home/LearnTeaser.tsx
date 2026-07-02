import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { listArticles } from "@/lib/learn";
import { localePath } from "@/lib/urls";

const COPY = {
  zh: { eyebrow: "学习", title: "读懂生意，而非代码", cta: "全部指南 →" },
  en: { eyebrow: "Learn", title: "Learn to read businesses, not tickers", cta: "All guides →" },
} as const;

export default function LearnTeaser({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  const articles = listArticles(lang).slice(0, 3);
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{c.eyebrow}</p>
      <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">{c.title}</h2>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {articles.map((a) => (
          <Link key={a.slug} href={localePath(lang, `/learn/${a.slug}`)} className="group block no-underline">
            <h3 className="font-display text-base font-medium text-[var(--tt-text)] transition-colors group-hover:text-[var(--tt-accent)]">{a.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--tt-muted)]">{a.description}</p>
          </Link>
        ))}
      </div>
      <Link href={localePath(lang, "/learn")} className="mt-6 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline">{c.cta}</Link>
    </section>
  );
}
