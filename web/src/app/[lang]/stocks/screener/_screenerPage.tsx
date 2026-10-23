import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { altFor, ogFor } from "@/lib/seo";
import { localePath } from "@/lib/urls";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { readValuationScreen, readConvictionScreen, type ScreenView } from "@/lib/valuation/valuationSnapshot";
import { ScreenerTable } from "./ScreenerTable";
import { sortScreenerRows, type ScreenSort } from "@/lib/valuation/screenerSort";
import { stockGlossary, stockUi } from "@/lib/stocks/stockCopy";
import { CONSENSUS_MIN } from "@/lib/managers/fusionSignal";

const SCREEN_LIMIT = 200;

/**
 * screener 的视图 × 排序组合。公开 URL 仍是 `/stocks/screener?view=…&sort=…`,
 * 由 next.config.ts 的 rewrites 按 query 内部改写到 `/stocks/screener/[variant]`:
 * 读 searchParams 会让页面变成每请求动态渲染(~1.2MB/次,不进 CDN 缓存),
 * 改成路径段后每个组合都是可 ISR 缓存的静态页。默认组合(all + margin)即 /stocks/screener 本身。
 */
export const SCREENER_VARIANTS = [
  "strike_zone",
  "below",
  "conviction",
  "all-holders",
  "strike_zone-holders",
  "below-holders",
] as const;
export type ScreenerVariant = (typeof SCREENER_VARIANTS)[number];

export function parseVariant(v: string): { view: ScreenView; sort: ScreenSort } | null {
  if (!(SCREENER_VARIANTS as readonly string[]).includes(v)) return null;
  const [view, sort] = v.split("-");
  return { view: view as ScreenView, sort: sort === "holders" ? "holders" : "margin" };
}

export function screenerMetadata(lang: Lang): Metadata {
  const alternates = altFor(lang, "/stocks/screener");
  const meta =
    lang === "zh"
      ? {
          title: "个股 · 按价值带 — Compounder · 复利",
          description: "按现价相对保守价值带的位置筛选个股：哪些落在击球区、安全边际多少。位置观察，非买卖建议。",
        }
      : {
          title: "Stocks · By value — Compounder",
          description: "Browse stocks by where price sits against intrinsic value — which are in the strike zone, and by margin of safety. Observational, not advice.",
        };
  return {
    ...meta,
    alternates,
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, "/stocks/screener") }),
  };
}

const VIEWS: { key: ScreenView; zh: string; en: string }[] = [
  { key: "conviction", zh: "机构重仓 · 按估值", en: "Most-held · by value" },
  { key: "strike_zone", zh: "击球区", en: "Strike zone" },
  { key: "below", zh: "有安全边际", en: "Below intrinsic value" },
  { key: "all", zh: "全部可估值", en: "All valued" },
];

export async function ScreenerPage({ lang, view, sort }: { lang: Lang; view: ScreenView; sort: ScreenSort }) {
  const isZh = lang === "zh";
  const g = stockGlossary(lang);
  const ui = stockUi(lang);

  const isConviction = view === "conviction";
  const screen = isConviction
    ? await readConvictionScreen(SCREEN_LIMIT)
    : await readValuationScreen(view, SCREEN_LIMIT);
  const rows = screen.rows;
  const computedAt = screen.computedAt;
  const strikeTotal = isConviction ? 0 : (screen as { strikeTotal: number }).strikeTotal;
  const heldTotal = isConviction ? (screen as { heldTotal: number }).heldTotal : 0;
  const sortedRows = isConviction ? rows : sortScreenerRows(rows, sort);
  const asOf = computedAt ? computedAt.slice(0, 10) : "";

  const geo =
    strikeTotal > 0
      ? isZh
        ? `现在 ${strikeTotal} 只可估值股票落在击球区（价格低于买入线：内在价值扣除安全边际）${asOf ? `，截至 ${asOf}` : ""}。`
        : `${strikeTotal} valued stocks are in the strike zone (price below the buy line: intrinsic value minus a margin of safety)${asOf ? `, as of ${asOf}` : ""}.`
      : isZh
        ? "当前没有可估值股票落在击球区（价格低于买入线：内在价值扣除安全边际；保守引擎常态）。"
        : "No valued stocks are in the strike zone (price below the buy line: intrinsic value minus a margin of safety) right now.";

  const convictionIntro = isZh
    ? `${heldTotal} 只被 ${CONSENSUS_MIN}+ 位机构共同持有的股票，按现价相对内在价值的位置排序：便宜的在前。落在击球区且机构共识高的置顶。位置观察，非买卖建议。`
    : `${heldTotal} stocks held by ${CONSENSUS_MIN}+ managers, ordered by where price sits against intrinsic value — cheapest first. Those in the strike zone with high consensus rise to the top. Observational, not advice.`;

  const hrefFor = (k: ScreenView) => (k === "all" ? localePath(lang, "/stocks/screener") : localePath(lang, `/stocks/screener?view=${k}`));

  return (
    <>
      <SubNav lang={lang} section="stocks" active="screener" />

      <div className="mb-4">
        <PageHeader
          eyebrow={
            isConviction
              ? isZh
                ? "13F × 估值 · 机构重仓"
                : "13F × valuation · most held"
              : isZh
                ? "估值 · 按价值带"
                : "Valuation · by value band"
          }
          title={ui.stocksTitle}
          dateline={
            asOf ? (
              <span className="font-data text-xs text-[var(--tt-muted)]">
                {isZh ? `估值截至 ${asOf}` : `Valuation as of ${asOf}`}
              </span>
            ) : undefined
          }
          intro={
            isConviction
              ? convictionIntro
              : isZh
                ? `按现价相对内在价值的位置排序，安全边际高者在前。来源：公司财报与公开市场价格。${geo}`
                : `Ordered by where price sits against intrinsic value, deepest margin of safety first. Source: company filings and public market prices. ${geo}`
          }
        />
      </div>

      {/* 视图与排列控件(纯 Link, 零 JS) */}
      <nav className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2" aria-label={isZh ? "视图与排列" : "Views and ranking"}>
        <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => {
          const activeView = v.key === view;
          return (
            <Link
              key={v.key}
              href={hrefFor(v.key)}
              aria-current={activeView ? "page" : undefined}
              className={`inline-flex items-center rounded-sm border px-2.5 py-1 max-sm:min-h-[44px] font-data text-xs no-underline transition-colors ${
                activeView
                  ? "border-[var(--tt-text)] text-[var(--tt-text)]"
                  : "border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-accent)]"
              }`}
            >
              {isZh ? v.zh : v.en}
            </Link>
          );
        })}
        </div>
        {!isConviction && (
        <div className="flex flex-wrap gap-2 sm:border-l sm:border-[var(--tt-border)] sm:pl-3">
        {([
          { key: "margin" as ScreenSort, label: isZh ? "按安全边际" : "By margin" },
          { key: "holders" as ScreenSort, label: g.byHolders },
        ]).map((s) => {
          const activeSort = s.key === sort;
          const sp = new URLSearchParams();
          if (view !== "all") sp.set("view", view);
          if (s.key === "holders") sp.set("sort", "holders");
          const qs = sp.toString();
          return (
            <Link
              key={s.key}
              href={localePath(lang, `/stocks/screener${qs ? `?${qs}` : ""}`)}
              aria-current={activeSort ? "true" : undefined}
              className={`inline-flex items-center rounded-sm border px-2.5 py-1 max-sm:min-h-[44px] font-data text-xs no-underline transition-colors ${
                activeSort
                  ? "border-[var(--tt-text)] text-[var(--tt-text)]"
                  : "border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-accent)]"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
        </div>
        )}
      </nav>

      <ScreenerTable lang={lang} rows={sortedRows} highlight={isConviction} />

      <p className="mt-8 text-xs leading-relaxed text-[var(--tt-muted)]">
        {isZh
          ? `估值${asOf ? `截至 ${asOf}` : "刷新中"} · 方法：保守 Greenwald 价值带 + Owner-Earnings DCF 两法夹逼。安全边际只是现价与保守价值带的距离，不含质量或时机判断；仅供参考，非投资建议。`
          : `Valuation ${asOf ? `as of ${asOf}` : "refreshing"} · method: conservative Greenwald value band + Owner-Earnings DCF. Margin of safety is the distance from the conservative value band, not a quality or timing judgment. For reference only, not investment advice.`}
      </p>
    </>
  );
}
