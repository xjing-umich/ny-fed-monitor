import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { listArticles } from "@/lib/learn";

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

const COPY = {
  en: {
    title: "Learn",
    intro:
      "Plain guides to 13F filings, value investing, and how to read what serious investors actually do. Educational only, not investment advice.",
  },
  zh: {
    title: "学习",
    intro:
      "关于 13F 申报、价值投资,以及如何读懂严肃投资者真实动作的大白话指南。仅供教育参考,不构成投资建议。",
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
    alternates: {
      canonical: `/${lang}/learn`,
      languages: { en: "/en/learn", "zh-CN": "/zh/learn", "x-default": "/en/learn" },
    },
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
    <article className="max-w-[720px] mx-auto py-4">
      <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)]">
        {c.title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--tt-muted)]">{c.intro}</p>

      <ul className="mt-8 flex flex-col">
        {articles.map((a) => (
          <li key={a.slug} className="border-t border-[var(--tt-border)] py-5">
            <Link href={`/${lang}/learn/${a.slug}`} className="group no-underline">
              <h2 className="font-display text-lg font-medium text-[var(--tt-text)] group-hover:text-[var(--tt-accent)] transition-colors">
                {a.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
                {a.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
