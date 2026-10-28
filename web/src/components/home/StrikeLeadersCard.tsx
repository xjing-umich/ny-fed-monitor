import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { StrikeLeader } from "@/lib/valuation/valuationSnapshot";
import { stockPath } from "@/lib/urls";
import { fmtMarginPct, fmtPerShareValue, fmtValueBand } from "@/lib/format";
import { impliedValue } from "@/lib/valuation/impliedValue";
import { BAND_FLOOR_NOTE } from "@/lib/valuation/valuationLabel";
import { latestIsoDate, valuationAsOfText } from "@/lib/valuation/asOf";

const COPY = {
  zh: {
    title: (n: number) => `${n} 只在击球区`,
    pending: (p: number) => `另 ${p} 只待确认`,
    cols: { ticker: "代码", band: "价值带", iv: "内在价值", margin: "安全边际" },
    note: `价格低于买入线（内在价值扣除安全边际）的标的，按安全边际排序。${BAND_FLOOR_NOTE.zh}仅为位置观察，非建议。`,
  },
  en: {
    title: (n: number) => `${n} in the strike zone`,
    pending: (p: number) => `${p} more pending review`,
    cols: { ticker: "Ticker", band: "Band", iv: "Intrinsic value", margin: "Margin" },
    note: `Priced below the buy line (intrinsic value minus a margin of safety), ranked by margin of safety. ${BAND_FLOOR_NOTE.en} An observation, not advice.`,
  },
} as const;

/** Feature-row ③ visual: real strike-zone leaders (击球区 = 价格低于内在价值扣除
 *  安全边际后的买入线). Mirrors the db-foundation valuation-leg formatting; falls back to
 *  ValueBandCard upstream when there are no leaders. */
export default function StrikeLeadersCard({
  lang,
  leaders,
  total,
  pending = 0,
}: {
  lang: Lang;
  leaders: StrikeLeader[];
  total: number;
  /** 击球区但待确认(reliable=false)的只数;标题只计已确认,这一项紧跟着说,两数不混。 */
  pending?: number;
}): React.ReactElement {
  const c = COPY[lang];
  const asOf = valuationAsOfText(lang, latestIsoDate(leaders.map((l) => l.priceDate)));
  return (
    <div className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--tt-border-strong)] pb-2">
        <span className="text-sm font-medium text-[var(--tt-text)]">{c.title(total)}</span>
        {pending > 0 ? <span className="font-data text-xs text-[var(--ink-2)]">{c.pending(pending)}</span> : null}
      </div>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="font-data text-xs text-[var(--tt-faint)]">
            <th className="py-1 pr-3 text-left font-normal"><span className="sr-only">{c.cols.ticker}</span></th>
            <th className="py-1 pr-3 text-right font-normal">{c.cols.band}</th>
            <th className="py-1 pr-3 text-right font-normal">{c.cols.iv}</th>
            <th className="py-1 text-right font-normal">{c.cols.margin}</th>
          </tr>
        </thead>
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
              <td className="py-2 pr-3 text-right font-data text-sm tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                {fmtValueBand(row.rangeLo, row.rangeHi, fmtPerShareValue)}
              </td>
              <td className="py-2 pr-3 text-right font-data text-sm tabular-nums text-[var(--tt-text)] whitespace-nowrap">
                {(() => {
                  const iv = impliedValue(row.price, row.marginPct);
                  return iv == null ? "—" : fmtPerShareValue(iv);
                })()}
              </td>
              <td className="py-2 text-right font-data text-sm tabular-nums text-val-below whitespace-nowrap">
                {row.marginPct != null && row.marginPct > 0 ? fmtMarginPct(row.marginPct) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-[var(--tt-muted)]">
        {asOf && <span className="font-data text-[var(--tt-faint)]">{asOf}{lang === "zh" ? "。" : ". "}</span>}
        {c.note}
      </p>
    </div>
  );
}
