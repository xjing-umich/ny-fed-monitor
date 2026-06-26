import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { NotableMoves, MoveRow } from "@/lib/aggregations";
import { formatUSD } from "@/lib/format";
import { EntityName } from "@/components/common/EntityName";
import MoveTag from "@/components/shell/MoveTag";
import { FreshnessDot } from "@/components/entity/FreshnessDot";
import { filingFreshness } from "@/lib/freshness/derive";
import { stockPath } from "@/lib/urls";

const COPY = {
  zh: {
    propLead: "与最有耐心的投资者同行。",
    propMuted: "看他们持有什么 —— 以及值多少钱。",
    sub: "聚合超级投资者的 SEC 13F 季度持仓，与第一性原理估值交叉验证。数据来源：SEC EDGAR。",
    investors: "投资者",
    stocks: "股票",
    valuation: "估值",
    panelTitle: "本季显著动向",
    live: "实时",
    bought: "最多人增持",
    sold: "最多人减持",
    asOf: (p: string) => `截至 ${p} · SEC 13F · 45 天延迟`,
  },
  en: {
    propLead: "Walk with the most patient investors.",
    propMuted: "See what they own — and what it's worth.",
    sub: "Smart-money SEC 13F holdings, cross-referenced with first-principles valuation. Source: SEC EDGAR.",
    investors: "Investors",
    stocks: "Stocks",
    valuation: "Valuation",
    panelTitle: "Notable moves this quarter",
    live: "live",
    bought: "Most bought",
    sold: "Most sold",
    asOf: (p: string) => `As of ${p} · SEC 13F · 45-day lag`,
  },
} as const;

function PanelRows({ lang, rows }: { lang: Lang; rows: MoveRow[] }) {
  return (
    <table className="mt-2 w-full border-collapse text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.cusip} className="border-b border-[var(--tt-border)] last:border-0">
            <td className="py-2 pr-3">
              <span className="flex items-center gap-2">
                <MoveTag kind={row.dominantKind} />
                <Link
                  href={stockPath(lang, row.cusip)}
                  className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                >
                  <EntityName issuer={row.issuer} ticker={row.cusip} />
                </Link>
              </span>
            </td>
            <td className="py-2 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
              {lang === "zh" ? `${row.count} 位 · ${formatUSD(row.value)}` : `${row.count} · ${formatUSD(row.value)}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function HeroMasthead({
  lang,
  period,
  moves,
}: {
  lang: Lang;
  period: string;
  moves: NotableMoves;
}): React.ReactElement {
  const c = COPY[lang];
  const links: { label: string; href: string }[] = [
    { label: c.investors, href: `/${lang}/investors` },
    { label: c.stocks, href: `/${lang}/stocks` },
    { label: c.valuation, href: "#valuation" },
  ];
  return (
    <section className="grid grid-cols-1 gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-start">
      <div>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-accent)]">
          <FreshnessDot status={filingFreshness(period || null, new Date())} lang={lang} />
          {c.asOf(period)}
        </p>
        <h1 className="mt-4 font-display text-3xl font-medium leading-[1.12] tracking-tight text-[var(--tt-text)] sm:text-4xl md:text-5xl">
          {c.propLead}{" "}
          <span className="text-[var(--tt-faint)]">{c.propMuted}</span>
        </h1>
        <p className="mt-4 max-w-[36ch] text-sm leading-relaxed text-[var(--tt-muted)]">{c.sub}</p>
        <nav className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="font-display text-[15px] text-[var(--tt-text)] no-underline [border-bottom:1px_solid_var(--tt-accent)] transition-colors hover:text-[var(--tt-accent)]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      {(moves.mostBought.length > 0 || moves.mostSold.length > 0) && (
      <aside className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
        <div className="flex items-baseline justify-between border-b border-[var(--tt-border-strong)] pb-2">
          <span className="font-display text-sm font-medium text-[var(--tt-text)]">{c.panelTitle}</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--tt-faint)]">{c.live}</span>
        </div>
        {moves.mostBought.length > 0 && (
          <>
            <p className="pt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{c.bought}</p>
            <PanelRows lang={lang} rows={moves.mostBought.slice(0, 3)} />
          </>
        )}
        {moves.mostSold.length > 0 && (
          <>
            <p className="pt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{c.sold}</p>
            <PanelRows lang={lang} rows={moves.mostSold.slice(0, 2)} />
          </>
        )}
      </aside>
      )}
    </section>
  );
}
