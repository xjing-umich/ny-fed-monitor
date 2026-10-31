import React from "react";
import type { Holding, HoldingChange } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { holdingKey } from "@/lib/managers/assemble";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityName } from "@/components/common/EntityName";
import { WeightBar } from "@/components/investor/WeightBar";
import { ValuationBadge } from "@/components/valuation/ValuationBadge";
import { SectionHeading } from "@/components/common/SectionHeading";
import type { RowSignal } from "@/lib/managers/rowSignals";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import { latestIsoDate, valuationAsOfText } from "@/lib/valuation/asOf";
import { holdingsSplit, quarterCell } from "@/lib/managers/investorConclusion";
import { availableStockHref } from "@/lib/stocks/stockLinks";
import { formatUSD } from "@/lib/format";

const HOLD_COPY = {
  zh: {
    title: "持仓明细",
    cols: { issuer: "标的", quarter: "持仓数量变动", value: "持仓市值", weight: "占比", valuation: "估值", consensus: "持有人数" },
    lonely: "独门",
    more: (n: number) => `展开其余 ${n} 只`,
    overflow: (n: number) => `其余 ${n} 只见 SEC 原文`,
  },
  en: {
    title: "Holdings",
    cols: { issuer: "Security", quarter: "Position-size change", value: "Holding value", weight: "Weight", valuation: "Valuation", consensus: "Holders" },
    lonely: "Rarely held",
    more: (n: number) => `Show ${n} more`,
    overflow: (n: number) => `${n} more in the SEC filing`,
  },
} as const;

export function InvestorHoldingsTable({ holdings, lang, cusipToTicker, verdicts, holderCounts, rowSignals, changeByKey, hasPrior, lonelyTickers, filingUrl, availableStocks }: {
  holdings: Holding[];
  lang: Lang;
  cusipToTicker: Map<string, string>;
  verdicts: Map<string, SnapshotVerdict>;
  holderCounts: Map<string, number>;
  rowSignals: Map<string, RowSignal>;
  changeByKey: Map<string, HoldingChange>;
  hasPrior: boolean;
  lonelyTickers: Set<string>;
  filingUrl: string;
  availableStocks: ReadonlySet<string>;
}): React.ReactElement {
  const t = HOLD_COPY[lang];
  // 估值列读的是估值快照:标出它用的是哪天的收盘价(快照 + ISR 可能落后页面其余数据几天)。
  const valuationAsOf = valuationAsOfText(lang, latestIsoDate([...verdicts.values()].map((v) => v.priceDate)));
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const { shown, folded, overflow } = holdingsSplit(sorted);

  const columns: Column<Holding>[] = [
    {
      key: "issuer",
      header: t.cols.issuer,
      role: "primary",
      cell: (h) => {
        const tk = cusipToTicker.get(h.cusip);
        // 名字下方小标签:长期信号(连续增持/长期核心/从不减持)+ 独门。"重磅新建/增持"与本季列重复,不再写。
        const sig = rowSignals.get(h.cusip)?.conviction;
        const tags = [
          ...(sig && sig.signal !== "fresh_conviction" && !h.putCall ? [sig.label] : []),
          ...(tk && !h.putCall && lonelyTickers.has(tk.toUpperCase()) ? [t.lonely] : []),
        ];
        return (
          <span className="inline-flex min-w-0 max-w-full flex-col gap-0.5">
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
              <EntityName issuer={h.issuer} ticker={tk ?? h.cusip} lang={lang} />
              {h.putCall && (
                <span
                  className={`shrink-0 rounded-sm px-1 py-0.5 font-data text-xs border border-current/40 ${h.putCall === "Put" ? "text-[var(--tt-warn)]" : "text-[var(--tt-muted)]"}`}
                  title={lang === "zh" ? "期权:市值为标的名义价值,非权利金" : "Option: value is notional, not premium"}
                >
                  {lang === "zh" ? (h.putCall === "Put" ? "看跌期权" : "看涨期权") : h.putCall === "Put" ? "PUT" : "CALL"}
                </span>
              )}
            </span>
            {tags.length > 0 && <span className="font-data text-xs text-[var(--tt-faint)]">{tags.join(" · ")}</span>}
          </span>
        );
      },
    },
    {
      key: "quarter",
      header: t.cols.quarter,
      align: "right",
      width: "w-24",
      cell: (h) => {
        const q = quarterCell(changeByKey.get(holdingKey(h)), hasPrior, lang);
        return <span className="font-data text-xs tabular-nums text-[var(--tt-muted)]" title={q.title}>{q.text}</span>;
      },
    },
    {
      key: "value",
      header: lang === "zh" ? `${t.cols.value}(美元)` : t.cols.value,
      align: "right",
      width: "w-32",
      cell: (h) => <span className="inline-flex flex-col items-end">
        <span>{formatUSD(h.value, lang, "table")}</span>
        {h.putCall && <span className="text-xs text-[var(--tt-muted)]">{lang === "zh" ? "名义价值" : "Notional value"}</span>}
      </span>,
    },
    {
      key: "weight",
      header: t.cols.weight,
      align: "right",
      width: "w-40",
      cell: (h) => h.putCall ? <span className="text-[var(--tt-faint)]">—</span> : <WeightBar weight={h.weight ?? null} />,
    },
    {
      key: "valuation",
      header: t.cols.valuation,
      align: "right",
      width: "w-32",
      cell: (h) => {
        const tk = cusipToTicker.get(h.cusip);
        // 无代码(非美股/未映射)→ 估值列不适用,写 —,不写“未评估”
        if (!tk) return <span className="text-[var(--tt-faint)]">—</span>;
        return <ValuationBadge verdict={verdicts.get(tk.toUpperCase())} lang={lang} density="table" />;
      },
    },
    {
      key: "consensus",
      header: t.cols.consensus,
      align: "right",
      width: "w-24",
      cell: (h) => {
        const tk = cusipToTicker.get(h.cusip);
        const c = tk ? holderCounts.get(tk.toUpperCase()) : undefined;
        return c != null
          ? <span className="font-data tabular-nums text-[var(--tt-muted)]">{c}</span>
          : <span className="text-[var(--tt-faint)]">—</span>;
      },
    },
  ];

  const table = (rows: Holding[]) => (
    <DataTable
      columns={columns}
      rows={rows}
      getKey={(h) => holdingKey(h)}
      rowHref={(h) => {
        const tk = cusipToTicker.get(h.cusip);
        return availableStockHref(lang, tk ?? h.cusip, availableStocks);
      }}
      breakpoint="lg"
    />
  );

  return (
    <section id="holdings" aria-label={t.title} className="scroll-mt-32">
      <SectionHeading
        eyebrow={lang === "zh" ? "SEC 13F · 申报持仓" : "SEC 13F · filing holdings"}
        title={t.title}
        trailing={valuationAsOf ? <span className="font-data text-xs text-[var(--tt-faint)]">{valuationAsOf}</span> : undefined}
      />
      <p className="mt-3 text-sm text-[var(--tt-text)]">
        {lang === "zh" ? "持仓数量变动为较上季申报股数或份额的变化，已知拆股已调整。" : "Position-size change compares reported shares or units with the prior filing, adjusted for known splits."}
      </p>
      {holdings.some((h) => h.putCall) && <p className="mt-2 text-sm text-[var(--tt-text)]">
        {lang === "zh" ? "期权列示标的名义价值，不是权利金，也不计入组合市值及持仓数。" : "Options show underlying notional value, not premium, and are excluded from portfolio value and position count."}
      </p>}
      <div className="mt-3">{table(shown)}</div>
      {folded.length > 0 && (
        <details className="mt-2">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-sm text-[var(--tt-muted)] hover:text-[var(--tt-text)]">
            {t.more(folded.length)}
          </summary>
          <div className="mt-2">{table(folded)}</div>
        </details>
      )}
      {overflow > 0 && (
        <p className="mt-2 text-xs text-[var(--tt-muted)]">
          <a href={filingUrl} className="text-[var(--tt-text)]" rel="noopener noreferrer" target="_blank">{t.overflow(overflow)}</a>
        </p>
      )}
    </section>
  );
}
