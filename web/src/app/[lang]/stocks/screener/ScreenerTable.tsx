import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { stockPath } from "@/lib/urls";
import { cleanIssuer, fmtMarginPct, fmtValueBand } from "@/lib/format";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityName } from "@/components/common/EntityName";
import { ValuationBadge } from "@/components/valuation/ValuationBadge";
import type { ScreenerRow } from "@/lib/valuation/valuationSnapshot";
import { stockGlossary, stockUi } from "@/lib/stocks/stockCopy";

const TOP_N = 60;

export function ScreenerTable({ lang, rows }: { lang: Lang; rows: ScreenerRow[] }) {
  const isZh = lang === "zh";
  const g = stockGlossary(lang);
  const ui = stockUi(lang);
  const head = rows.slice(0, TOP_N);
  const tail = rows.slice(TOP_N);

  const columns: Column<ScreenerRow>[] = [
    {
      key: "security",
      header: g.security,
      role: "primary",
      cell: (r) => <EntityName issuer={r.issuer} ticker={r.ticker} />,
    },
    {
      key: "position",
      header: isZh ? "位置" : "Position",
      width: "w-40",
      mobileLabel: isZh ? "位置" : "Position",
      // ScreenerRow ⊇ SnapshotVerdict → 直接传整行
      cell: (r) => <ValuationBadge verdict={r} lang={lang} />,
    },
    {
      key: "margin",
      header: isZh ? "安全边际" : "Margin of safety",
      align: "right",
      width: "w-24",
      mobileLabel: isZh ? "安全边际" : "Margin",
      // reliable=false(周期峰值/高杠杆/模型不稳/per-share疑错)挂诚实标记:数值弱化 + ⚠ +
      // title 说明。这些不进 strike-zone/below,但在"全部可估值"仍可见,必须标出不确定性。
      cell: (r) =>
        r.marginPct != null && r.marginPct > 0 ? (
          r.reliable ? (
            <span className="font-mono tabular-nums text-[var(--tt-positive)]">{fmtMarginPct(r.marginPct)}</span>
          ) : (
            <span
              className="font-mono tabular-nums text-[var(--tt-faint)]"
              title={isZh ? "估值带红旗（盈利下滑/高杠杆/模型不稳/每股口径疑错），边际不可信，未计入便宜信号。" : "Valuation flagged (declining earnings / high leverage / model instability / per-share doubt); margin not trustworthy, excluded from the cheap signal."}
            >
              {fmtMarginPct(r.marginPct)}<span aria-hidden className="ml-0.5 text-[var(--tt-warn)]">⚠</span>
            </span>
          )
        ) : (
          <span className="text-[var(--tt-faint)]">—</span>
        ),
    },
    {
      key: "band",
      header: isZh ? "价值带 / sh" : "Value band / sh",
      align: "right",
      width: "w-32",
      hideOnMobile: true,
      cell: (r) => <span className="font-mono tabular-nums text-[var(--tt-muted)]">{fmtValueBand(r.rangeLo, r.rangeHi, (n) => `$${Math.round(n).toLocaleString()}`)}</span>,
    },
    {
      key: "price",
      header: isZh ? "现价" : "Price",
      align: "right",
      width: "w-28",
      mobileLabel: isZh ? "现价" : "Price",
      cell: (r) => (
        <span className="font-mono tabular-nums text-[var(--tt-text)]">
          ${Math.round(r.price).toLocaleString()}
          {r.priceDate ? <span className="ml-1 text-[10px] text-[var(--tt-faint)]">{r.priceDate}</span> : null}
        </span>
      ),
    },
    {
      key: "holders",
      header: g.holdersInstitution,
      align: "right",
      width: "w-20",
      hideOnMobile: true,
      cell: (r) => <span className="font-mono tabular-nums text-[var(--tt-muted)]">{r.holderCount || "—"}</span>,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={head}
        getKey={(r) => r.ticker}
        rowHref={(r) => stockPath(lang, r.ticker)}
        showRank
        emptyText={ui.emptyScreener}
      />

      {tail.length > 0 && (
        <details className="group mt-4">
          <summary className="cursor-pointer list-none max-sm:flex max-sm:items-center max-sm:min-h-[44px] py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)] hover:text-[var(--tt-accent)] [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">{ui.showMore(tail.length)} ▸</span>
            <span className="hidden group-open:inline">{ui.collapse} ▾</span>
          </summary>
          <ul className="mt-3 grid list-none grid-cols-1 gap-x-6 gap-y-1.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {tail.map((r, i) => (
              <li key={r.ticker} className="flex items-baseline gap-2 text-sm">
                <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--tt-faint)]">{TOP_N + i + 1}</span>
                <Link href={stockPath(lang, r.ticker)} className="min-w-0 truncate text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">
                  {cleanIssuer(r.issuer)}
                  <span className="ml-1.5 font-mono text-[11px] text-[var(--tt-faint)]">{r.ticker}</span>
                  {r.marginPct != null && r.marginPct > 0 ? (
                    r.reliable ? (
                      <span className="ml-1.5 font-mono text-[11px] text-[var(--tt-positive)]">{fmtMarginPct(r.marginPct)}</span>
                    ) : (
                      // 与表头列同一诚实口径:红旗票的安全边际弱化 + ⚠,不冒充分确认便宜。
                      <span
                        className="ml-1.5 font-mono text-[11px] text-[var(--tt-faint)]"
                        title={isZh ? "估值带红旗（盈利下滑/高杠杆/模型不稳/每股口径疑错），边际不可信，未计入便宜信号。" : "Valuation flagged (declining earnings / high leverage / model instability / per-share doubt); margin not trustworthy, excluded from the cheap signal."}
                      >
                        {fmtMarginPct(r.marginPct)}<span aria-hidden className="ml-0.5 text-[var(--tt-warn)]">⚠</span>
                      </span>
                    )
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
