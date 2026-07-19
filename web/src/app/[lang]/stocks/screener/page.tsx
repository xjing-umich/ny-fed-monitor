import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { altFor } from "@/lib/seo";
import { localePath } from "@/lib/urls";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { readValuationScreen, type ScreenView } from "@/lib/valuation/valuationSnapshot";
import { ScreenerTable } from "./ScreenerTable";
import { parseSort, sortScreenerRows, type ScreenSort } from "@/lib/valuation/screenerSort";
import { stockGlossary, stockUi } from "@/lib/stocks/stockCopy";

export const revalidate = 86400;

const SCREEN_LIMIT = 200;

function parseView(v: string | undefined): ScreenView {
  return v === "strike_zone" || v === "below" ? v : "all";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const alternates = altFor(lang, "/stocks/screener");
  return lang === "zh"
    ? {
        title: "个股 · 按价值带 — Compounder · 复利",
        description: "按现价相对保守价值带的位置筛选个股：哪些落在击球区、安全边际多少。位置观察，非买卖建议。",
        alternates,
      }
    : {
        title: "Stocks · By value — Compounder",
        description: "Browse stocks by where price sits against a conservative value band — which are in the strike zone, and by margin of safety. Observational, not advice.",
        alternates,
      };
}

const VIEWS: { key: ScreenView; zh: string; en: string }[] = [
  { key: "strike_zone", zh: "击球区", en: "Strike zone" },
  { key: "below", zh: "有安全边际", en: "Below value" },
  { key: "all", zh: "全部可估值", en: "All valued" },
];

export default async function ScreenerPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ view?: string; sort?: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";
  const g = stockGlossary(lang);
  const ui = stockUi(lang);
  const { view: rawView, sort: rawSort } = await searchParams;
  const view = parseView(rawView);
  const sort = parseSort(rawSort);

  const { rows, strikeTotal, computedAt } = await readValuationScreen(view, SCREEN_LIMIT);
  const sortedRows = sortScreenerRows(rows, sort);
  const asOf = computedAt ? computedAt.slice(0, 10) : "";

  const geo =
    strikeTotal > 0
      ? isZh
        ? `现在 ${strikeTotal} 只可估值股票落在击球区（现价低于保守价值带）${asOf ? `，截至 ${asOf}` : ""}。`
        : `${strikeTotal} valued stocks are in the strike zone (price below the conservative value band)${asOf ? `, as of ${asOf}` : ""}.`
      : isZh
        ? "当前没有可估值股票落在击球区（现价低于保守价值带，保守引擎常态）。"
        : "No valued stocks are in the strike zone (price below the conservative value band) right now.";

  const hrefFor = (k: ScreenView) => (k === "all" ? localePath(lang, "/stocks/screener") : localePath(lang, `/stocks/screener?view=${k}`));

  return (
    <>
      <SubNav lang={lang} section="stocks" active="screener" />

      <div className="mb-4">
        <PageHeader
          eyebrow={isZh ? "估值 · 按价值带" : "Valuation · by value band"}
          title={ui.stocksTitle}
          dateline={
            asOf ? (
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)]">
                {isZh ? `估值截至 ${asOf}` : `Valuation as of ${asOf}`}
              </span>
            ) : undefined
          }
          intro={
            isZh
              ? `按现价相对保守价值带的位置排序，安全边际高者在前。来源：公司财报与公开市场价格。${geo}`
              : `Ordered by where price sits against a conservative value band, deepest margin of safety first. Source: company filings and public market prices. ${geo}`
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
              className={`inline-flex items-center rounded-sm border px-2.5 py-1 max-sm:min-h-[44px] font-mono text-[11px] uppercase tracking-[0.08em] no-underline transition-colors ${
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
              aria-current={activeSort ? "page" : undefined}
              className={`inline-flex items-center rounded-sm border px-2.5 py-1 max-sm:min-h-[44px] font-mono text-[11px] uppercase tracking-[0.08em] no-underline transition-colors ${
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
      </nav>

      <ScreenerTable lang={lang} rows={sortedRows} />

      <p className="mt-8 text-xs leading-relaxed text-[var(--tt-muted)]">
        {isZh
          ? `估值${asOf ? `截至 ${asOf}` : "刷新中"} · 方法：保守 Greenwald 价值带 + Owner-Earnings DCF 两法夹逼。安全边际只是现价与保守价值带的距离，不含质量或时机判断；仅供参考，非投资建议。`
          : `Valuation ${asOf ? `as of ${asOf}` : "refreshing"} · method: conservative Greenwald value band + Owner-Earnings DCF. Margin of safety is the distance from the conservative value band, not a quality or timing judgment. For reference only, not investment advice.`}
      </p>
    </>
  );
}
