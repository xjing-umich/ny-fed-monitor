import React from "react";
import { OptionalLink } from "@/components/common/OptionalLink";
import type { Lang } from "@/lib/nav";
import { availableStockHref } from "@/lib/stocks/stockLinks";
import { cleanIssuer, fmtMarginPct, fmtValueBand, fmtPrice, fmtPerShareValue } from "@/lib/format";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityName } from "@/components/common/EntityName";
import { stockDisplayName } from "@/lib/stocks/zhNames";
import { ValuationBadge } from "@/components/valuation/ValuationBadge";
import type { ScreenerRow } from "@/lib/valuation/valuationSnapshot";
import { stockGlossary, stockUi } from "@/lib/stocks/stockCopy";
import { deriveFusionSignal } from "@/lib/managers/fusionSignal";

import { BAND_FLOOR_NOTE } from "@/lib/valuation/valuationLabel";

const TOP_N = 60;

/** asOf = 页头标的价格日期;某行价格日期不同时才在该行标出。 */
export function ScreenerTable({ lang, rows, availableStocks, highlight = false, asOf, emptyText }: { lang: Lang; rows: ScreenerRow[]; availableStocks: ReadonlySet<string>; highlight?: boolean; asOf?: string | null; emptyText?: string }) {
  const isZh = lang === "zh";
  const g = stockGlossary(lang);
  const ui = stockUi(lang);
  const head = rows.slice(0, TOP_N);
  const tail = rows.slice(TOP_N);
  const unit = (r: ScreenerRow) => r.securityUnit === "ADS" ? (isZh ? "每 ADS" : "per ADS") : r.securityUnit === "share" ? (isZh ? "每股" : "per share") : (isZh ? "证券单位待核对" : "security unit unavailable");

  const columns: Column<ScreenerRow>[] = [
    {
      key: "security",
      header: g.security,
      role: "primary",
      cell: (r) => {
        const top = highlight && deriveFusionSignal({ holderCount: r.holderCount, verdict: r }).isCheapConsensus;
        return (
          <span className={top ? "font-semibold" : undefined}>
            <EntityName issuer={r.issuer} ticker={r.ticker} lang={lang} />
            <span className="ml-1 font-data text-xs text-[var(--tt-faint)]">{unit(r)}</span>
          </span>
        );
      },
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
            <span className="font-data tabular-nums text-[var(--val-below)]">{fmtMarginPct(r.marginPct)}</span>
          ) : (
            <span
              className="font-data tabular-nums text-[var(--tt-faint)]"
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
      header: isZh ? "价值区间（美元）" : "Value range (USD)",
      align: "right",
      width: "w-32",
      hideOnMobile: true,
      cell: (r) => <span className="font-data tabular-nums text-[var(--tt-muted)]">{fmtValueBand(r.rangeLo, r.rangeHi, fmtPerShareValue)}</span>,
    },
    {
      key: "iv",
      header: isZh ? "内在价值" : "Intrinsic value",
      align: "right",
      width: "w-28",
      hideOnMobile: true,
      // 原始发布记录中的 IV / 比较锚,不从四舍五入的边际反推。
      cell: (r) => {
        const iv = r.intrinsicValue ?? r.referenceValue;
        return <span className="font-data tabular-nums text-[var(--tt-text)]">{iv == null ? "—" : fmtPerShareValue(iv)}{r.referenceKind !== "oe_dcf_neutral" && <small> {r.referenceKind === "zero_growth_floor" ? (isZh ? "零增长底" : "Zero-growth floor") : (isZh ? "SOTP 基础档" : "SOTP base")}</small>}</span>;
      },
    },
    {
      key: "price",
      header: isZh ? "现价" : "Price",
      align: "right",
      width: "w-28",
      mobileLabel: isZh ? "现价" : "Price",
      cell: (r) => (
        <span className="font-data tabular-nums text-[var(--tt-text)]">
          {fmtPrice(r.price)}
          {r.priceDate && r.priceDate !== asOf ? <span className="ml-1 text-xs text-[var(--tt-faint)]">{r.priceDate}</span> : null}
        </span>
      ),
    },
    {
      key: "holders",
      header: g.holdersInstitution,
      align: "right",
      width: "w-20",
      hideOnMobile: true,
      cell: (r) => <span className="font-data tabular-nums text-[var(--tt-muted)]">{r.holderCount || "—"}</span>,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={head}
        getKey={(r) => r.ticker}
        rowAttributes={(r) => r.publication?.attributes}
        rowHref={(r) => availableStockHref(lang, r.ticker, availableStocks)}
        showRank
        emptyText={emptyText ?? ui.emptyScreener}
      />
      {/* 价值区间 / 内在价值列只在桌面表格出现(hideOnMobile,DataTable 默认 md 断点),脚注同断点隐藏 */}
      {rows.length > 0 && <p className="mt-2 text-xs text-[var(--tt-muted)]">{isZh ? "数值按每份上市证券计：普通股为每股，存托凭证为每ADS；换算比例见个股页。" : "Values are per listed share or, for depositary receipts, per ADS. See stock pages for conversion ratios."}</p>}
      <p className="mt-2 hidden text-xs text-[var(--tt-faint)] md:block">
        {isZh
          ? `带 * 的为单法口径，内在价值一列为零增长价值。${BAND_FLOOR_NOTE.zh}`
          : `Rows marked * use a single method; their intrinsic value is the zero-growth value. ${BAND_FLOOR_NOTE.en}`}
      </p>

      {tail.length > 0 && (
        <details className="group mt-4">
          <summary className="cursor-pointer list-none max-sm:flex max-sm:items-center max-sm:min-h-[44px] py-2 font-data text-xs text-[var(--tt-muted)] hover:text-[var(--tt-accent)] [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">{ui.showMore(tail.length)} ▸</span>
            <span className="hidden group-open:inline">{ui.collapse} ▾</span>
          </summary>
          <ul className="mt-3 grid list-none grid-cols-1 gap-x-6 gap-y-1.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {tail.map((r, i) => (
              <li {...r.publication?.attributes} key={r.ticker} className="flex items-baseline gap-2 text-sm">
                <span className="w-8 shrink-0 text-right font-data text-xs tabular-nums text-[var(--tt-faint)]">{TOP_N + i + 1}</span>
                <OptionalLink href={availableStockHref(lang, r.ticker, availableStocks)} className="min-w-0 truncate text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">
                  {stockDisplayName(lang, r.ticker, cleanIssuer(r.issuer))}
                  <span className="ml-1.5 font-code text-xs text-[var(--tt-faint)]">{r.ticker}</span>
                  <span className="ml-1 font-data text-xs text-[var(--tt-faint)]">{unit(r)}</span>
                  {r.marginPct != null && r.marginPct > 0 ? (
                    r.reliable ? (
                      <span className="ml-1.5 font-data text-xs text-[var(--val-below)]">{fmtMarginPct(r.marginPct)}</span>
                    ) : (
                      // 与表头列同一诚实口径:红旗票的安全边际弱化 + ⚠,不冒充分确认便宜。
                      <span
                        className="ml-1.5 font-data text-xs text-[var(--tt-faint)]"
                        title={isZh ? "估值带红旗（盈利下滑/高杠杆/模型不稳/每股口径疑错），边际不可信，未计入便宜信号。" : "Valuation flagged (declining earnings / high leverage / model instability / per-share doubt); margin not trustworthy, excluded from the cheap signal."}
                      >
                        {fmtMarginPct(r.marginPct)}<span aria-hidden className="ml-0.5 text-[var(--tt-warn)]">⚠</span>
                      </span>
                    )
                  ) : null}
                </OptionalLink>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
