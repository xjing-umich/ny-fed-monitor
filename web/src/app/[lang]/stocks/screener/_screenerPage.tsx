import { isLikelyTicker } from "@/lib/externalLinks";
import { stockPath } from "@/lib/urls";
import { date as formatDate } from "@/lib/i18n/format";
import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { altFor, ogFor, collectionLd, breadcrumbLd } from "@/lib/seo";
import { localePath } from "@/lib/urls";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { readValuationScreen, readConvictionScreen, type ScreenView } from "@/lib/valuation/valuationSnapshot";
import { ScreenerTable } from "./ScreenerTable";
import { sortScreenerRows, type ScreenSort } from "@/lib/valuation/screenerSort";
import { stockGlossary, stockUi } from "@/lib/stocks/stockCopy";
import { CONSENSUS_MIN } from "@/lib/managers/fusionSignal";
import { latestIsoDate, valuationAsOfText } from "@/lib/valuation/asOf";

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
          title: "个股 · 内在价值区间 — Compounder · 复利",
          description: "按现价相对内在价值的位置筛选个股：哪些落在击球区、安全边际多少。位置观察，非买卖建议。",
        }
      : {
          title: "Stocks · Intrinsic value range — Compounder",
          description: "Browse stocks by where price sits against intrinsic value — which are in the strike zone, and by margin of safety. Observational, not advice.",
        };
  return {
    ...meta,
    alternates,
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, "/stocks/screener") }),
  };
}

const VIEWS: { key: ScreenView; zh: string; en: string }[] = [
  // "重仓"指仓位重,这档实际是"多位超级投资者共同持有"(≥ CONSENSUS_MIN 位),跟仓位轻重无关。
  { key: "conviction", zh: "多人持有 · 按估值", en: "Most-held · by value" },
  { key: "strike_zone", zh: "击球区", en: "Strike zone" },
  // 现价低于内在价值不等于有安全边际(击球区才是),与英文同义。
  { key: "below", zh: "低于内在价值", en: "Below intrinsic value" },
  { key: "all", zh: "全部可估值", en: "All valued" },
];

export async function ScreenerPage({ lang, view, sort }: { lang: Lang; view: ScreenView; sort: ScreenSort }) {
  const isZh = lang === "zh";
  const g = stockGlossary(lang);
  const ui = stockUi(lang);

  const isConviction = view === "conviction";
  const screen = isConviction
    ? await readConvictionScreen()
    : await readValuationScreen(view);
  const rows = screen.rows;
  const computedAt = screen.computedAt;
  const strikeTotal = isConviction ? 0 : (screen as { strikeTotal: number }).strikeTotal;
  const strikePending = isConviction ? 0 : (screen as { strikePending: number }).strikePending;
  const heldTotal = isConviction ? (screen as { heldTotal: number }).heldTotal : 0;
  const sortedRows = isConviction ? rows : sortScreenerRows(rows, sort);
  // 估值锚定的是收盘价日期;computedAt 是任务跑完的 UTC 日期,美东晚上跑会显示成"明天"。
  // 只有行里都没有价格日期时才退回 computedAt,此时不写"收盘价"。
  const priceAsOf = latestIsoDate(rows.map((r) => r.priceDate));
  const asOf = priceAsOf ?? (computedAt ? computedAt.slice(0, 10) : "");

  const pendingNote = strikePending > 0
    ? isZh ? `，另 ${strikePending} 只待确认` : `; ${strikePending} more pending review`
    : "";
  const noValuationEvidence = rows.length === 0 && !computedAt && strikeTotal === 0 && strikePending === 0;
  const geo =
    noValuationEvidence
      ? ""
      : strikeTotal > 0
      ? isZh
        ? `现在 ${strikeTotal} 只可估值股票已确认落在击球区${pendingNote}（价格不高于内在价值扣除安全边际后的值）${asOf ? `，截至 ${formatDate(asOf, lang)}` : ""}。`
        : `${strikeTotal} valued stock${strikeTotal === 1 ? " is" : "s are"} confirmed in the strike zone${pendingNote} (price at or below intrinsic value minus a margin of safety)${asOf ? `, as of ${formatDate(asOf, lang)}` : ""}.`
      : isZh
        ? `当前没有已确认的击球区股票${pendingNote}（价格不高于内在价值扣除安全边际后的值）。`
        : `No valued stocks are confirmed in the strike zone right now${pendingNote} (price at or below intrinsic value minus a margin of safety).`;

  const convictionIntro = rows.length === 0 && heldTotal === 0
    ? isZh
      ? `查看至少被 ${CONSENSUS_MIN} 位机构共同持有的股票及其估值。`
      : `Compare valuations of stocks held by at least ${CONSENSUS_MIN} managers.`
    : isZh
    ? `${heldTotal} 只被 ${CONSENSUS_MIN}+ 位机构共同持有的股票，按现价相对内在价值的位置排序：便宜的在前。落在击球区且机构共识高的置顶。位置观察，非买卖建议。`
    : `${heldTotal} stocks held by ${CONSENSUS_MIN}+ managers, ordered by where price sits against intrinsic value — cheapest first. Those in the strike zone with high consensus rise to the top. Observational, not advice.`;

  const hrefFor = (k: ScreenView) => (k === "all" ? localePath(lang, "/stocks/screener") : localePath(lang, `/stocks/screener?view=${k}`));

  const path = localePath(lang, '/stocks/screener');
  const name = `${ui.stocksTitle} · ${VIEWS.find((v) => v.key === view)?.[isZh ? 'zh' : 'en'] ?? view}`;
  const ld = [collectionLd({ lang, path, name, description: isConviction ? convictionIntro : geo,
    items: sortedRows.filter((r) => isLikelyTicker(r.ticker)).map((r) => ({ name: `${r.issuer} (${r.ticker})`, path: stockPath(lang, r.ticker) })), limit: 100 }),
    breadcrumbLd(lang, [{ name: ui.stocksTitle, path: localePath(lang, '/stocks') }, { name: isZh ? '按价值区间' : 'By value range', path }])];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <SubNav lang={lang} section="stocks" active="screener" />

      <div className="mb-4">
        <PageHeader
          eyebrow={
            isConviction
              ? isZh
                ? "13F × 估值 · 多人持有"
                : "13F × valuation · most held"
              : isZh
                ? "估值 · 按价值区间"
                : "Valuation · by value range"
          }
          title={ui.stocksTitle}
          dateline={
            asOf ? (
              <span className="font-data text-xs text-[var(--tt-muted)]">
                {priceAsOf ? valuationAsOfText(lang, priceAsOf) : isZh ? `估值截至 ${formatDate(asOf, lang)}` : `Valuation as of ${formatDate(asOf, lang)}`}
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

      <ScreenerTable lang={lang} rows={sortedRows} highlight={isConviction} asOf={asOf} />
      {rows.length === 0 && <p className="mt-2 text-center text-sm">
        <Link href={localePath(lang, "/stocks")} className="inline-flex min-h-11 items-center text-[var(--tt-text)] underline underline-offset-4 hover:text-[var(--tt-accent)]">
          {isZh ? "按机构持仓浏览个股 →" : "Browse stocks by institutional holdings →"}
        </Link>
      </p>}

      <p className="mt-8 text-xs leading-relaxed text-[var(--tt-muted)]">
        {isZh
          ? `${asOf ? `估值截至 ${formatDate(asOf, lang)}` : "估值快照日期暂不可用"} · 方法：保守 Greenwald 价值区间 + Owner-Earnings DCF 两法夹逼。安全边际是现价相对内在价值的距离，不含质量或时机判断；仅供参考，非投资建议。`
          : `${asOf ? `Valuation as of ${formatDate(asOf, lang)}` : "Valuation snapshot date unavailable"} · method: conservative Greenwald value range + Owner-Earnings DCF. Margin of safety is the distance between the price and intrinsic value, not a quality or timing judgment. For reference only, not investment advice.`}
      </p>
    </>
  );
}
