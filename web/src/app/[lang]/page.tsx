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
import ValuationShowcase from "@/components/home/ValuationShowcase";
import SectionReveal from "@/components/home/SectionReveal";

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

      {/* Pillar ① — Who's buying (Investors) */}
      {topInvestors.length > 0 && (
        <SectionReveal>
          <section className="mt-20">
            <BlockHeading
              title={isZh ? "投资者" : "Investors"}
              thesis={isZh ? "按管理规模排序的顶级 13F 申报机构。" : "Top 13F filers, ranked by reported portfolio value."}
              href={`/${lang}/investors`}
              isZh={isZh}
            />
            <table className="mt-4 w-full border-collapse text-sm">
              <tbody>
                {topInvestors.map((m) => (
                  <tr key={m.cik} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
                    <td className="py-2.5 pr-4">
                      <Link href={investorPath(lang, m.slug)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                        {m.person}
                      </Link>
                      <span className="ml-2 truncate text-[11px] text-[var(--tt-faint)]">{cleanIssuer(m.topHolding)}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">{m.holdingCount}</td>
                    <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-text)]">{formatUSD(m.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </SectionReveal>
      )}

      {/* Pillar ② — What they own (Consensus holdings) */}
      {held.length > 0 && (
        <SectionReveal>
          <section className="mt-20">
            <BlockHeading
              title={isZh ? "共识持仓" : "Consensus holdings"}
              thesis={isZh ? "多位投资者共同持有的高共识标的。" : "High-conviction names held across multiple investors."}
              href={`/${lang}/investors/consensus`}
              isZh={isZh}
            />
            <table className="mt-4 w-full border-collapse text-sm">
              <tbody>
                {held.map((row) => (
                  <tr key={row.cusip} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
                    <td className="py-2.5 pr-4">
                      <Link href={stockPath(lang, row.cusip)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                        <EntityName issuer={row.issuer} ticker={row.cusip} />
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                      {isZh ? `${row.holderCount} 位` : `${row.holderCount}`}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">
                      {formatUSD(row.totalValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </SectionReveal>
      )}

      {/* Pillar ③ — What it's worth (Valuation) */}
      <SectionReveal>
        <ValuationShowcase lang={lang} />
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

function BlockHeading({ title, thesis, href, isZh }: { title: string; thesis: string; href: string; isZh: boolean }) {
  return (
    <div className="border-b border-[var(--tt-border)] pb-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">{title}</h2>
        <Link href={href} className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline">
          {isZh ? "查看全部 →" : "View all →"}
        </Link>
      </div>
      <p className="mt-1.5 text-xs text-[var(--tt-muted)]">{thesis}</p>
    </div>
  );
}
