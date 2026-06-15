import React from "react";
import { notFound, redirect, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import { getCusipMap, tickerToCusips, getTickerExchangeMap } from "@/lib/managers/securities";
import { filingFreshness } from "@/lib/freshness/derive";
import type { Lang } from "@/lib/nav";
import { investorPath, stockPath } from "@/lib/urls";
import { resolveEntity, getEntityAliases } from "@/lib/aliases/resolve";
import { EntityPage } from "@/components/entity/EntityPage";
import { NewsletterCTA } from "@/components/entity/NewsletterCTA";
import { ExternalFinanceLinks } from "@/components/entity/ExternalFinanceLinks";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { DataTable, type Column } from "@/components/common/DataTable";
import { buildStockProse } from "@/lib/stocks/stockProse";
import { StockProse } from "@/components/entity/StockProse";
import { getSecCompanyData } from "@/lib/sec/read";
import { fundamentalsToFloorInput, computeValuationFloor } from "@/lib/valuation";
import { EarningsPowerFloorCard } from "@/components/valuation/EarningsPowerFloorCard";

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
    ? { title: `${issuer}（${ticker}）股票 — 谁在持有 | Compounder · 复利`,
        description: `谁在持有 ${issuer}（${ticker}）？查看机构 13F 持仓明细、仓位大小与持有分布（数据来自 SEC 申报）。`, alternates }
    : { title: `${issuer} (${ticker}) Stock — Who's Holding | Compounder`,
        description: `Which superinvestors hold ${issuer} (${ticker})? See institutional 13F holders, position sizes, and ownership from SEC filings.`, alternates };
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
  },
  en: {
    title: "Superinvestors Holding This Security",
    cols: {
      investor: "Investor",
      value: "Value",
      shares: "Shares",
      weight: "Weight",
    },
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

  // 本季对本票的动作(按持有人计, 每人一次, 含已清仓者): 复用已加载的 details.changes, 零新增 IO。
  const moves = { opened: 0, added: 0, trimmed: 0, exited: 0 };
  for (const { detail: d } of details) {
    if (!d) continue;
    const ch = d.changes.find((c) => targetCusips.has(c.cusip));
    if (!ch) continue;
    if (ch.kind === "new") moves.opened++;
    else if (ch.kind === "increased") moves.added++;
    else if (ch.kind === "decreased") moves.trimmed++;
    else if (ch.kind === "exited") moves.exited++;
  }

  // 确定性服务端正文(SEO 支柱 + 差异化): 复用已聚合的持有人/动向数据派生唯一正文。
  const stockProse = buildStockProse(
    { issuer, ticker, holders, totalValue, latestPeriod, moves },
    lang,
  );

  // 确定性估值地基(零价格依赖): 读入库基本面 → 两盏零增长 EPV + 有形资产地板 + 护城河读数。
  // 缺库/薄数据(<3 FY)时 computeValuationFloor 返回 undefined, 卡片自渲染为零空盒。
  const sec = await getSecCompanyData(ticker);
  const valuationResult = computeValuationFloor(
    fundamentalsToFloorInput(ticker, issuer, sec.annual),
  );
  // 单灯档(kind:"floor")才喂给卡片; per_share_unavailable 的卡片渲染留待后续任务。
  const valuationFloor =
    valuationResult && valuationResult.kind === "floor" ? valuationResult : undefined;

  const subtitle =
    lang === "zh"
      ? `${n} 位超级投资者持有 ${issuer}（${ticker}）。`
      : `Held by ${n} superinvestor${n === 1 ? "" : "s"} (${ticker}).`;

  const disclaimer =
    lang === "zh"
      ? "仅供教育与信息参考，不构成投资建议。13F 持仓为机构自行申报，可能滞后最多 45 天。"
      : "Educational data only — not investment advice. 13F positions are self-reported and can lag up to 45 days.";

  const exchange = (await getTickerExchangeMap()).get(ticker);

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

  // 个股别名外露:公司名变体 + 票代(CUSIP 不外露——非用户语义;中文名待 Tier 2)。
  const stockAliases = (await getEntityAliases("stock", ticker)).filter(
    (a) => a !== issuer && a !== ticker
  );
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: issuer,
    alternateName: [ticker, ...stockAliases],
    url: `https://thecompounder.fyi/${lang}/stocks/${ticker}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
      <EntityPage
        lang={lang}
        title={issuer}
        subtitle={subtitle}
        disclaimer={disclaimer}
        keyFacts={keyFacts}
        sources={[{ name: "SEC EDGAR 13F", asOf: latestFiledAt, status: filingFreshness(latestPeriod || null, new Date()) }]}
        related={related}
        footerCta={<NewsletterCTA lang={lang} />}
      >
        <>
          <StockProse paragraphs={stockProse} lang={lang} />
          {valuationFloor && (
            <section>
              {/* Section eyebrow — matches HoldersTable rhythm so the boxed
                  card reads as a deliberate "computed" section, not a stray box. */}
              <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
                <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                  {lang === "zh" ? "估值 · 地基层" : "Valuation"}
                </span>
              </div>
              <EarningsPowerFloorCard floor={valuationFloor} />
            </section>
          )}
          <HoldersTable holders={holders} lang={lang} />
        </>
      </EntityPage>
    </>
  );
}
