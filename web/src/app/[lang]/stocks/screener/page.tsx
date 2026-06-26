import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import SubNav from "@/components/shell/SubNav";
import { readValuationScreen, type ScreenView } from "@/lib/valuation/valuationSnapshot";
import { ScreenerTable } from "./ScreenerTable";

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
  const alternates = {
    canonical: `/${lang}/stocks/screener`,
    languages: { en: "/en/stocks/screener", "zh-CN": "/zh/stocks/screener", "x-default": "/en/stocks/screener" },
  };
  return lang === "zh"
    ? {
        title: "个股 · 按价值带 — Compounder · 复利",
        description: "按现价相对保守价值带的位置筛选个股：哪些落在 strike zone、安全边际多少。位置观察，非买卖建议。",
        alternates,
      }
    : {
        title: "Stocks · By value — Compounder",
        description: "Browse stocks by where price sits against a conservative value band — which are in the strike zone, and by margin of safety. Observational, not advice.",
        alternates,
      };
}

const VIEWS: { key: ScreenView; zh: string; en: string }[] = [
  { key: "strike_zone", zh: "进入区", en: "Strike zone" },
  { key: "below", zh: "有安全边际", en: "Below value" },
  { key: "all", zh: "全部可估值", en: "All valued" },
];

export default async function ScreenerPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";
  const { view: rawView } = await searchParams;
  const view = parseView(rawView);

  const { rows, strikeTotal, computedAt } = await readValuationScreen(view, SCREEN_LIMIT);
  const asOf = computedAt ? computedAt.slice(0, 10) : "";

  const geo =
    strikeTotal > 0
      ? isZh
        ? `现在 ${strikeTotal} 只可估值股票落在 strike zone（现价低于保守价值带）${asOf ? `，截至 ${asOf}` : ""}。`
        : `${strikeTotal} valued stocks are in the strike zone (price below the conservative value band)${asOf ? `, as of ${asOf}` : ""}.`
      : isZh
        ? "当前没有可估值股票落在 strike zone（保守引擎常态）。"
        : "No valued stocks are in the strike zone right now (typical for a conservative engine).";

  const hrefFor = (k: ScreenView) => (k === "all" ? `/${lang}/stocks/screener` : `/${lang}/stocks/screener?view=${k}`);

  return (
    <div className="mx-auto max-w-5xl px-2 py-8 sm:py-10">
      <SubNav lang={lang} section="stocks" active="screener" />

      <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {isZh ? "个股" : "Stocks"}
          <span className="mx-2 text-[var(--tt-faint)]">·</span>
          <span className="text-[var(--tt-muted)]">{isZh ? "按价值带" : "By value"}</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--tt-muted)]">
          {isZh
            ? "按现价相对保守价值带的位置排序，安全边际高者在前。来源：SEC 基本面 + 公开市场价格。"
            : "Ordered by where price sits against a conservative value band, deepest margin of safety first. Source: SEC fundamentals + public market prices."}
        </p>
        <p className="mt-3 text-sm text-[var(--tt-text)]">{geo}</p>
      </div>

      {/* 预设子视图分段控件(纯 Link, 零 JS) */}
      <nav className="mb-5 flex flex-wrap gap-2" aria-label={isZh ? "视图" : "Views"}>
        {VIEWS.map((v) => {
          const activeView = v.key === view;
          return (
            <Link
              key={v.key}
              href={hrefFor(v.key)}
              aria-current={activeView ? "page" : undefined}
              className={`rounded-sm border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] no-underline transition-colors ${
                activeView
                  ? "border-[var(--tt-text)] text-[var(--tt-text)]"
                  : "border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-accent)]"
              }`}
            >
              {isZh ? v.zh : v.en}
            </Link>
          );
        })}
      </nav>

      {/* 醒目内联免责(合规护栏) */}
      <p className="mb-5 rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-muted)_6%,transparent)] px-3 py-2 text-xs leading-relaxed text-[var(--tt-muted)]">
        {isZh
          ? "这是按保守估值位置排序的观察列表，非买卖建议、非目标价；安全边际只是现价与保守价值带的距离，不含质量或时机判断。"
          : "This is an observational list ordered by valuation position — not advice, not a price target. Margin of safety is the distance from the conservative value band, and excludes any quality or timing judgment."}
      </p>

      <ScreenerTable lang={lang} rows={rows} />

      <p className="mt-8 text-xs leading-relaxed text-[var(--tt-faint)]">
        {isZh
          ? `估值${asOf ? `截至 ${asOf}` : "刷新中"} · 方法：保守 Greenwald 价值带 + Owner-Earnings DCF 两法夹逼。价格来自公开市场，基本面来自 SEC EDGAR。仅供参考，非投资建议。`
          : `Valuation ${asOf ? `as of ${asOf}` : "refreshing"} · method: conservative Greenwald value band + Owner-Earnings DCF. Prices from public markets, fundamentals from SEC EDGAR. For reference only, not investment advice.`}
      </p>
    </div>
  );
}
