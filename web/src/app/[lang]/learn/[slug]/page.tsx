import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getArticle, ARTICLE_SLUGS } from "@/lib/learn";
import { investorPath, stockPath, absoluteUrl, localePath } from "@/lib/urls";
import { altFor } from "@/lib/seo";
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
    alternates: altFor(lang, `/learn/${slug}`),
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
    image: `${absoluteUrl(localePath(lang, `/learn/${slug}`))}/opengraph-image`,
    datePublished: article.updated,
    dateModified: article.updated,
    inLanguage: lang === "zh" ? "zh-CN" : "en",
    author: { "@type": "Organization", name: "Compounder", url: "https://thecompounder.fyi" },
    publisher: {
      "@type": "Organization",
      name: "Compounder",
      logo: { "@type": "ImageObject", url: "https://thecompounder.fyi/icon.png" },
    },
    mainEntityOfPage: absoluteUrl(localePath(lang, `/learn/${slug}`)),
  };

  // Breadcrumb — matches the convention on stock/investor detail pages and
  // surfaces a "Learn › {article}" trail in search results.
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: lang === "zh" ? "学习" : "Learn",
        item: absoluteUrl(localePath(lang, `/learn`)),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: article.title,
        item: absoluteUrl(localePath(lang, `/learn/${slug}`)),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <div className="max-w-[720px] mx-auto">
        <Link
          href={`/${lang}/learn`}
          className="text-xs text-[var(--tt-faint)] hover:text-[var(--tt-text)] transition-colors no-underline"
        >
          {backLabel}
        </Link>
      </div>
      <ProseDoc doc={article} eyebrow={lang === "zh" ? "学习" : "Learn"} updated={article.updated} updatedLabel={updatedLabel} />

      {/* 文中点名实体的内链(SEO 内链: 把文章权重传给对应实体页) */}
      {article.related && article.related.length > 0 && (
        <nav className="mx-auto mt-8 max-w-[720px] border-t border-[var(--tt-border)] pt-5">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--tt-accent)]">
            {lang === "zh" ? "相关" : "Related"}
          </span>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {article.related.map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <Link
                  href={r.kind === "investor" ? investorPath(lang, r.id) : stockPath(lang, r.id)}
                  className="text-sm text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]"
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
