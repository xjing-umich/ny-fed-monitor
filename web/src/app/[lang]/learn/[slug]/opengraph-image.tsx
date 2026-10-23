import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";
import { getArticle } from "@/lib/learn";
import type { Lang } from "@/lib/nav";
import { parseReportSlug } from "@/lib/reports/period";
import { readReportRow } from "@/lib/reports/read";
import { reportTitle, reportDescription } from "@/lib/reports/copy";

export const alt = "Compounder — Learn";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// 静态缓存:否则 [lang] 段下的 OG 图每次被抓取都在函数里重绘 PNG(计入 Vercel Fluid Active CPU)。
export const dynamic = "force-static";
export const revalidate = 604800;

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
  const reportPeriod = !article ? parseReportSlug(slug) : null;
  if (reportPeriod) {
    const row = await readReportRow(reportPeriod);
    return ogCard({
      eyebrow: lang === "zh" ? "季度报告" : "Quarterly report",
      title: reportTitle(reportPeriod, lang),
      subtitle: row ? clamp(reportDescription(row.payload, row.status, lang), 110) : undefined,
    });
  }

  return ogCard({
    eyebrow: lang === "zh" ? "学习" : "Learn",
    title: article?.title ?? (lang === "zh" ? "学习" : "Learn"),
    subtitle: article ? clamp(article.description, 110) : undefined,
  });
}
