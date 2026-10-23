import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getFeatured, getLatest, listRest, listArticles, FEATURED_SLUG, ARTICLE_SLUGS, BRAND } from "@/lib/learn";
import { altFor, ogFor } from "@/lib/seo";
import { localePath } from "@/lib/urls";
import PageHeader from "@/components/common/PageHeader";
import { listReportPeriods, readReportRow } from "@/lib/reports/read";
import { reportSlug } from "@/lib/reports/period";
import { reportTitle, reportDescription } from "@/lib/reports/copy";

// 「最新」位可能是数据库里的季度报告 → 周级 ISR;报告刷新由 REPORT_PATHS 按需重生成。
export const revalidate = 604800;

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
  const title = `${c.title} — Compounder`;
  return {
    title,
    description: c.intro,
    alternates: altFor(lang, "/learn"),
    // 本路由自带 opengraph-image,不带品牌卡图以免盖掉它。
    ...ogFor({ lang, title, description: c.intro, path: localePath(lang, "/learn"), brandImage: false }),
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
  // 最新季度报告占据「最新」位;无报告(或无库)时回退到手写文章。读库失败会 throw,不缓存假空态。
  // 已有同 slug 手写文章的季度(如 Q1/Q2 2026)由手写版占位,不让生成报告的标题配上手写文章的链接。
  const [newestReport] = (await listReportPeriods()).filter((r) => !ARTICLE_SLUGS.includes(reportSlug(r.period)));
  const reportRow = newestReport ? await readReportRow(newestReport.period) : null;
  const latestCard = reportRow
    ? {
        slug: reportSlug(reportRow.period),
        title: reportTitle(reportRow.period, lang),
        description: reportDescription(reportRow.payload, reportRow.status, lang),
        updated: reportRow.generatedAt.slice(0, 10),
      }
    : latest;
  // 报告占「最新」位时,原 latest 手写文章回到列表里。
  const rest = reportRow
    ? listArticles(lang).filter((a) => a.slug !== FEATURED_SLUG)
    : listRest(lang);

  return (
    <article className="max-w-[720px] mx-auto py-8 sm:py-10">
      <PageHeader eyebrow={c.eyebrow} title={c.heading} intro={c.intro} />

      {/* 品牌块:理念常驻凸显,accent 左描边区别于列表 */}
      <section className="mt-8 border-l-2 border-[var(--tt-accent)] pl-4">
        <p className="text-sm leading-relaxed text-[var(--tt-muted)]">{brand.body}</p>
        <Link
          href={localePath(lang, "/about")}
          className="mt-2 inline-block font-data text-xs text-[var(--tt-accent)] no-underline hover:underline max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center"
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
          <span className="tt-eyebrow">
            {c.startHere}
          </span>
          <h2 className="mt-2 text-balance text-2xl font-medium leading-tight text-[var(--tt-text)] group-hover:text-[var(--tt-accent)] transition-colors">
            {featured.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
            {featured.description}
          </p>
        </Link>
      ) : null}

      {/* 最新:按 updated 自动置顶 */}
      {latestCard ? (
        <Link
          href={localePath(lang, `/learn/${latestCard.slug}`)}
          className="group mt-6 block border-t border-[var(--tt-border)] pt-5 no-underline"
        >
          <span className="tt-eyebrow">
            {c.latest}
          </span>
          <h2 className="mt-2 text-balance text-lg font-medium text-[var(--tt-text)] group-hover:text-[var(--tt-accent)] transition-colors">
            {latestCard.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
            {latestCard.description}
          </p>
          {latestCard.updated ? (
            <p className="mt-2 font-data text-xs text-[var(--tt-faint)]">
              {c.updated} {latestCard.updated}
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
                <h2 className="text-balance text-lg font-medium text-[var(--tt-text)] group-hover:text-[var(--tt-accent)] transition-colors">
                  {a.title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
                  {a.description}
                </p>
                {a.updated ? (
                  <p className="mt-2 font-data text-xs text-[var(--tt-faint)]">
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
