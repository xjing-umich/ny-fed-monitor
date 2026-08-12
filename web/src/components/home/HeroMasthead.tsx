import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { NotableMoves, MoveRow } from "@/lib/aggregations";
import { formatUSD } from "@/lib/format";
import { EntityName } from "@/components/common/EntityName";
import MoveTag from "@/components/shell/MoveTag";
import { FreshnessDot } from "@/components/entity/FreshnessDot";
import { filingFreshness, quarterLabel, filingDeadline, type EffectiveMovesPeriod } from "@/lib/freshness/derive";
import { stockPath, localePath } from "@/lib/urls";
import RevealStagger from "@/components/home/RevealStagger";
import { Display } from "@/components/common/Display";

const COPY = {
  zh: {
    // 主张：真数字（投资者数 + 季度）领句，第二句弱化补估值交叉验证的立场
    brand: "Compounder · 复利",
    headline: (n: number) => `${n} 位投资者，上季度刚上报的每一笔持仓。`,
    headlineNoCount: (q: string) => `${q}，超级投资者刚上报的每一笔持仓。`,
    headlineMuted: "逐笔对齐第一性原理估值。",
    sub: (n: number) =>
      `聚合本站追踪的 ${n} 位超级投资者的 SEC 13F 季度持仓，按 CUSIP 逐票归并。数据来源 SEC EDGAR。`,
    subFallback:
      "聚合本站追踪的超级投资者 SEC 13F 季度持仓，按 CUSIP 逐票归并。数据来源 SEC EDGAR。",
    cta: "看个股估值",
    bought: "最多人增持",
    sold: "最多人减持",
    asOf: (p: string) => `截至 ${p} · 来源 SEC 13F · 上报延迟 45 天`,
    filingProgress: (q: string, filed: number, total: number, deadline: string) =>
      `${q} 申报进行中 · ${filed}/${total} 已交 · ${deadline}截止后切换`,
  },
  en: {
    brand: "Compounder",
    headline: (n: number) => `${n} investors. One quarter. Every position they just reported.`,
    headlineNoCount: (q: string) => `${q}. Every position the smart money just reported.`,
    headlineMuted: "Each holding checked against a first-principles valuation.",
    sub: (n: number) =>
      `SEC 13F holdings from the ${n} superinvestors we track, aggregated by CUSIP. Source: SEC EDGAR.`,
    subFallback:
      "SEC 13F holdings from the superinvestors we track, aggregated by CUSIP. Source: SEC EDGAR.",
    cta: "See per-stock valuation",
    bought: "Most bought",
    sold: "Most sold",
    asOf: (p: string) => `As of ${p} · Source SEC 13F · 45-day reporting lag`,
    filingProgress: (q: string, filed: number, total: number, deadline: string) =>
      `${q} filings arriving · ${filed} of ${total} in · switches after ${deadline}`,
  },
};

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 申报截止日 Date → 本地化短日期。zh「8 月 14 日」/ en「Aug 14」。null → ""。 */
function fmtDeadline(d: Date | null, lang: Lang): string {
  if (!d) return "";
  const mo = d.getUTCMonth();
  const day = d.getUTCDate();
  return lang === "zh" ? `${mo + 1} 月 ${day} 日` : `${EN_MONTHS[mo]} ${day}`;
}

function PanelRows({ lang, rows }: { lang: Lang; rows: MoveRow[] }) {
  return (
    <RevealStagger className="mt-2" stepMs={90} delayMs={250}>
      {rows.map((row) => (
        <div
          key={row.cusip}
          className="flex items-center justify-between gap-3 border-b border-[var(--tt-border)] py-2 last:border-0"
        >
          <span className="flex min-w-0 items-center gap-2">
            <MoveTag kind={row.dominantKind} />
            <Link
              href={stockPath(lang, row.cusip)}
              className="truncate font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
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
    </RevealStagger>
  );
}

export default function HeroMasthead({
  lang,
  period,
  movesPeriod,
  filing,
  moves,
  investorCount,
}: {
  lang: Lang;
  period: string;
  movesPeriod: string;
  filing?: EffectiveMovesPeriod;
  moves: NotableMoves;
  investorCount?: number;
}): React.ReactElement {
  const c = COPY[lang];
  const q = quarterLabel(movesPeriod) || movesPeriod;
  // 申报季进度:仅当新季已开始收表但尚未过披露门槛(未过截止日 或 覆盖不足)时显示。
  // due_and_covered / empty(非申报季窗口)一个字都不渲染。
  const showFilingProgress =
    !!filing && (filing.reason === "before_deadline" || filing.reason === "low_coverage");
  const filingProgressText =
    showFilingProgress && filing
      ? c.filingProgress(
          quarterLabel(filing.maxPeriod),
          filing.coverage.filed,
          filing.coverage.total,
          fmtDeadline(filingDeadline(filing.maxPeriod), lang),
        )
      : null;
  const panelTitle = lang === "zh" ? `${q} 显著动向` : `Notable moves · ${q}`;
  const headline =
    typeof investorCount === "number" && investorCount > 0
      ? c.headline(investorCount)
      : c.headlineNoCount(period);

  return (
    <section className="grid grid-cols-1 gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-start">
      <div>
        <p className="tt-eyebrow">
          {c.brand}
        </p>
        <p className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-accent)]">
          <FreshnessDot status={filingFreshness(period || null, new Date())} lang={lang} />
          {c.asOf(quarterLabel(period) || period)}
        </p>
        {filingProgressText && (
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-muted)]">
            {filingProgressText}
          </p>
        )}
        {typeof investorCount === "number" && investorCount > 0 && (
          <Display size="3xl" glow className="mt-6 font-display">
            {investorCount}
          </Display>
        )}
        <h1 className="mt-4 max-w-[18ch] text-balance font-display text-3xl font-medium leading-[1.06] tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {headline}
        </h1>
        <p className="mt-5 max-w-[30ch] text-lg leading-snug text-[var(--ink-2)] sm:text-xl">
          {c.headlineMuted}
        </p>
        <p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-[var(--tt-muted)]">
          {typeof investorCount === "number" && investorCount > 0
            ? c.sub(investorCount)
            : c.subFallback}
        </p>
        <Link
          href={localePath(lang, "/stocks/screener")}
          className="group mt-7 inline-flex min-h-11 items-center gap-1.5 text-[15px] text-[var(--tt-text)] no-underline [transition:color_var(--tt-dur-fast)_var(--tt-ease)] hover:text-[var(--tt-accent)]"
        >
          <span className="[border-bottom:1px_solid_var(--tt-accent)] pb-0.5">{c.cta}</span>
          <span
            aria-hidden
            className="inline-block [transition:transform_var(--tt-dur-fast)_var(--tt-ease)] group-hover:translate-x-1"
          >
            →
          </span>
        </Link>
      </div>

      {(moves.mostBought.length > 0 || moves.mostSold.length > 0) && (
        <aside className="md:pl-2">
          <div className="flex items-baseline justify-between border-b border-[var(--tt-border-strong)] pb-2">
            <span className="text-sm font-medium text-[var(--tt-text)]">{panelTitle}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--tt-faint)]">
              {q}
            </span>
          </div>
          {moves.mostBought.length > 0 && (
            <div>
              <p className="pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                {c.bought}
              </p>
              <PanelRows lang={lang} rows={moves.mostBought.slice(0, 3)} />
            </div>
          )}
          {moves.mostSold.length > 0 && (
            <div>
              <p className="pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                {c.sold}
              </p>
              <PanelRows lang={lang} rows={moves.mostSold.slice(0, 2)} />
            </div>
          )}
        </aside>
      )}
    </section>
  );
}
