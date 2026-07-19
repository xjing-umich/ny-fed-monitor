import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { stockPath } from "@/lib/urls";
import { formatUSD, cleanIssuer, fmtMarginPct } from "@/lib/format";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityName } from "@/components/common/EntityName";
import { stockGlossary, stockUi } from "@/lib/stocks/stockCopy";

export type StockRow = {
  ticker: string;
  issuer: string;
  holderCount: number;
  totalValue: number;
  /** 持有人数条宽(px),服务端按榜首归一化预算 */
  barWidth: number;
  /** 落在击球区/低于价值带(reliable)才非空 —— 稀有便宜高亮;服务端按前景闸预算 */
  bargain: { inStrikeZone: boolean; marginPct: number } | null;
};

// 稀有便宜绿标:击球区显 chip「击球区/Strike zone」+ 安全边际%;低于价值带(非严格击球区)只显绿%。
// 颜色不单独承义 —— 整体 aria-label 念全, chip/数字 aria-hidden。
function BargainMark({ bargain, lang }: { bargain: { inStrikeZone: boolean; marginPct: number }; lang: Lang }) {
  const isZh = lang === "zh";
  const pct = fmtMarginPct(bargain.marginPct);
  const label = bargain.inStrikeZone
    ? isZh ? `击球区，安全边际 ${pct}` : `In strike zone, margin of safety ${pct}`
    : isZh ? `低于价值带，安全边际 ${pct}` : `Below value band, margin of safety ${pct}`;
  return (
    <span className="inline-flex items-baseline gap-1.5" aria-label={label}>
      {bargain.inStrikeZone && (
        <span
          aria-hidden
          className="rounded-sm border border-[var(--tt-accent)] px-1 py-px font-mono text-[9px] uppercase leading-none tracking-[0.08em] text-[var(--tt-accent)]"
        >
          {isZh ? "击球区" : "Strike zone"}
        </span>
      )}
      <span aria-hidden className="font-mono text-[11px] tabular-nums text-[var(--tt-positive)]">
        {pct}
      </span>
    </span>
  );
}

// 前 N 名走完整富榜(响应式表 + 卡片);其余折叠为紧凑链接列表。
// 全部行均为服务端渲染:零 hydration JS、长尾不再"桌面表 + 移动卡"双份富渲染
// (那是 /stocks 4.3MB 的根因)。长尾仍是真 <a>,爬虫可见 → 不回退孤儿修复。
const TOP_N = 50;

export function StocksTable({
  lang,
  rows,
}: {
  lang: Lang;
  rows: StockRow[];
}) {
  const g = stockGlossary(lang);
  const ui = stockUi(lang);
  const head = rows.slice(0, TOP_N);
  const tail = rows.slice(TOP_N);

  // 榜单只回答"规模"——持有机构数与合计市值;基本面属个股详情页(参考 Google Finance 列表)。
  const columns: Column<StockRow>[] = [
    {
      key: "security",
      header: g.security,
      role: "primary",
      cell: (r) => (
        <span className="inline-flex items-baseline gap-2">
          <EntityName issuer={r.issuer} ticker={r.ticker} />
          {r.bargain ? <BargainMark bargain={r.bargain} lang={lang} /> : null}
        </span>
      ),
    },
    {
      key: "holders",
      header: g.holdersInstitution,
      align: "right",
      width: "w-20 sm:w-28",
      mobileLabel: g.holdersInstitutionShort,
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5 text-[var(--tt-text)]">
          <span
            className="inline-block h-1.5 rounded-full bg-[var(--tt-accent)] opacity-70"
            style={{ width: `${r.barWidth}px` }}
          />
          {r.holderCount}
        </span>
      ),
    },
    {
      key: "value",
      header: g.totalValue,
      align: "right",
      width: "w-24 sm:w-36",
      mobileLabel: g.totalValueShort,
      cell: (r) => formatUSD(r.totalValue),
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
      />

      {/* 长尾:原生 <details> 折叠的紧凑链接清单(零 JS);所有 <a> 仍在 SSR HTML 中,爬虫可见。 */}
      {tail.length > 0 && (
        <details className="group mt-4">
          <summary className="cursor-pointer list-none py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)] hover:text-[var(--tt-accent)] [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              {ui.showMore(tail.length)} ▸
            </span>
            <span className="hidden group-open:inline">
              {ui.collapse} ▾
            </span>
          </summary>
          <ul className="mt-3 grid list-none grid-cols-1 gap-x-6 gap-y-1.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {tail.map((r, i) => (
              <li key={r.ticker} className="flex items-baseline gap-2 text-sm">
                <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--tt-faint)]">
                  {TOP_N + i + 1}
                </span>
                <Link
                  href={stockPath(lang, r.ticker)}
                  className="min-w-0 truncate text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]"
                >
                  {cleanIssuer(r.issuer)}
                  <span className="ml-1.5 font-mono text-[11px] text-[var(--tt-faint)]">{r.ticker}</span>
                  {r.bargain ? (
                    <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[var(--tt-positive)]">
                      {fmtMarginPct(r.bargain.marginPct)}
                    </span>
                  ) : null}
                </Link>
                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[var(--tt-muted)]">
                  {r.holderCount}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
