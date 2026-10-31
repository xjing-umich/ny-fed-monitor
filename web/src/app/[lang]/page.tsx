import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { localePath, HTML_LANG } from "@/lib/urls";
import { altFor, ogFor } from "@/lib/seo";
import { effectiveMovesPeriod } from "@/lib/freshness/derive";
import type { Lang } from "@/lib/nav";
import { readSearchIndex } from "@/lib/home/searchIndex";
import { readCompanyExamples } from "@/lib/home/readCompanyExamples";
import LandingPage from "@/components/home/landing/LandingPage";

// 13F 季度更、价格日更;首页按列表页节奏重验。
// 周期按 Vercel Hobby 额度定(ISR Writes 按 8KB 计、全站 ~2200 页):列表页 3 天、详情页 7 天;
// 数据批量更新后的整站刷新由 workflow 调 /api/revalidate 承担(13F 有新 filing 时 + 估值每周六)。
export const revalidate = 259200;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const l = lang === "en" ? "en" : "zh";
  const title =
    l === "zh"
      ? "Compounder · 复利 — 超级投资者持仓 × 个股估值"
      : "Superinvestor 13F Holdings & Valuation — Compounder";
  const description =
    l === "zh"
      ? "追踪巴菲特等投资者的 SEC 13F 季末持仓与共同持股。财报资料足够时，提供本站模型估算的个股价值区间及假设。持仓来源 SEC EDGAR。"
      : "Track investors' SEC 13F quarter-end holdings and shared positions. Where financial data supports an estimate, see stock value ranges and assumptions from our models. Holdings source: SEC EDGAR.";
  return {
    title,
    description,
    alternates: altFor(l, ""),
    ...ogFor({
      lang: l,
      title,
      description,
      path: localePath(l, ""),
    }),
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";

  const [idx, index, examples] = await Promise.all([
    getManagerIndex().catch(() => ({ managers: [] })),
    readSearchIndex(lang),
    readCompanyExamples(lang),
  ]);
  const filing = effectiveMovesPeriod(
    idx.managers.map((m) => m.period),
    new Date(),
  );

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://thecompounder.fyi/#org",
        name: "Compounder",
        alternateName: "复利",
        url: "https://thecompounder.fyi",
        logo: "https://thecompounder.fyi/icon.png",
        image: "https://thecompounder.fyi/icon.png",
        description: isZh
          ? "聚合超级投资者 13F 持仓与个股保守估值。"
          : "Smart-money 13F holdings and conservative single-stock valuation.",
      },
      {
        "@type": "WebSite",
        "@id": "https://thecompounder.fyi/#website",
        url: "https://thecompounder.fyi",
        name: "Compounder",
        alternateName: "复利",
        inLanguage: HTML_LANG[lang],
        publisher: { "@id": "https://thecompounder.fyi/#org" },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <LandingPage
        lang={lang}
        index={index}
        examples={examples}
        filing={filing}
      />
    </>
  );
}
