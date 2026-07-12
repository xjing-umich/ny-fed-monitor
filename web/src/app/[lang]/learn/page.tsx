import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getFeatured, getLatest, listRest, BRAND } from "@/lib/learn";
import { altFor } from "@/lib/seo";
import { localePath } from "@/lib/urls";
import PageHeader from "@/components/common/PageHeader";

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

const COPY = {
  en: {
    title: "Learn",
    eyebrow: "Learn",
    heading: "Learn to read businesses, not tickers",
    intro: "Plain guides to reading businesses the way serious investors do.",
    startHere: "Start here",
    latest: "Latest",
    updated: "Updated",
  },
  zh: {
    title: "学习",
    eyebrow: "学习",
    heading: "读懂生意，而非代码",
    intro: "像严肃投资者那样读懂生意的大白话指南。",
    startHere: "从这里开始",
    latest: "最新",
    updated: "更新于",
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const c = COPY[lang];
  return {
    title: `${c.title} — Compounder`,
    description: c.intro,
    alternates: altFor(lang, "/learn"),
  };
}

export default async function LearnIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const c = COPY[lang];
  const brand = BRAND[lang];
  const featured = getFeatured(lang);
  const latest = getLatest(lang);
  const rest = listRest(lang);

  return (
    <article className="max-w-[720px] mx-auto py-8 sm:py-10">
      <PageHeader eyebrow={c.eyebrow} title={c.heading} intro={c.intro} />

      {/* 品牌块:理念常驻凸显,accent 左描边区别于列表 */}
      <section className="mt-8 border-l-2 border-[var(--tt-accent)] pl-4">
        <p className="text-sm leading-relaxed text-[var(--tt-muted)]">{brand.body}</p>
        <Link
          href={localePath(lang, "/about")}
          className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
        >
          {brand.aboutLabel} →
        </Link>
      </section>

      {/* 从这里开始:手挑基石文,大卡 */}
      {featured ? (
        <Link
          href={localePath(lang, `/learn/${featured.slug}`)}
          className="group mt-8 block border-t border-[var(--tt-border)] pt-6 no-underline"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
            {c.startHere}
          </span>
          <h2 className="mt-2 font-display text-2xl font-medium leading-tight text-[var(--tt-text)] group-hover:text-[var(--tt-accent)] transition-colors">
            {featured.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
            {featured.description}
          </p>
        </Link>
      ) : null}

      {/* 最新:按 updated 自动置顶 */}
      {latest ? (
        <Link
          href={localePath(lang, `/learn/${latest.slug}`)}
          className="group mt-6 block border-t border-[var(--tt-border)] pt-5 no-underline"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
            {c.latest}
          </span>
          <h2 className="mt-2 text-lg font-medium text-[var(--tt-text)] group-hover:text-[var(--tt-accent)] transition-colors">
            {latest.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
            {latest.description}
          </p>
          {latest.updated ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
              {c.updated} {latest.updated}
            </p>
          ) : null}
        </Link>
      ) : null}

      {/* 全部指南:其余文章,沿用原列表样式 */}
      {rest.length > 0 ? (
        <ul className="mt-8 flex flex-col">
          {rest.map((a) => (
            <li key={a.slug} className="border-t border-[var(--tt-border)] py-5">
              <Link href={localePath(lang, `/learn/${a.slug}`)} className="group no-underline">
                <h2 className="text-lg font-medium text-[var(--tt-text)] group-hover:text-[var(--tt-accent)] transition-colors">
                  {a.title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
                  {a.description}
                </p>
                {a.updated ? (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
                    {c.updated} {a.updated}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
