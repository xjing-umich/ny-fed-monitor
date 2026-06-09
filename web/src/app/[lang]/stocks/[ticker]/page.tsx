import React from "react";
import { notFound, redirect, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import { getCusipMap, tickerToCusips, getTickerExchangeMap } from "@/lib/managers/securities";
import { filingFreshness } from "@/lib/freshness/derive";
import type { Lang } from "@/lib/nav";
import { investorPath, stockPath } from "@/lib/urls";
import { resolveEntity } from "@/lib/aliases/resolve";
import { EntityPage } from "@/components/entity/EntityPage";
import { ExternalFinanceLinks } from "@/components/entity/ExternalFinanceLinks";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { DataTable, type Column } from "@/components/common/DataTable";
import { getSecCompanyData } from "@/lib/sec/read";

// 预渲染共识热门个股(被最多机构持有的标的,几乎覆盖全部点击来源:首页/搜索/列表),
// 这些直接成为静态 HTML → CDN 秒开。冷门 ticker 不预渲染,靠 dynamicParams 按需渲染
// + 每小时 ISR 缓存。13F 季度级数据,1h 重验足够新鲜。
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams(): Promise<Array<{ lang: string; ticker: string }>> {
  const { mostHeld } = await import("@/lib/aggregations");
  const rows = await mostHeld(200);
  const tickers = [...new Set(rows.map((r) => r.cusip))].filter(Boolean);
  return tickers.flatMap((ticker) => [
    { lang: "en", ticker },
    { lang: "zh", ticker },
  ]);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; ticker: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, ticker } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";

  // ticker 下任一 cusip 的 issuer 名作展示
  const cusips = await tickerToCusips(ticker);
  const cusipMap = await getCusipMap();
  let issuer = ticker;
  for (const c of cusips) { const info = cusipMap.get(c); if (info?.name) { issuer = cleanIssuer(info.name); break; } }

  const l = lang === "en" ? "en" : "zh";
  const alternates = {
    canonical: `/${l}/stocks/${ticker}`,
    languages: { en: `/en/stocks/${ticker}`, "zh-CN": `/zh/stocks/${ticker}`, "x-default": `/en/stocks/${ticker}` },
  };
  return lang === "zh"
    ? { title: `${issuer}（${ticker}）— 谁在持有 / 机构持仓 — Compounder · 复利`,
        description: `查看持有 ${issuer}（${ticker}）的超级投资者，了解机构持仓分布。`, alternates }
    : { title: `${issuer} (${ticker}) — Who's Holding — Compounder · 复利`,
        description: `See which superinvestors hold ${issuer} (${ticker}) and their position sizes.`, alternates };
}

// ── Holders table ─────────────────────────────────────────────────────────────

type HolderRow = {
  person: string;
  slug: string;
  value: number;
  shares: number;
  weight: number | undefined;
};

const TABLE_COPY = {
  zh: {
    title: "持有该证券的超级投资者",
    cols: {
      investor: "投资人",
      value: "市值",
      shares: "持股",
      weight: "组合权重",
    },
    coming: "股票估值（内在价值 / DCF）数据即将上线",
  },
  en: {
    title: "Superinvestors Holding This Security",
    cols: {
      investor: "Investor",
      value: "Value",
      shares: "Shares",
      weight: "Weight",
    },
    coming: "Stock valuation (intrinsic value / DCF) coming soon.",
  },
} as const;

function HoldersTable({
  holders,
  lang,
}: {
  holders: HolderRow[];
  lang: Lang;
}): React.ReactElement {
  const t = TABLE_COPY[lang];
  const sorted = [...holders].sort((a, b) => b.value - a.value);

  const columns: Column<HolderRow>[] = [
    {
      key: "investor",
      header: t.cols.investor,
      role: "primary",
      cell: (r) => r.person,
    },
    {
      key: "value",
      header: t.cols.value,
      align: "right",
      width: "w-32",
      cell: (r) => formatUSD(r.value),
    },
    {
      key: "shares",
      header: t.cols.shares,
      align: "right",
      width: "w-32",
      cell: (r) => r.shares.toLocaleString(),
    },
    {
      key: "weight",
      header: t.cols.weight,
      align: "right",
      width: "w-24",
      cell: (r) => (r.weight != null ? `${(r.weight * 100).toFixed(2)}%` : "—"),
    },
  ];

  return (
    <section>
      {/* Section label with hairline rule */}
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.title}
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={sorted}
        getKey={(r) => r.slug}
        rowHref={(r) => investorPath(lang, r.slug)}
        breakpoint="lg"
      />
      <p className="mt-3 text-xs text-[var(--tt-faint)]">{t.coming}</p>
    </section>
  );
}

function compact(value: number | string | null | undefined) {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

function pct(value: number | string | null | undefined) {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${(num * 100).toFixed(1)}%`;
}

function SecFinancialTable({ rows, lang }: { rows: any[]; lang: Lang }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--tt-muted)]">{lang === "zh" ? "暂无可展示的 SEC 财务期间。" : "No SEC financial periods available."}</p>;
  }

  return (
    <div className="overflow-x-auto border border-[var(--tt-border)]">
      <table className="min-w-full text-sm">
        <thead className="bg-[var(--tt-surface)] text-[var(--tt-muted)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Period</th>
            <th className="px-3 py-2 text-right font-medium">Revenue</th>
            <th className="px-3 py-2 text-right font-medium">Gross profit</th>
            <th className="px-3 py-2 text-right font-medium">Operating income</th>
            <th className="px-3 py-2 text-right font-medium">Net income</th>
            <th className="px-3 py-2 text-right font-medium">OCF</th>
            <th className="px-3 py-2 text-right font-medium">CapEx</th>
            <th className="px-3 py-2 text-right font-medium">FCF</th>
            <th className="px-3 py-2 text-right font-medium">Cash</th>
            <th className="px-3 py-2 text-right font-medium">Debt</th>
            <th className="px-3 py-2 text-right font-medium">Equity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.form}-${row.period_end}-${row.fiscal_year}-${row.fiscal_period}`} className="border-t border-[var(--tt-border)]">
              <td className="px-3 py-2">{row.fiscal_period} {row.fiscal_year}</td>
              <td className="px-3 py-2 text-right">{compact(row.revenue)}</td>
              <td className="px-3 py-2 text-right">{compact(row.gross_profit)}</td>
              <td className="px-3 py-2 text-right">{compact(row.operating_income)}</td>
              <td className="px-3 py-2 text-right">{compact(row.net_income)}</td>
              <td className="px-3 py-2 text-right">{compact(row.operating_cash_flow)}</td>
              <td className="px-3 py-2 text-right">{compact(row.capex)}</td>
              <td className="px-3 py-2 text-right">{compact(row.free_cash_flow)}</td>
              <td className="px-3 py-2 text-right">{compact(row.cash_and_equivalents)}</td>
              <td className="px-3 py-2 text-right">{compact(row.total_debt)}</td>
              <td className="px-3 py-2 text-right">{compact(row.shareholders_equity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecFundamentalsPanel({ sec, lang }: { sec: Awaited<ReturnType<typeof getSecCompanyData>>; lang: Lang }) {
  if (!sec.company) {
    return (
      <section id="sec-fundamentals" className="border-t border-[var(--tt-border)] pt-6">
        <h2 className="font-display text-xl font-medium text-[var(--tt-text)]">SEC Fundamentals</h2>
        <p className="mt-2 text-sm text-[var(--tt-muted)]">
          {lang === "zh" ? "SEC 数据尚未同步。" : "SEC data has not been synced yet."}
        </p>
      </section>
    );
  }

  const latest = sec.latest;
  const missing = sec.annual[0]?.missing_fields ?? sec.quarterly[0]?.missing_fields ?? {};

  return (
    <section id="sec-fundamentals" className="space-y-6 border-t border-[var(--tt-border)] pt-6">
      <div>
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          SEC Fundamentals
        </span>
        <h2 className="mt-2 font-display text-2xl font-medium text-[var(--tt-text)]">
          {lang === "zh" ? "公司概览" : "Company overview"}
        </h2>
        {sec.company.is_foreign_issuer ? (
          <p className="mt-2 text-sm text-[var(--tt-muted)]">10-K/10-Q unavailable; use 20-F/6-K if available.</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Ticker", sec.company.ticker],
          ["Company", sec.company.company_name ?? "—"],
          ["CIK", sec.company.cik],
          ["Quality", latest?.quality_status ?? "unknown"],
          ["Revenue", compact(latest?.latest_revenue)],
          ["Revenue YoY", pct(latest?.latest_revenue_yoy)],
          ["Net margin", pct(latest?.latest_net_margin)],
          ["FCF margin", pct(latest?.latest_fcf_margin)],
        ].map(([label, value]) => (
          <div key={label} className="border border-[var(--tt-border)] p-3">
            <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--tt-faint)]">{label}</div>
            <div className="mt-1 text-sm text-[var(--tt-text)]">{value}</div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-3 font-display text-lg font-medium text-[var(--tt-text)]">{lang === "zh" ? "最新 10-K / 10-Q" : "Latest 10-K / 10-Q"}</h3>
        <div className="overflow-x-auto border border-[var(--tt-border)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--tt-surface)] text-[var(--tt-muted)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Form</th>
                <th className="px-3 py-2 text-right font-medium">Report date</th>
                <th className="px-3 py-2 text-right font-medium">Filing date</th>
                <th className="px-3 py-2 text-right font-medium">Fiscal year</th>
                <th className="px-3 py-2 text-right font-medium">Period</th>
                <th className="px-3 py-2 text-right font-medium">SEC</th>
              </tr>
            </thead>
            <tbody>
              {sec.filings.slice(0, 12).map((filing: any) => (
                <tr key={filing.accession_number} className="border-t border-[var(--tt-border)]">
                  <td className="px-3 py-2">{filing.form}</td>
                  <td className="px-3 py-2 text-right">{filing.report_date ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{filing.filing_date ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{filing.fiscal_year ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{filing.fiscal_period ?? "—"}</td>
                  <td className="px-3 py-2 text-right"><a className="underline" href={filing.filing_url}>Open</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-display text-lg font-medium text-[var(--tt-text)]">{lang === "zh" ? "年度财务" : "Annual financials"}</h3>
        <SecFinancialTable rows={sec.annual} lang={lang} />
      </div>

      <div>
        <h3 className="mb-3 font-display text-lg font-medium text-[var(--tt-text)]">{lang === "zh" ? "季度财务" : "Quarterly financials"}</h3>
        <SecFinancialTable rows={sec.quarterly} lang={lang} />
      </div>

      <div>
        <h3 className="mb-2 font-display text-lg font-medium text-[var(--tt-text)]">{lang === "zh" ? "质量检查" : "Quality check"}</h3>
        <p className="text-sm text-[var(--tt-muted)]">
          missing fields: {Object.keys(missing).join(", ") || "—"} · foreign issuer: {String(sec.company.is_foreign_issuer)}
        </p>
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StockTickerPage({
  params,
}: {
  params: Promise<{ lang: string; ticker: string }>;
}): Promise<React.ReactElement> {
  const { lang: rawLang, ticker: rawTicker } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  // 旧 CUSIP URL → 301 到 ticker(若该 cusip 已解析)
  const cusipMap = await getCusipMap();
  const asCusip = cusipMap.get(rawTicker);
  if (asCusip?.ticker && asCusip.ticker !== rawTicker) {
    redirect(`/${lang}/stocks/${asCusip.ticker}`);
  }

  // 别名解析:公司名等非票代别名(如 /stocks/apple)308 跳到 canonical ticker。
  // ticker 自指 no-op;无库(本地)→ 索引空 → null → 不跳,沿用原逻辑(spec §5.1)。
  const aliasHit = await resolveEntity("stock", rawTicker);
  if (aliasHit && aliasHit.canonicalSlug !== rawTicker) {
    permanentRedirect(stockPath(lang, aliasHit.canonicalSlug));
  }

  const ticker = rawTicker;
  // 该 ticker 下的全部 cusip(含历史)；若库为空(本地)或未解析, 回退把入参当作单个 cusip
  const cusipsForTicker = await tickerToCusips(ticker);
  const targetCusips = new Set(cusipsForTicker.length ? cusipsForTicker : [ticker]);

  const idx = await getManagerIndex();
  const holders: HolderRow[] = [];
  const issuerFreq: Record<string, number> = {};
  let latestFiledAt = "";
  let latestPeriod = "";

  // 并行读取全部 manager 详情(此前为串行 for-await,34 位投资者 × 每位 3 个查询
  // = ~100 次首尾相接的 DB 往返,是个股页"等几秒"的主因)。Promise.all 后等待时间
  // 由"累加"变为"取最慢一个",数量级下降。
  const details = await Promise.all(
    idx.managers.map(async (summary) => ({ summary, detail: await getManagerDetail(summary.slug) }))
  );
  for (const { summary, detail: d } of details) {
    if (!d) continue;
    const h = d.latest.holdings.find((holding) => targetCusips.has(holding.cusip));
    if (!h) continue;
    issuerFreq[h.issuer] = (issuerFreq[h.issuer] ?? 0) + 1;
    if (!latestFiledAt || d.latest.filedAt > latestFiledAt) latestFiledAt = d.latest.filedAt;
    if (!latestPeriod || d.latest.period > latestPeriod) latestPeriod = d.latest.period;
    holders.push({ person: summary.person, slug: summary.slug, value: h.value, shares: h.shares, weight: h.weight });
  }

  if (holders.length === 0) notFound();

  const issuer = cleanIssuer(Object.entries(issuerFreq).sort((a, b) => b[1] - a[1])[0][0]);
  const n = holders.length;
  const totalValue = holders.reduce((sum, r) => sum + r.value, 0);
  const topHolder = [...holders].sort((a, b) => b.value - a.value)[0];

  const subtitle =
    lang === "zh"
      ? `${n} 位超级投资者持有 ${issuer}（${ticker}）。股票估值数据即将上线。`
      : `Held by ${n} superinvestor${n === 1 ? "" : "s"} (${ticker}). Valuation data coming soon.`;

  const disclaimer =
    lang === "zh"
      ? "仅供教育与信息参考，不构成投资建议。13F 持仓为机构自行申报，可能滞后最多 45 天。"
      : "Educational data only — not investment advice. 13F positions are self-reported and can lag up to 45 days.";

  const exchange = (await getTickerExchangeMap()).get(ticker);
  const sec = await getSecCompanyData(ticker);

  const keyFacts = [
    { label: lang === "zh" ? "代码" : "Ticker", value: ticker },
    { label: lang === "zh" ? "持有人数" : "Holder count", value: String(n) },
    { label: lang === "zh" ? "合计市值" : "Total value held", value: formatUSD(totalValue) },
    { label: lang === "zh" ? "最大持有人" : "Largest holder", value: topHolder.person },
    // 外部数据出口(仅在以真实 ticker 命中时, 即该 ticker 已解析到 cusip 时显示)
    ...(cusipsForTicker.length > 0
      ? [{
          label: lang === "zh" ? "外部数据" : "External",
          value: "",
          node: (
            <ExternalFinanceLinks ticker={ticker} exchange={exchange} variant="detail" lang={lang} />
          ),
        }]
      : []),
  ];

  const related = [...holders]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((r) => ({ label: r.person, href: investorPath(lang, r.slug) }));

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: lang === "zh" ? "个股" : "Stocks", item: `https://thecompounder.fyi/${lang}/stocks` },
      { "@type": "ListItem", position: 2, name: issuer, item: `https://thecompounder.fyi/${lang}/stocks/${ticker}` },
    ],
  };

  // FAQ structured data — answers the canonical "who holds X?" query with the
  // actual holder list, the exact kind of factual Q&A AI engines cite.
  const holderNames = [...holders].sort((a, b) => b.value - a.value).map((h) => h.person);
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name:
          lang === "zh"
            ? `哪些超级投资者持有 ${issuer}（${ticker}）？`
            : `Which superinvestors hold ${issuer} (${ticker})?`,
        acceptedAnswer: {
          "@type": "Answer",
          text:
            lang === "zh"
              ? `根据最新 SEC 13F 披露，${n} 位超级投资者持有 ${issuer}（${ticker}）：${holderNames.join("、")}。合计市值约 ${formatUSD(totalValue)}，最大持有人为 ${topHolder.person}。`
              : `Per the latest SEC 13F filings, ${n} superinvestor${n === 1 ? "" : "s"} hold ${issuer} (${ticker}): ${holderNames.join(", ")}. Combined value held is about ${formatUSD(totalValue)}, with ${topHolder.person} the largest holder.`,
        },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <EntityPage
        lang={lang}
        title={issuer}
        subtitle={subtitle}
        disclaimer={disclaimer}
        keyFacts={keyFacts}
        sources={[{ name: "SEC EDGAR 13F", asOf: latestFiledAt, status: filingFreshness(latestPeriod || null, new Date()) }]}
        related={related}
      >
        <HoldersTable holders={holders} lang={lang} />
        <SecFundamentalsPanel sec={sec} lang={lang} />
      </EntityPage>
    </>
  );
}
