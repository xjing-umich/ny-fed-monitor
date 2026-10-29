import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getFeatured, getLatest, listRest, listArticles, FEATURED_SLUG, ARTICLE_SLUGS, BRAND } from "@/lib/learn";
import { altFor, ogFor, titleBrand, collectionLd, breadcrumbLd } from "@/lib/seo";
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
    title: "Value Investing Guides & 13F Reports",
    description: "Learn to read SEC 13F filings, estimate intrinsic value and assess business quality. Guides and quarterly reports drawn from superinvestor portfolios.",
    eyebrow: "Learn",
    heading: "Learn to read businesses, not tickers",
    intro: "Plain guides to reading businesses the way serious investors do.",
    startHere: "Start here",
    latest: "Latest",
    updated: "Updated",
  },
  zh: {
    title: "价值投资指南与 13F 季报",
    description: "从超级投资者的真实持仓出发，学习读懂 SEC 13F 申报、内在价值、跨基金共识与生意质量，并查看季度持仓报告。",
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
  const title = `${c.title} — ${titleBrand(lang)}`;
  return {
    title,
    description: c.description,
    alternates: altFor(lang, "/learn"),
    // 本路由自带 opengraph-image,不带品牌卡图以免盖掉它。
    ...ogFor({ lang, title, description: c.description, path: localePath(lang, "/learn"), brandImage: false }),
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

  // 结构化数据:页面上的全部文章,按出现顺序(从这里开始 → 最新 → 其余)。
  const path = localePath(lang, "/learn");
  const cards = [featured, latestCard, ...rest].filter((a): a is NonNullable<typeof a> => !!a);
  const listed = cards.filter((a, i) => cards.findIndex((b) => b.slug === a.slug) === i);
  const ld = [
    collectionLd({
      lang,
      name: c.heading,
      description: c.description,
      path,
      items: listed.map((a) => ({ name: a.title, path: localePath(lang, `/learn/${a.slug}`) })),
      dateModified: listed.map((a) => a.updated).filter(Boolean).sort().at(-1),
    }),
    breadcrumbLd(lang, [{ name: c.eyebrow, path }]),
  ];

  return (
    <article className="max-w-[720px] mx-auto py-8 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <PageHeader eyebrow={c.eyebrow} title={c.heading} intro={c.intro} />

      {/* 品牌块:凹陷底色区别于列表(不用彩色左描边) */}
      <section className="mt-8 rounded-md bg-[var(--tt-panel-2)] px-4 py-3">
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
