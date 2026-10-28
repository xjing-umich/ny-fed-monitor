import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { getArticle, ARTICLE_SLUGS } from "@/lib/learn";
import { investorPath, stockPath, absoluteUrl, localePath, HTML_LANG } from "@/lib/urls";
import { altFor, ogFor, breadcrumbLd, titleBrand } from "@/lib/seo";
import { quarterLabel } from "@/lib/freshness/derive";
import ProseDoc from "@/components/legal/ProseDoc";
import { parseReportSlug, reportLastModified, reportSlug } from "@/lib/reports/period";
import { readReportRow, listReportPeriods } from "@/lib/reports/read";
import { reportTitle, reportDescription } from "@/lib/reports/copy";
import ReportArticle from "@/components/reports/ReportArticle";

// 报告页读库:ingest / 定稿后由 /api/revalidate?source=report 按需刷新;7 天兜底。
export const revalidate = 604800;

export async function generateStaticParams() {
  const reports = (await listReportPeriods()).map((r) => reportSlug(r.period)).filter((s) => !ARTICLE_SLUGS.includes(s));
  return [...ARTICLE_SLUGS, ...reports].flatMap((slug) => [
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
  const reportPeriod = !getArticle(slug, lang) ? parseReportSlug(slug) : null;
  if (reportPeriod) {
    const row = await readReportRow(reportPeriod);
    if (!row) return {};
    const title = `${reportTitle(row.period, lang)} — ${titleBrand(lang)}`;
    const description = reportDescription(row.payload, row.status, lang);
    return {
      title,
      description,
      alternates: altFor(lang, `/learn/${slug}`),
      // 不设 openGraph 会沿用布局的站点通用标题/摘要,分享卡片里看不到报告结论。
      // 本路由自带 opengraph-image(结论句卡),不带品牌卡图以免盖掉它。
      ...ogFor({ lang, title, description, path: localePath(lang, `/learn/${slug}`), type: "article", brandImage: false }),
    };
  }
  const article = getArticle(slug, lang);
  if (!article) return {};
  const title = `${article.title} — ${titleBrand(lang)}`;
  return {
    title,
    description: article.description,
    alternates: altFor(lang, `/learn/${slug}`),
    // 本路由自带 opengraph-image(文章卡),不带品牌卡图以免盖掉它。
    ...ogFor({ lang, title, description: article.description, path: localePath(lang, `/learn/${slug}`), type: "article", brandImage: false }),
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang: rawLang, slug } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const reportPeriod = !getArticle(slug, lang) ? parseReportSlug(slug) : null;
  if (reportPeriod) {
    const row = await readReportRow(reportPeriod);
    if (!row) notFound();
    const url = absoluteUrl(localePath(lang, `/learn/${slug}`));
    const reportJsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: reportTitle(row.period, lang),
      description: reportDescription(row.payload, row.status, lang),
      image: `${url}/opengraph-image`,
      datePublished: row.firstLiveAt,
      dateModified: reportLastModified(row.generatedAt, row.finalizedAt),
      inLanguage: HTML_LANG[lang],
      author: { "@type": "Organization", name: "Compounder", url: "https://thecompounder.fyi" },
      publisher: { "@type": "Organization", name: "Compounder", logo: { "@type": "ImageObject", url: "https://thecompounder.fyi/icon.png" } },
      mainEntityOfPage: url,
    };
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(reportJsonLd) }} />
        <ReportArticle row={row} lang={lang} />
      </>
    );
  }

  const article = getArticle(slug, lang);
  if (!article) notFound();

  const updatedLabel = lang === "zh" ? "最后更新" : "Last updated";

  // 季度快照文章:顶部注明数据季度与写作日期,并指向实时榜单,避免过季数字被当成现状引用。
  const snapshotNotice = article.snapshotPeriod ? (
    <SnapshotNotice lang={lang} period={article.snapshotPeriod} written={article.updated} note={article.snapshotNote} />
  ) : null;
  const backLabel = lang === "zh" ? "← 返回学习" : "← Back to Learn";

  // Inline entity tokens in article prose — [[investor:slug|Label]] / [[stock:TICKER|Label]] —
  // render as internal links to the investor/stock pages. Passes article authority to those
  // pages (SEO internal linking) and gives the reader a path from the idea into the live data.
  const renderParagraph = (text: string): ReactNode => {
    const token = /\[\[(investor|stock):([^|\]]+)\|([^\]]+)\]\]/g;
    const nodes: ReactNode[] = [];
    let last = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = token.exec(text)) !== null) {
      if (m.index > last) nodes.push(text.slice(last, m.index));
      const [, kind, id, label] = m;
      const href = kind === "investor" ? investorPath(lang, id) : stockPath(lang, id);
      nodes.push(
        <Link
          key={`ent-${key++}`}
          href={href}
          className="text-[var(--tt-text)] underline decoration-[var(--tt-faint)] underline-offset-2 transition-colors hover:text-[var(--tt-accent)] hover:decoration-[var(--tt-accent)]"
        >
          {label}
        </Link>,
      );
      last = m.index + m[0].length;
    }
    if (nodes.length === 0) return text;
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
  };

  // Article structured data — helps Google/AI engines attribute and cite the piece.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    image: `${absoluteUrl(localePath(lang, `/learn/${slug}`))}/opengraph-image`,
    datePublished: article.updated,
    dateModified: article.updated,
    inLanguage: HTML_LANG[lang],
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
  const breadcrumb = breadcrumbLd(lang, [
    { name: lang === "zh" ? "学习" : "Learn", path: localePath(lang, "/learn") },
    { name: article.title, path: localePath(lang, `/learn/${slug}`) },
  ]);

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
          href={localePath(lang, "/learn")}
          className="inline-block text-xs text-[var(--tt-muted)] hover:text-[var(--tt-text)] transition-colors no-underline max-sm:flex max-sm:min-h-[44px] max-sm:items-center"
        >
          {backLabel}
        </Link>
      </div>
      <ProseDoc doc={article} eyebrow={lang === "zh" ? "学习" : "Learn"} updated={article.updated} updatedLabel={updatedLabel} renderParagraph={renderParagraph} notice={snapshotNotice} />

      {/* 文中点名实体的内链(SEO 内链: 把文章权重传给对应实体页) */}
      {article.related && article.related.length > 0 && (
        <nav className="mx-auto mt-8 max-w-[720px] border-t border-[var(--tt-border)] pt-5">
          <span className="tt-eyebrow">
            {lang === "zh" ? "相关" : "Related"}
          </span>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {article.related.map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <Link
                  href={r.kind === "investor" ? investorPath(lang, r.id) : stockPath(lang, r.id)}
                  className="text-sm text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
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

function SnapshotNotice({ lang, period, written, note }: { lang: Lang; period: string; written: string; note?: string }) {
  const q = quarterLabel(period) || period;
  const links = [
    { path: "/investors/consensus", en: "Consensus", zh: "共识持仓" },
    { path: "/investors/buys", en: "Top buys", zh: "最多买入" },
    { path: "/investors/sells", en: "Top sells", zh: "最多卖出" },
  ];
  return (
    <aside className="mt-6 border-l-2 border-[var(--tt-accent)] pl-4 text-sm leading-relaxed text-[var(--tt-muted)]">
      <p>
        {lang === "zh"
          ? `季度快照：${q} 的 13F 申报（截至 ${period}），写于 ${written}。文中的家数指当时追踪的投资人。最新一季见：`
          : `Snapshot: ${q} 13F filings (quarter ended ${period}), written ${written}. Counts refer to the investors Compounder tracked at the time. For the latest quarter: `}
        {links.map((l, i) => (
          <span key={l.path}>
            {i > 0 ? " · " : ""}
            <Link
              href={localePath(lang, l.path)}
              className="text-[var(--tt-text)] underline decoration-[var(--tt-faint)] underline-offset-2 hover:text-[var(--tt-accent)]"
            >
              {lang === "zh" ? l.zh : l.en}
            </Link>
          </span>
        ))}
        {lang === "zh" ? "。" : "."}
      </p>
      {note && <p className="mt-1">{note}</p>}
    </aside>
  );
}
