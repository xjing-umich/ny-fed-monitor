import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld, notableMoves } from "@/lib/aggregations";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { EntityName } from "@/components/common/EntityName";
import { investorPath, stockPath } from "@/lib/urls";
import type { Lang } from "@/lib/nav";
import HeroMasthead from "@/components/home/HeroMasthead";
import TrackedInvestorsWall from "@/components/home/TrackedInvestorsWall";
import SectionReveal from "@/components/home/SectionReveal";
import FeatureRow from "@/components/home/FeatureRow";
import ValueBandCard from "@/components/home/ValueBandCard";
import FoundationsGrid from "@/components/home/FoundationsGrid";
import PhilosophyQuote from "@/components/home/PhilosophyQuote";
import LearnTeaser from "@/components/home/LearnTeaser";
import ClosingCTA from "@/components/home/ClosingCTA";

// 13F 季度更、价格日更:日级 ISR 已足够新鲜,避免每小时重验反复读库(egress)。
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const l = lang === "en" ? "en" : "zh";
  const title =
    l === "zh"
      ? "Compounder · 复利 — 谁在买 × 值不值 × 大环境"
      : "Compounder — Who's buying × Worth it × The big picture";
  const description =
    l === "zh"
      ? "一处看懂三件事：顶级投资者的 SEC 13F 持仓（谁在买）、个股的保守价值带（值不值）、资金与利率的大环境。数据来自 SEC EDGAR 与公开市场。"
      : "Three things in one place: top investors' SEC 13F holdings, a conservative value band per stock, and the liquidity-and-rates backdrop. Sourced from SEC EDGAR and public markets.";
  return {
    title,
    description,
    alternates: { canonical: `/${l}`, languages: { en: "/en", "zh-CN": "/zh", "x-default": "/en" } },
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

  // 全部廉价并行读(Supabase / 快照 / bundled JSON)。无外部 API、无重计算。
  const [idx, moves, consensus, strike, macro, dgs10] = await Promise.all([
    getManagerIndex(),
    notableMoves(3),
    consensusHeld(),
    readStrikeZoneLeaders(3),
    readMacroSnapshot(),
    getLatestDgs10(),
  ]);

  const managers = idx.managers ?? [];
  const period = [...managers].sort((a, b) => b.totalValue - a.totalValue)[0]?.period ?? "";
  const macroSummary = macro ? buildMacroSummary(macro) : null;

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
          ? "一处看懂超级投资者 13F 持仓、个股保守估值与资金利率大环境。"
          : "Smart-money 13F holdings, conservative single-stock valuation, and the liquidity-and-rates backdrop in one place.",
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

      <HeroMasthead lang={lang} period={period} moves={moves} />

      {topManagers.length > 0 && (
        <SectionReveal>
          <TrackedInvestorsWall lang={lang} managers={topInvestors} total={topManagers.length} />
        </SectionReveal>
      )}

      {/* Feature row ① — Investors */}
      {topInvestors.length > 0 && (
        <SectionReveal>
          <FeatureRow
            eyebrow={isZh ? "13F 追踪" : "13F tracking"}
            title={isZh ? "跟随聪明钱，逐季追踪" : "Follow the smart money, quarter by quarter"}
            body={isZh
              ? "追踪 70+ 位传奇投资者的 SEC 13F 季度持仓——谁在建仓、谁在清仓，逐季看清。"
              : "Track 70+ legendary investors' SEC 13F filings — who's building a position, who's getting out, quarter over quarter."}
            ctaLabel={isZh ? "浏览全部投资者 →" : "Browse all investors →"}
            href={`/${lang}/investors`}
          >
            <div className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {topInvestors.slice(0, 6).map((m) => (
                    <tr key={m.cik} className="border-b border-[var(--tt-border)] last:border-0">
                      <td className="py-2 pr-4">
                        <Link href={investorPath(lang, m.slug)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                          {m.person}
                        </Link>
                      </td>
                      <td className="py-2 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">{formatUSD(m.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FeatureRow>
        </SectionReveal>
      )}

      {/* Feature row ② — Consensus */}
      {held.length > 0 && (
        <SectionReveal>
          <FeatureRow
            reverse
            eyebrow={isZh ? "跨基金共识" : "Cross-fund consensus"}
            title={isZh ? "看共识如何形成" : "See the consensus form"}
            body={isZh
              ? "当多位顶级投资者持有同一只股票，那是值得注意的信号。我们跨基金聚合，告诉你有几位在持有。"
              : "When many of the best investors hold the same stock, that's a signal worth noting. We aggregate across funds so you can see how many own it."}
            ctaLabel={isZh ? "查看共识持仓 →" : "View consensus holdings →"}
            href={`/${lang}/investors/consensus`}
          >
            <div className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {held.slice(0, 6).map((row) => (
                    <tr key={row.cusip} className="border-b border-[var(--tt-border)] last:border-0">
                      <td className="py-2 pr-4">
                        <Link href={stockPath(lang, row.cusip)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                          <EntityName issuer={row.issuer} ticker={row.cusip} />
                        </Link>
                      </td>
                      <td className="py-2 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                        {isZh ? `${row.holderCount} 位持有` : `${row.holderCount} hold`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FeatureRow>
        </SectionReveal>
      )}

      {/* Feature row ③ — Valuation (id anchor for hero link); not reversed → row rhythm right/left/right */}
      <div id="valuation" className="scroll-mt-24">
        <SectionReveal>
          <FeatureRow
            eyebrow={isZh ? "估值" : "Valuation"}
            title={isZh ? "知道它到底值多少" : "Know what it's worth"}
            body={isZh
              ? "持仓只是起点。每只股票都用三套保守方法估值——Buffett 所有者收益 DCF、Greenwald 盈利能力价值、资产重置价值——只为已证实的价值付费。"
              : "Holdings are only the start. Every stock is valued three conservative ways — Buffett owner-earnings DCF, Greenwald earnings-power value, asset reproduction value — so you pay only for proven value."}
            ctaLabel={isZh ? "看个股估值 →" : "See per-stock valuation →"}
            href={`/${lang}/stocks`}
          >
            <ValueBandCard lang={lang} />
          </FeatureRow>
        </SectionReveal>
      </div>

      <SectionReveal>
        <FoundationsGrid lang={lang} />
      </SectionReveal>

      <SectionReveal>
        <PhilosophyQuote lang={lang} />
      </SectionReveal>

      <SectionReveal>
        <LearnTeaser lang={lang} />
      </SectionReveal>

      <SectionReveal>
        <ClosingCTA lang={lang} />
      </SectionReveal>

      {/* Trust strip + demoted macro (newsletter lives globally in the footer) */}
      <section className="mt-16 border-t border-[var(--tt-border)] pt-6">
        <p className="font-mono text-[11px] tracking-[0.04em] text-[var(--tt-faint)]">
          {isZh
            ? "来源：SEC EDGAR 13F 季度报告 · 45 天延迟 · 不荐股、不预测。"
            : "Source: SEC EDGAR 13F quarterly filings · 45-day lag · No recommendations, no forecasts."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href={`/${lang}/macro`} className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline">
            {isZh ? "宏观流动性 →" : "Macro & liquidity →"}
          </Link>
        </div>
      </section>
    </div>
  );
}
