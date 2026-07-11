import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { listArticles } from "@/lib/learn";
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
    intro:
      "Plain guides to 13F filings, value investing, and how to read what serious investors actually do. Educational only, not investment advice.",
    updated: "Updated",
  },
  zh: {
    title: "学习",
    eyebrow: "学习",
    heading: "读懂生意，而非代码",
    intro:
      "关于 13F 申报、价值投资,以及如何读懂严肃投资者真实动作的大白话指南。仅供教育参考,不构成投资建议。",
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
  const articles = listArticles(lang);

  return (
    <article className="max-w-[720px] mx-auto py-8 sm:py-10">
      <PageHeader eyebrow={c.eyebrow} title={c.heading} intro={c.intro} />

      <ul className="mt-8 flex flex-col">
        {articles.map((a) => (
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
    </article>
  );
}
