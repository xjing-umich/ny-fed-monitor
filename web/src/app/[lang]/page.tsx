import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { notableMoves, consensusHeld } from "@/lib/aggregations";
import { readStrikeZoneLeaders } from "@/lib/valuation/valuationSnapshot";
import { readMacroSnapshot } from "@/lib/macroSnapshot";
import { buildMacroSummary } from "@/lib/macroResearch";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
import { formatUSD } from "@/lib/format";
import { EntityName } from "@/components/common/EntityName";
import { stockPath } from "@/lib/urls";
import MoveTag from "@/components/shell/MoveTag";
import type { Lang } from "@/lib/nav";
import { HomeHero } from "@/components/home/HomeHero";
import { DataStrip } from "@/components/home/DataStrip";
import { LegBand } from "@/components/home/LegBand";

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
    <div className="mx-auto max-w-5xl px-2 pb-10 pt-1 sm:pb-12 sm:pt-2">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <HomeHero lang={lang} />

      <DataStrip
        lang={lang}
        period={period}
        investorCount={managers.length}
        consensusCount={consensus.length}
        dgs10={dgs10}
      />

      {/* 谁在买 · Superinvestors */}
      <LegBand
        eyebrow={isZh ? "谁在买" : "Superinvestors"}
        title={isZh ? "本季最多人增持" : "Most bought this quarter"}
        description={
          isZh
            ? "顶级投资者本季新建或加仓最多的标的，按持有人数排序。数据来自 SEC 13F。"
            : "Where top investors opened or added the most this quarter, by holder count. From SEC 13F filings."
        }
        href={`/${lang}/investors`}
        viewAll={isZh ? "查看全部 →" : "View all →"}
      >
        {moves.mostBought.length > 0 ? (
          <table className="w-full border-collapse text-sm">
            <tbody>
              {moves.mostBought.map((row) => (
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
        ) : (
          <p className="text-sm text-[var(--tt-faint)]">{isZh ? "本季暂无显著动向。" : "No notable moves this quarter."}</p>
        )}
      </LegBand>

      {/* 值不值 · Valuation —— strike-zone 命中优先;空快照回退共识股(中性标题) */}
      <LegBand
        eyebrow={isZh ? "值不值" : "Valuation"}
        title={
          strike.leaders.length > 0
            ? isZh
              ? `现在 ${strike.total} 只落在 strike zone`
              : `${strike.total} stocks in the strike zone now`
            : isZh
              ? "机构最集中的持仓"
              : "Most widely held"
        }
        description={
          strike.leaders.length > 0
            ? isZh
              ? "现价低于我们保守价值带的标的，按安全边际排序。位置观察，非买卖建议。"
              : "Stocks trading below our conservative value band, by margin of safety. A position observation, not advice."
            : isZh
              ? "被最多超级投资者共同持有的标的。估值快照刷新中。"
              : "Stocks held by the most superinvestors. Valuation snapshot refreshing."
        }
        href={`/${lang}/stocks`}
        viewAll={isZh ? "查看全部 →" : "View all →"}
      >
        {strike.leaders.length > 0 ? (
          <table className="w-full border-collapse text-sm">
            <tbody>
              {strike.leaders.map((row) => (
                <tr key={row.ticker} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
                  <td className="py-2.5 pr-3">
                    <Link href={stockPath(lang, row.ticker)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                      <span className="font-mono">{row.ticker}</span>
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                    ${Math.round(row.rangeLo).toLocaleString()}–${Math.round(row.rangeHi).toLocaleString()}/sh
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-positive)] whitespace-nowrap">
                    {row.marginPct != null && row.marginPct > 0 ? `−${Math.round(row.marginPct * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : consensus.length > 0 ? (
          <table className="w-full border-collapse text-sm">
            <tbody>
              {consensus.slice(0, 3).map((row) => (
                <tr key={row.cusip} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
                  <td className="py-2.5 pr-3">
                    <Link href={stockPath(lang, row.cusip)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                      <EntityName issuer={row.issuer} ticker={row.cusip} />
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                    {isZh ? `${row.holderCount} 位` : `${row.holderCount}`}
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                    {formatUSD(row.totalValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-[var(--tt-faint)]">{isZh ? "估值数据刷新中。" : "Valuation data refreshing."}</p>
        )}
      </LegBand>

      {/* 大环境 · Macro */}
      <LegBand
        eyebrow={isZh ? "大环境" : "Macro"}
        title={isZh ? "资金与利率" : "Liquidity & rates"}
        description={
          macroSummary
            ? macroSummary.headline[lang]
            : isZh
              ? "宏观快照刷新中。"
              : "Macro snapshot refreshing."
        }
        href={`/${lang}/macro`}
        viewAll={isZh ? "查看全部 →" : "View all →"}
      >
        {macroSummary ? (
          <ul className="space-y-2">
            {macroSummary.bullets.slice(0, 3).map((b, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-[var(--tt-muted)]">
                <span aria-hidden className="text-[var(--tt-faint)]">·</span>
                <span>{b[lang]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--tt-faint)]">{isZh ? "宏观快照刷新中。" : "Macro snapshot refreshing."}</p>
        )}
      </LegBand>

      {/* 三源脚注 */}
      <p className="mt-12 border-t border-[var(--tt-border)] pt-6 text-xs leading-relaxed text-[var(--tt-faint)]">
        {isZh
          ? `数据来源：SEC EDGAR 13F 季度报告${period ? `（截至 ${period}，含 45 天延迟）` : ""} · 公开市场价格 · FRED / NY Fed / U.S. Treasury${dgs10 ? `（10Y 截至 ${dgs10.date}）` : ""}。仅供参考，非投资建议。`
          : `Sources: SEC EDGAR 13F filings${period ? ` (as of ${period}, 45-day lag)` : ""} · public market prices · FRED / NY Fed / U.S. Treasury${dgs10 ? ` (10Y as of ${dgs10.date})` : ""}. For reference only, not investment advice.`}
      </p>
    </div>
  );
}
