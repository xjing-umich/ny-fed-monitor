import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { StrikeLeader } from "@/lib/valuation/valuationSnapshot";
import { stockPath } from "@/lib/urls";
import { fmtValueBand } from "@/lib/format";

const COPY = {
  zh: {
    title: (n: number) => `现在 ${n} 只落入价值带`,
    margin: "安全边际",
    note: "低于我们保守价值带的标的，按安全边际排序。仅为位置观察，非建议。",
  },
  en: {
    title: (n: number) => `${n} in the strike zone now`,
    margin: "Margin",
    note: "Trading below our conservative value band, ranked by margin of safety. An observation, not advice.",
  },
} as const;

/** Feature-row ③ visual: real strike-zone leaders (price below conservative value
 *  band). Mirrors the db-foundation valuation-leg formatting; falls back to
 *  ValueBandCard upstream when there are no leaders. */
export default function StrikeLeadersCard({
  lang,
  leaders,
  total,
}: {
  lang: Lang;
  leaders: StrikeLeader[];
  total: number;
}): React.ReactElement {
  const c = COPY[lang];
  return (
    <div className="ticks rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
      <div className="flex items-baseline justify-between border-b border-[var(--tt-border-strong)] pb-2">
        <span className="text-sm font-medium text-[var(--tt-text)]">{c.title(total)}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--tt-faint)]">{c.margin}</span>
      </div>
      <table className="mt-2 w-full border-collapse text-sm">
        <tbody>
          {leaders.map((row) => (
            <tr key={row.ticker} className="border-b border-[var(--tt-border)] last:border-0">
              <td className="py-2 pr-3">
                <Link
                  href={stockPath(lang, row.ticker)}
                  className="font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                >
                  {row.ticker}
                </Link>
              </td>
              <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                {fmtValueBand(row.rangeLo, row.rangeHi, (n) => `$${Math.round(n).toLocaleString()}`)}
              </td>
              <td
                className="py-2 text-right font-mono text-xs tabular-nums text-[var(--tt-accent)] whitespace-nowrap"
                style={{ textShadow: "var(--glow-primary)" }}
              >
                {row.marginPct != null && row.marginPct > 0 ? `−${Math.round(row.marginPct * 100)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--tt-muted)]">{c.note}</p>
    </div>
  );
}
