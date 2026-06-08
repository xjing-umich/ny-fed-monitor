import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld, notableMoves, type MoveRow } from "@/lib/aggregations";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { EntityName } from "@/components/common/EntityName";
import { investorPath, stockPath } from "@/lib/urls";
import type { Lang } from "@/lib/nav";
import MoveTag from "@/components/shell/MoveTag";
import { FreshnessDot } from "@/components/entity/FreshnessDot";
import { filingFreshness } from "@/lib/freshness/derive";

// 13F data updates quarterly; revalidate hourly so the page is statically cached
// and served from the CDN instead of blocking on per-request work.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const l = lang === "en" ? "en" : "zh";
  const title =
    l === "zh"
      ? "Compounder · 复利 — 超级投资者持仓 × 个股估值 × 宏观"
      : "Compounder — Smart-money holdings × valuation × macro";
  const description =
    l === "zh"
      ? "追踪巴菲特等顶级投资者的 SEC 13F 季度持仓、跨机构共识与宏观流动性信号。数据来源 SEC EDGAR / NY Fed。"
      : "Track top investors' SEC 13F holdings, cross-fund consensus, and macro funding signals. Sources: SEC EDGAR / NY Fed.";
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

  // Two cheap reads in parallel (Supabase or bundled JSON). No external APIs.
  const [idx, moves, held] = await Promise.all([
    getManagerIndex(),
    notableMoves(6),
    mostHeld(8),
  ]);

  const topManagers = [...(idx.managers ?? [])].sort((a, b) => b.totalValue - a.totalValue);
  const period = topManagers[0]?.period ?? "";
  const topInvestors = topManagers.slice(0, 8);

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
          ? "聚合超级投资者 13F 持仓、个股估值与宏观流动性。"
          : "Smart-money 13F holdings, single-stock valuation, and the macro funding backdrop.",
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
    <div className="mx-auto max-w-5xl px-2 pb-10 pt-1 sm:pb-12 sm:pt-2">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      {/* Value-prop tagline — site positioning; doubles as the page h1 */}
      <h1 className="font-display text-lg font-medium leading-snug tracking-tight text-[var(--tt-text)] sm:text-xl">
        {isZh ? "与最有耐心的投资者同行。" : "Walk with the most patient investors."}
        <span className="text-[var(--tt-muted)]">
          {isZh ? " 追踪他们的 13F 持仓,看懂复利。" : " Track their 13F holdings and how compounding works."}
        </span>
      </h1>

      {/* Dateline (replaces hero) — subtle, low-profile */}
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-[0.04em] text-[var(--tt-faint)] sm:mt-3">
        <FreshnessDot status={filingFreshness(period || null, new Date())} lang={lang} />
        {isZh
          ? `截至 ${period} · ${topManagers.length} 位投资者 · SEC 13F · 45 天延迟`
          : `As of ${period} · ${topManagers.length} investors · SEC 13F · 45-day lag`}
      </p>

      {/* Notable moves — lead, with change-type tags */}
      {(moves.mostBought.length > 0 || moves.mostSold.length > 0) && (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">
            {isZh ? "本季显著动向" : "Notable moves this quarter"}
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-8 border-t border-[var(--tt-border)] pt-5 md:grid-cols-2">
            {moves.mostBought.length > 0 && (
              <MoveColumn lang={lang} title={isZh ? "本季最多人增持" : "Most bought"} rows={moves.mostBought} />
            )}
            {moves.mostSold.length > 0 && (
              <MoveColumn lang={lang} title={isZh ? "本季最多人减持" : "Most sold"} rows={moves.mostSold} />
            )}
          </div>
        </section>
      )}

      {/* Consensus holdings (stacked, mobile-first) */}
      {held.length > 0 && (
        <section className="mt-12">
          <BlockHeading title={isZh ? "共识持仓" : "Consensus holdings"} href={`/${lang}/investors/consensus`} isZh={isZh} />
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
      )}

      {/* Investors (compact; detail pages stay rich) */}
      {topInvestors.length > 0 && (
        <section className="mt-12">
          <BlockHeading title={isZh ? "投资者" : "Investors"} href={`/${lang}/investors`} isZh={isZh} />
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
      )}

      {/* Macro / Liquidity — de-emphasized to a single link */}
      <section className="mt-12 border-t border-[var(--tt-border)] pt-5">
        <Link href={`/${lang}/macro`} className="group flex items-baseline justify-between no-underline">
          <span className="font-display text-base font-medium text-[var(--tt-text)] transition-colors group-hover:text-[var(--tt-accent)]">
            {isZh ? "宏观 / 流动性" : "Macro / Liquidity"}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] group-hover:underline">
            {isZh ? "资金面与流动性信号 →" : "Funding & liquidity signals →"}
          </span>
        </Link>
      </section>

      <p className="mt-12 border-t border-[var(--tt-border)] pt-6 text-xs text-[var(--tt-faint)]">
        {isZh
          ? "数据来源：SEC EDGAR 13F 季度报告、纽约联储。持仓数据存在 45 天延迟，仅供参考。"
          : "Sources: SEC EDGAR 13F quarterly filings, NY Fed. Holdings data has a 45-day lag and is for reference only."}
      </p>
    </div>
  );
}

function BlockHeading({ title, href, isZh }: { title: string; href: string; isZh: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--tt-border)] pb-2">
      <h2 className="font-display text-xl font-medium tracking-tight text-[var(--tt-text)]">{title}</h2>
      <Link href={href} className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline">
        {isZh ? "查看全部 →" : "View all →"}
      </Link>
    </div>
  );
}

function MoveColumn({ lang, title, rows }: { lang: Lang; title: string; rows: MoveRow[] }) {
  const isZh = lang === "zh";
  return (
    <div>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--tt-muted)]">{title}</h3>
      <table className="mt-3 w-full border-collapse text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.cusip} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
              <td className="py-2.5 pr-3">
                <span className="flex items-center gap-2">
                  <MoveTag kind={row.dominantKind} />
                  <Link href={stockPath(lang, row.cusip)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                    <EntityName issuer={row.issuer} ticker={row.cusip} />
                  </Link>
                </span>
              </td>
              <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                {isZh ? `${row.count} 位` : `${row.count} inv`}
              </td>
              <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                {formatUSD(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
