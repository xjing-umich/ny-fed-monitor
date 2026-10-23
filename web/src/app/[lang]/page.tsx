import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { notableMoves, consensusHeldTop, consensusCount } from "@/lib/aggregations";
import { readStrikeZoneLeaders } from "@/lib/valuation/valuationSnapshot";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
import { investorPath, localePath } from "@/lib/urls";
import { altFor, ogFor } from "@/lib/seo";
import { effectiveMovesPeriod } from "@/lib/freshness/derive";
import { listReportPeriods } from "@/lib/reports/read";
import type { Lang } from "@/lib/nav";
import HeroMasthead from "@/components/home/HeroMasthead";
import { DataStrip } from "@/components/common/DataStrip";
import StepIndex from "@/components/home/StepIndex";
import FoundationsGrid from "@/components/home/FoundationsGrid";
import PhilosophyQuote from "@/components/home/PhilosophyQuote";
import LearnTeaser from "@/components/home/LearnTeaser";
import ClosingCTA from "@/components/home/ClosingCTA";
import { Section } from "@/components/common/Section";

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
      : "Compounder — Smart-money holdings × valuation";
  const description =
    l === "zh"
      ? "追踪巴菲特等顶级投资者的 SEC 13F 季度持仓与跨机构共识，以及个股的保守价值带。数据来源 SEC EDGAR。"
      : "Track top investors' SEC 13F holdings, cross-fund consensus, and a conservative value band per stock. Source: SEC EDGAR.";
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

  // 全部廉价并行读(Supabase / bundled JSON)。无外部 API、无重计算。
  const [idx, moves, heldTop, heldCount, strike, dgs10, reports] = await Promise.all([
    getManagerIndex(),
    notableMoves(6),
    consensusHeldTop(8),
    consensusCount(),
    readStrikeZoneLeaders(6),
    getLatestDgs10(),
    listReportPeriods(),
  ]);

  const topManagers = [...(idx.managers ?? [])].sort((a, b) => b.totalValue - a.totalValue);
  const movesEffective = effectiveMovesPeriod(
    topManagers.map((m) => m.period),
    new Date(),
  );
  // Masthead "as of" 用与下方 moves 面板同一口径(effectiveMovesPeriod),而非单只最大 AUM
  // 基金的最新期。否则 13F 申报季内,头部基金已交新季但整体未过披露门槛时,masthead 会显示
  // "as of Q2" 而 moves 面板显示 "Q1",同屏自相矛盾且夸大覆盖。无数据时回退到头部基金期。
  const period = movesEffective.period ?? topManagers[0]?.period ?? "";
  // 申报季进度行上的“Qn 报告 →”只在该季报告行已存在(已过公开门槛)时出现,否则会链到 404。
  const filingReportExists = !!movesEffective.maxPeriod && reports.some((r) => r.period === movesEffective.maxPeriod);

  // Link the philosophy band's featured quote to Buffett's page if we track him.
  const buffett = topManagers.find((m) => /buffett/i.test(m.person) || /berkshire/i.test(m.name));
  const buffettHref = buffett ? investorPath(lang, buffett.slug) : undefined;

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
        inLanguage: isZh ? "zh-CN" : "en",
        publisher: { "@id": "https://thecompounder.fyi/#org" },
      },
    ],
  };

  return (
    <div className="mx-auto max-w-5xl px-2 pb-16 pt-6 sm:pb-20 sm:pt-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <HeroMasthead
        lang={lang}
        period={period}
        movesPeriod={movesEffective.period ?? ""}
        filing={movesEffective}
        filingReportExists={filingReportExists}
        moves={moves}
        investorCount={topManagers.length}
      />

      {/* Real-data stat bar — carries the 10Y macro signal + real-data proof (own top margin, no wrapper). */}
      <DataStrip lang={lang} consensusCount={heldCount} dgs10={dgs10} />

      {/* Near-full-width to break the max-w-5xl rhythm. */}
      <Section rhythm="xl" className="mx-auto max-w-6xl">
        <StepIndex lang={lang} investors={topManagers.slice(0, 16)} held={heldTop} strike={strike} />
      </Section>

      <Section rhythm="lg">
        <FoundationsGrid lang={lang} />
      </Section>

      <Section rhythm="md">
        <PhilosophyQuote lang={lang} featuredHref={buffettHref} />
      </Section>

      <Section rhythm="md">
        <LearnTeaser lang={lang} />
      </Section>

      <Section rhythm="xl">
        <ClosingCTA lang={lang} />
      </Section>
    </div>
  );
}
