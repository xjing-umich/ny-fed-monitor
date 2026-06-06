import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld, notableMoves } from "@/lib/aggregations";
import { buildAllSections } from "@/lib/build";
import { sectionLabel } from "@/lib/dashboard";
import { formatUSD } from "@/lib/format";
import { investorPath, stockPath, macroPath } from "@/lib/urls";
import type { Lang } from "@/lib/nav";
import { MACRO_GROUPS } from "@/lib/nav";
import SearchBox from "@/components/shell/SearchBox";

export const dynamic = "force-dynamic";

// ── Metadata ─────────────────────────────────────────────────────────────────

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
    alternates: { canonical: `/${l}`, languages: { "zh-CN": "/zh", en: "/en" } },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";

  // ── Data (server, defensive) ──────────────────────────────────────────────
  const idx = await getManagerIndex();
  const topManagers = [...(idx.managers ?? [])].sort(
    (a, b) => b.totalValue - a.totalValue
  );
  const period = topManagers[0]?.period ?? "";

  const moves = await notableMoves(6);
  const held = await mostHeld(8);

  // Hero search items: macro indicators (localized via section labels)
  const macroItems: { label: string; href: string }[] = [];

  let macroSignals: { key: string; name: string; value: string }[] = [];
  try {
    const data = await buildAllSections();
    for (const group of MACRO_GROUPS) {
      for (const ind of group.indicators) {
        const s = data.sections[ind];
        if (!s) continue;
        macroItems.push({
          label: sectionLabel(lang, s) ?? ind,
          href: macroPath(lang, ind),
        });
      }
    }
    macroSignals = ["reference-rates", "repo-financing", "auction-risk"]
      .map((k) => data.sections[k])
      .filter(Boolean)
      .map((s) => {
        const m = (s.key_metrics ?? []).find(
          (km) =>
            km.value && !String(km.value).toLowerCase().includes("unavailable")
        );
        return m
          ? {
              key: s.key,
              name: sectionLabel(lang, s) ?? s.key,
              value: `${m.value}${m.unit ? " " + m.unit : ""}`,
            }
          : null;
      })
      .filter(Boolean)
      .slice(0, 3) as { key: string; name: string; value: string }[];
  } catch {
    macroSignals = [];
  }

  // ── JSON-LD ────────────────────────────────────────────────────────────────
  const ld = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Compounder",
    url: `https://compounder.fyi/${lang}`,
    description: isZh
      ? "聚合超级投资者 13F 持仓、个股估值与宏观流动性。"
      : "Smart-money 13F holdings, single-stock valuation, and the macro funding backdrop.",
  };

  const topInvestors = topManagers.slice(0, 8);

  // ── Hero search items (investors + stocks + macro), de-duped ──────────────
  const heroItems: { label: string; href: string }[] = [];
  const seen = new Set<string>();
  function pushItem(label: string, href: string) {
    const key = href.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    heroItems.push({ label, href });
  }
  for (const m of topManagers) pushItem(m.person, investorPath(lang, m.slug));
  for (const row of held) pushItem(titleCase(row.issuer), stockPath(lang, row.cusip));
  for (const it of macroItems) pushItem(it.label, it.href);

  return (
    <div className="mx-auto max-w-5xl px-2 py-8 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      {/* ── 0. Hero — value-investing quote + search CTA ─────────────── */}
      <section className="border-b border-[var(--tt-border)] pb-10 pt-2 sm:pb-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--tt-muted)]">
          {isZh ? "COMPOUNDER · 复利" : "COMPOUNDER"}
        </p>
        <blockquote className="mt-4 max-w-3xl">
          <p className="font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl md:text-5xl">
            {isZh
              ? "「价格是你付出的，价值是你得到的。」"
              : "“Price is what you pay. Value is what you get.”"}
          </p>
          <cite className="mt-3 block font-display text-base not-italic text-[var(--tt-muted)]">
            {isZh ? "— 沃伦·巴菲特" : "— Warren Buffett"}
          </cite>
        </blockquote>

        <div className="mt-7">
          <SearchBox
            lang={lang}
            items={heroItems}
            variant="hero"
            placeholder={
              isZh
                ? "搜索投资者、个股或指标…"
                : "Search investors, stocks, or indicators…"
            }
          />
          <p className="mt-3 text-sm">
            <Link
              href={`/${lang}/investors`}
              className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
            >
              {isZh ? "或浏览全部超级投资者 →" : "Or browse all superinvestors →"}
            </Link>
          </p>
        </div>
      </section>

      {/* ── 1. Dateline ──────────────────────────────────────────────── */}
      <div className="border-b border-[var(--tt-border)] pb-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--tt-muted)]">
          {isZh
            ? `截至 ${period} · ${topManagers.length} 位投资者 · 数据来源 SEC 13F`
            : `As of ${period} · ${topManagers.length} investors · Source: SEC 13F`}
        </p>
      </div>

      {/* ── 2. Notable moves this quarter — wide lead ────────────────── */}
      {(moves.mostBought.length > 0 || moves.mostSold.length > 0) && (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">
            {isZh ? "本季显著动向" : "Notable moves this quarter"}
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-8 border-t border-[var(--tt-border)] pt-5 md:grid-cols-2">
            {moves.mostBought.length > 0 && (
              <MoveColumn
                lang={lang}
                title={isZh ? "本季最多人增持" : "Most bought"}
                rows={moves.mostBought}
              />
            )}
            {moves.mostSold.length > 0 && (
              <MoveColumn
                lang={lang}
                title={isZh ? "本季最多人减持" : "Most sold"}
                rows={moves.mostSold}
              />
            )}
          </div>
        </section>
      )}

      {/* ── 3 / 4 / 5 stacked editorial blocks ───────────────────────── */}
      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-2">
        {/* 3. Consensus holdings */}
        {held.length > 0 && (
          <section>
            <BlockHeading
              title={isZh ? "共识持仓" : "Consensus holdings"}
              href={`/${lang}/stocks`}
              isZh={isZh}
            />
            <table className="mt-4 w-full border-collapse text-sm">
              <tbody>
                {held.map((row) => (
                  <tr
                    key={row.cusip}
                    className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
                  >
                    <td className="py-2.5 pr-4">
                      <Link
                        href={stockPath(lang, row.cusip)}
                        className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                      >
                        {titleCase(row.issuer)}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">
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

        {/* 4. Investors */}
        {topInvestors.length > 0 && (
          <section>
            <BlockHeading
              title={isZh ? "投资者" : "Investors"}
              href={`/${lang}/investors`}
              isZh={isZh}
            />
            <table className="mt-4 w-full border-collapse text-sm">
              <tbody>
                {topInvestors.map((m) => (
                  <tr
                    key={m.cik}
                    className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
                  >
                    <td className="py-2.5 pr-4">
                      <Link
                        href={investorPath(lang, m.slug)}
                        className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                      >
                        {m.person}
                      </Link>
                      <span className="ml-2 truncate text-[11px] text-[var(--tt-faint)]">
                        {titleCase(m.topHolding)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">
                      {m.holdingCount}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-text)]">
                      {formatUSD(m.totalValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {/* 5. Macro snapshot */}
      {macroSignals.length > 0 && (
        <section className="mt-12">
          <BlockHeading
            title={isZh ? "宏观速览" : "Macro snapshot"}
            href={`/${lang}/macro`}
            isZh={isZh}
          />
          <table className="mt-4 w-full border-collapse text-sm">
            <tbody>
              {macroSignals.map((s) => (
                <tr
                  key={s.key}
                  className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
                >
                  <td className="py-2.5 pr-4">
                    <Link
                      href={macroPath(lang, s.key)}
                      className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="py-2.5 text-right font-mono text-sm tabular-nums text-[var(--tt-text)]">
                    {s.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="mt-12 border-t border-[var(--tt-border)] pt-6 text-xs text-[var(--tt-faint)]">
        {isZh
          ? "数据来源：SEC EDGAR 13F 季度报告、纽约联储。持仓数据存在 45 天延迟，仅供参考。"
          : "Sources: SEC EDGAR 13F quarterly filings, NY Fed. Holdings data has a 45-day lag and is for reference only."}
      </p>
    </div>
  );
}

// ── Sub-components (server-safe; CSS hover only) ──────────────────────────────

function BlockHeading({
  title,
  href,
  isZh,
}: {
  title: string;
  href: string;
  isZh: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--tt-border)] pb-2">
      <h2 className="font-display text-xl font-medium tracking-tight text-[var(--tt-text)]">
        {title}
      </h2>
      <Link
        href={href}
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
      >
        {isZh ? "查看全部 →" : "View all →"}
      </Link>
    </div>
  );
}

function MoveColumn({
  lang,
  title,
  rows,
}: {
  lang: Lang;
  title: string;
  rows: { cusip: string; issuer: string; count: number; value: number }[];
}) {
  const isZh = lang === "zh";
  return (
    <div>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--tt-muted)]">
        {title}
      </h3>
      <table className="mt-3 w-full border-collapse text-sm">
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.cusip}
              className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
            >
              <td className="py-2.5 pr-4">
                <Link
                  href={stockPath(lang, row.cusip)}
                  className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                >
                  {titleCase(row.issuer)}
                </Link>
              </td>
              <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">
                {isZh ? `${row.count} 位` : `${row.count} investors`}
              </td>
              <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">
                {formatUSD(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
