import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getArticle, ARTICLE_SLUGS } from "@/lib/learn";
import ProseDoc from "@/components/legal/ProseDoc";

export function generateStaticParams() {
  return ARTICLE_SLUGS.flatMap((slug) => [
    { lang: "en", slug },
    { lang: "zh", slug },
  ]);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, slug } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const article = getArticle(slug, lang);
  if (!article) return {};
  return {
    title: `${article.title} — Compounder`,
    description: article.description,
    alternates: {
      canonical: `/${lang}/learn/${slug}`,
      languages: {
        en: `/en/learn/${slug}`,
        "zh-CN": `/zh/learn/${slug}`,
        "x-default": `/en/learn/${slug}`,
      },
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang: rawLang, slug } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const article = getArticle(slug, lang);
  if (!article) notFound();

  const updatedLabel = lang === "zh" ? "最后更新" : "Last updated";
  const backLabel = lang === "zh" ? "← 返回 学习" : "← Back to Learn";

  // Article structured data — helps Google/AI engines attribute and cite the piece.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.updated,
    dateModified: article.updated,
    inLanguage: lang === "zh" ? "zh-CN" : "en",
    author: { "@type": "Organization", name: "Compounder" },
    publisher: { "@type": "Organization", name: "Compounder" },
    mainEntityOfPage: `https://thecompounder.fyi/${lang}/learn/${slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-[720px] mx-auto">
        <Link
          href={`/${lang}/learn`}
          className="text-xs text-[var(--tt-faint)] hover:text-[var(--tt-text)] transition-colors no-underline"
        >
          {backLabel}
        </Link>
      </div>
      <ProseDoc doc={article} updated={article.updated} updatedLabel={updatedLabel} />
    </>
  );
}
