import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";
import { getArticle } from "@/lib/learn";
import type { Lang } from "@/lib/nav";

export const alt = "Compounder — Learn";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

function clamp(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang: rawLang, slug } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const article = getArticle(slug, lang);

  return ogCard({
    eyebrow: lang === "zh" ? "学习" : "Learn",
    title: article?.title ?? (lang === "zh" ? "学习" : "Learn"),
    subtitle: article ? clamp(article.description, 110) : undefined,
  });
}
