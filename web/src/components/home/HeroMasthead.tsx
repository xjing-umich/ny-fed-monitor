import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { NotableMoves, MoveRow } from "@/lib/aggregations";
import { formatUSD } from "@/lib/format";
import { EntityName } from "@/components/common/EntityName";
import MoveTag from "@/components/shell/MoveTag";
import { FreshnessDot } from "@/components/entity/FreshnessDot";
import { filingFreshness, quarterLabel } from "@/lib/freshness/derive";
import { stockPath, localePath } from "@/lib/urls";
import RevealStagger from "@/components/home/RevealStagger";

const COPY = {
  zh: {
    // 主张：真数字（投资者数 + 季度）领句，第二句弱化补估值交叉验证的立场
    headline: (n: number) => `${n} 位投资者，上季度刚上报的每一笔持仓。`,
    headlineNoCount: (q: string) => `${q}，超级投资者刚上报的每一笔持仓。`,
    headlineMuted: "逐笔对齐第一性原理估值，只留耐心买家出手的位置。",
    sub: "这里聚合的是 SEC 13F 季度持仓，与自建估值引擎逐票交叉验证。数据来源 SEC EDGAR。",
    cta: "看个股估值",
    panelTitle: "本季显著动向",
    live: "实时",
    bought: "最多人增持",
    sold: "最多人减持",
    asOf: (p: string) => `截至 ${p} · 来源 SEC 13F · 上报延迟 45 天`,
  },
  en: {
    headline: (n: number) => `${n} investors. One quarter. Every position they just reported.`,
    headlineNoCount: (q: string) => `${q}. Every position the smart money just reported.`,
    headlineMuted: "Each holding lined up against a first-principles valuation, so you see where patient buyers actually stepped in.",
    sub: "SEC 13F quarterly holdings, cross-checked stock by stock against a self-built valuation engine. Source: SEC EDGAR.",
    cta: "See per-stock valuation",
    panelTitle: "Notable moves this quarter",
    live: "live",
    bought: "Most bought",
    sold: "Most sold",
    asOf: (p: string) => `As of ${p} · Source SEC 13F · 45-day reporting lag`,
  },
} as const;

function PanelRows({ lang, rows }: { lang: Lang; rows: MoveRow[] }) {
  return (
    <div className="mt-2">
      {rows.map((row) => (
        <div
          key={row.cusip}
          className="flex items-center justify-between gap-3 border-b border-[var(--tt-border)] py-2 last:border-0"
        >
          <span className="flex min-w-0 items-center gap-2">
            <MoveTag kind={row.dominantKind} />
            <Link
              href={stockPath(lang, row.cusip)}
              className="truncate font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
            >
              <EntityName issuer={row.issuer} ticker={row.cusip} />
            </Link>
          </span>
          <span
            className="shrink-0 font-mono text-xs tabular-nums whitespace-nowrap"
            style={{
              color:
                row.dominantKind === "exited" || row.dominantKind === "decreased"
                  ? "var(--tt-negative)"
                  : "var(--tt-positive)",
            }}
          >
            {lang === "zh" ? `${row.count} 位 · ${formatUSD(row.value)}` : `${row.count} · ${formatUSD(row.value)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function HeroMasthead({
  lang,
  period,
  moves,
  investorCount,
}: {
  lang: Lang;
  period: string;
  moves: NotableMoves;
  investorCount?: number;
}): React.ReactElement {
  const c = COPY[lang];
  const headline =
    typeof investorCount === "number" && investorCount > 0
      ? c.headline(investorCount)
      : c.headlineNoCount(period);

  return (
    <section className="grid grid-cols-1 gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-start">
      <div>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-accent)]">
          <FreshnessDot status={filingFreshness(period || null, new Date())} lang={lang} />
          {c.asOf(quarterLabel(period) || period)}
        </p>
        <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] tracking-tight text-[var(--tt-text)] sm:text-6xl md:text-7xl">
          {headline}{" "}
          <span className="text-[var(--tt-faint)]">{c.headlineMuted}</span>
        </h1>
        <p className="mt-5 max-w-[40ch] text-sm leading-relaxed text-[var(--tt-muted)]">{c.sub}</p>
        <Link
          href={localePath(lang, "/stocks/screener")}
          className="group mt-7 inline-flex items-center gap-1.5 font-display text-[15px] text-[var(--tt-text)] no-underline [border-bottom:1px_solid_var(--tt-accent)] [transition:color_var(--tt-dur)_var(--tt-ease)] hover:text-[var(--tt-accent)]"
        >
          {c.cta}
          <span
            aria-hidden
            className="inline-block [transition:transform_var(--tt-dur)_var(--tt-ease)] group-hover:translate-x-1"
          >
            →
          </span>
        </Link>
      </div>

      {(moves.mostBought.length > 0 || moves.mostSold.length > 0) && (
        <aside className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
          <div className="flex items-baseline justify-between border-b border-[var(--tt-border-strong)] pb-2">
            <span className="font-display text-sm font-medium text-[var(--tt-text)]">{c.panelTitle}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--tt-faint)]">{c.live}</span>
          </div>
          <RevealStagger>
            {moves.mostBought.length > 0 && (
              <div>
                <p className="pt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                  {c.bought}
                </p>
                <PanelRows lang={lang} rows={moves.mostBought.slice(0, 3)} />
              </div>
            )}
            {moves.mostSold.length > 0 && (
              <div>
                <p className="pt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                  {c.sold}
                </p>
                <PanelRows lang={lang} rows={moves.mostSold.slice(0, 2)} />
              </div>
            )}
          </RevealStagger>
        </aside>
      )}
    </section>
  );
}
