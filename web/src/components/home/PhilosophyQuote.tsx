import Link from "next/link";
import type { Lang } from "@/lib/nav";

const COPY = {
  zh: {
    eyebrow: "在巨人的肩上",
    hero: "价格是你付出的，价值是你得到的。",
    heroWho: "沃伦·巴菲特",
    heroFund: "伯克希尔·哈撒韦",
    supporting: [
      { q: "短期看，市场是投票机；长期看，它是称重机。", who: "本杰明·格雷厄姆" },
      { q: "大钱不在买卖之间，而在等待之中。", who: "查理·芒格" },
    ],
  },
  en: {
    eyebrow: "In their words",
    hero: "Price is what you pay. Value is what you get.",
    heroWho: "Warren Buffett",
    heroFund: "Berkshire Hathaway",
    supporting: [
      { q: "In the short run the market is a voting machine; in the long run, a weighing machine.", who: "Benjamin Graham" },
      { q: "The big money is not in the buying and selling, but in the waiting.", who: "Charlie Munger" },
    ],
  },
} as const;

/** Philosophy band: one dramatic hero quote + a row of supporting quotes.
 *  `featuredHref` (when the featured author is a tracked investor) links the
 *  attribution into their page; falls back to plain text. */
export default function PhilosophyQuote({
  lang,
  featuredHref,
}: {
  lang: Lang;
  featuredHref?: string;
}): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="border-t border-[var(--tt-border)] pt-12">
      <p className="tt-eyebrow">{c.eyebrow}</p>

      {/* Hero quote — left rule only; no oversized decorative glyph (collides with the rule). */}
      <figure className="mt-8">
        <blockquote className="border-l-2 border-[var(--tt-accent)] pl-6 sm:pl-8">
          <p className="text-balance text-3xl font-medium leading-[1.16] tracking-tight text-[var(--tt-text)] sm:text-4xl">
            {c.hero}
          </p>
          <figcaption className="mt-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
            <span className="inline-block h-px w-6 bg-[var(--tt-accent)]" />
            <span>
              {featuredHref ? (
                <Link href={featuredHref} className="text-[var(--tt-accent)] no-underline hover:underline">
                  {c.heroWho}
                </Link>
              ) : (
                <span className="text-[var(--tt-accent)]">{c.heroWho}</span>
              )}
              {" · "}
              {c.heroFund}
            </span>
          </figcaption>
        </blockquote>
      </figure>

      {/* Supporting quotes */}
      <div className="mt-10 grid grid-cols-1 gap-8 border-t border-[var(--tt-border)] pt-8 md:grid-cols-2">
        {c.supporting.map((s) => (
          <figure key={s.who}>
            <blockquote className="text-base leading-relaxed text-[var(--tt-muted)] sm:text-lg">
              &ldquo;{s.q}&rdquo;
            </blockquote>
            <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
              {s.who}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
