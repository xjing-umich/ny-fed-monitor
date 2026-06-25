import React from "react";
import Link from "next/link";
import { notFound, redirect, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import type { HoldingChange } from "@/lib/managers/types";
import { readStockHolders, readStockTrend } from "@/lib/managers/consensusRead";
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
import {
  fundamentalsToFloorInput,
  computeValuationFloor,
  deriveStrikeZone,
  deriveOeDcf,
  reconcileMethods,
} from "@/lib/valuation";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
import { EarningsPowerFloorCard } from "@/components/valuation/EarningsPowerFloorCard";
import { getLatestPrice } from "@/lib/managers/priceRead";
import { WeightQoQ } from "@/components/common/qoqDirection";
import { QuarterMovesPill } from "@/components/entity/QuarterMovesPill";
import { HolderTrend } from "@/components/entity/HolderTrend";
import { FoldedSection } from "@/components/entity/FoldedSection";

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
  /** 上季该持有人对本票的组合权重（无 prior / 本季新进 → undefined）。 */
  priorWeight: number | undefined;
  /** 本季对本票的动作口径（持股变动）；持平/无 prior → undefined。 */
  kind: HoldingChange["kind"] | undefined;
};

type ExitedHolder = { person: string; slug: string };

const TABLE_COPY = {
  zh: {
    title: "持有该证券的超级投资者",
    cols: {
      investor: "投资人",
      value: "市值",
      shares: "持股",
      weight: "权重(上季→本季)",
    },
    exitedTitle: (n: number) => `本季清仓 (${n})`,
    more: (n: number) => `… 等 ${n} 位`,
    showAll: (n: number) => `展开全部 ${n} 位持有人`,
  },
  en: {
    title: "Superinvestors Holding This Security",
    cols: {
      investor: "Investor",
      value: "Value",
      shares: "Shares",
      weight: "Weight (prev→now)",
    },
    exitedTitle: (n: number) => `Exited this quarter (${n})`,
    more: (n: number) => `… +${n} more`,
    showAll: (n: number) => `Show all ${n} holders`,
  },
} as const;

const EXIT_CAP = 12;
const HOLDERS_VISIBLE = 10;

function HoldersTable({
  holders,
  exited,
  lang,
}: {
  holders: HolderRow[];
  exited: ExitedHolder[];
  lang: Lang;
}): React.ReactElement {
  const t = TABLE_COPY[lang];
  const sorted = [...holders].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, HOLDERS_VISIBLE);
  const tail = sorted.slice(HOLDERS_VISIBLE);

  const columns: Column<HolderRow>[] = [
    { key: "investor", header: t.cols.investor, role: "primary", cell: (r) => r.person },
    { key: "value", header: t.cols.value, align: "right", width: "w-32", cell: (r) => formatUSD(r.value) },
    { key: "shares", header: t.cols.shares, align: "right", width: "w-32", hideOnMobile: true, cell: (r) => r.shares.toLocaleString() },
    { key: "weight", header: t.cols.weight, align: "right", width: "w-40", cell: (r) => <WeightQoQ cur={r.weight} prior={r.priorWeight} kind={r.kind} lang={lang} /> },
  ];

  return (
    <section>
      {/* 支柱②标题:语义 h2(文档大纲),视觉沿用 eyebrow */}
      <h2 className="border-t border-[var(--tt-border)] pt-4 pb-3 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
        {t.title}
      </h2>
      <DataTable
        columns={columns}
        rows={head}
        getKey={(r) => r.slug}
        rowHref={(r) => investorPath(lang, r.slug)}
        breakpoint="lg"
      />

      {/* 溢出行:全部留 DOM,默认折叠(原生 <details>,零 JS) */}
      {tail.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)] hover:text-[var(--tt-accent)] [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">{t.showAll(sorted.length)} ▸</span>
            <span className="hidden group-open:inline">{t.title} ▾</span>
          </summary>
          <DataTable
            columns={columns}
            rows={tail}
            getKey={(r) => r.slug}
            rowHref={(r) => investorPath(lang, r.slug)}
            breakpoint="lg"
          />
        </details>
      )}

      {/* 本季清仓:表底 chip 列表;空 → 不渲染 */}
      {exited.length > 0 && (
        <div className="mt-4 border-t border-[var(--tt-border)] pt-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--tt-negative)]">
            {t.exitedTitle(exited.length)}
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {exited.slice(0, EXIT_CAP).map((e) => (
              <Link
                key={e.slug}
                href={investorPath(lang, e.slug)}
                className="inline-flex items-center rounded-full border border-[var(--tt-border)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-muted)] no-underline transition-colors hover:border-[var(--tt-accent)] hover:text-[var(--tt-accent)]"
              >
                {e.person}
              </Link>
            ))}
            {exited.length > EXIT_CAP && (
              <span className="self-center text-[var(--tt-faint)] text-xs">{t.more(exited.length - EXIT_CAP)}</span>
            )}
          </div>
        </div>
      )}
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
  const holders: HolderRow[] = [];
  const issuerFreq: Record<string, number> = {};
  const moves = { opened: 0, added: 0, trimmed: 0, exited: 0 };
  const exitedHolders: ExitedHolder[] = [];
  let trendSeries: number[] = [];
  let latestFiledAt = "";
  let latestPeriod = "";

  // 快路径: ticker-keyed 快照(consensus_stock_holders + consensus_stock_trend),取代对 34 户
  // 逐个 getManagerDetail 的 ~100 次/页往返。快照未部署/未填充(空)→ 回退逐户扫描(行为不变)。
  const snap = await readStockHolders(ticker);

  if (snap && snap.length > 0) {
    for (const r of snap) {
      if (r.filedAt && r.filedAt > latestFiledAt) latestFiledAt = r.filedAt;
      if (r.period && r.period > latestPeriod) latestPeriod = r.period;
      // 清仓行: 仅计数 + 收进表底 chip 列表, 不进持有人表。
      if (r.kind === "exited") { moves.exited++; exitedHolders.push({ person: r.person, slug: r.slug }); continue; }
      issuerFreq[r.issuer] = (issuerFreq[r.issuer] ?? 0) + 1;
      if (r.kind === "new") moves.opened++;
      else if (r.kind === "increased") moves.added++;
      else if (r.kind === "decreased") moves.trimmed++;
      holders.push({ person: r.person, slug: r.slug, value: r.value, shares: r.shares, weight: r.weight, priorWeight: r.priorWeight, kind: r.kind ?? undefined });
    }
    trendSeries = (await readStockTrend(ticker)) ?? [];
  } else {
    // 回退: 逐户扫描(快照不可用时, 行为与 PR#72 逐户版完全一致)。
    // targetCusips: 该 ticker 下全部 cusip(含历史); 库为空/未解析则把入参当单个 cusip。
    const targetCusips = new Set(cusipsForTicker.length ? cusipsForTicker : [ticker]);
    const idx = await getManagerIndex();
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
      // QoQ 口径(零新增 IO)：上季同票权重取自 d.prior，本季动作 kind 取自 d.changes。
      const priorWeight = d.prior?.holdings.find((p) => targetCusips.has(p.cusip))?.weight;
      const kind = d.changes.find((c) => targetCusips.has(c.cusip))?.kind;
      holders.push({ person: summary.person, slug: summary.slug, value: h.value, shares: h.shares, weight: h.weight, priorWeight, kind });
    }
    // 本季动作 + 清仓 chip(按持有人计, 含已清仓者): 复用已加载的 details.changes, 零新增 IO。
    for (const { summary, detail: d } of details) {
      if (!d) continue;
      const ch = d.changes.find((c) => targetCusips.has(c.cusip));
      if (!ch) continue;
      if (ch.kind === "new") moves.opened++;
      else if (ch.kind === "increased") moves.added++;
      else if (ch.kind === "decreased") moves.trimmed++;
      else if (ch.kind === "exited") { moves.exited++; exitedHolders.push({ person: summary.person, slug: summary.slug }); }
    }
    // 持有人数趋势: 跨全部 manager 的 filings 历史, 按 period 统计持有本票的人数; 升序取最近 8 季。
    const periodCounts = new Map<string, number>();
    for (const { detail: d } of details) {
      if (!d) continue;
      for (const f of d.filings) {
        if (f.holdings.some((h) => targetCusips.has(h.cusip))) {
          periodCounts.set(f.period, (periodCounts.get(f.period) ?? 0) + 1);
        }
      }
    }
    trendSeries = [...periodCounts.keys()].sort().slice(-8).map((p) => periodCounts.get(p)!);
  }

  if (holders.length === 0) notFound();

  const issuer = cleanIssuer(Object.entries(issuerFreq).sort((a, b) => b[1] - a[1])[0][0]);
  const n = holders.length;
  const totalValue = holders.reduce((sum, r) => sum + r.value, 0);
  const topHolder = [...holders].sort((a, b) => b.value - a.value)[0];

  // 确定性服务端正文(SEO 支柱 + 差异化): 复用已聚合的持有人/动向数据派生唯一正文。
  const stockProse = buildStockProse(
    { issuer, ticker, holders, totalValue, latestPeriod, moves },
    lang,
  );

  // 确定性估值地基(零价格依赖): 读入库基本面 → 两盏零增长 EPV + 有形资产地板 + 护城河读数。
  // 薄数据(<3 盈利年)→ undefined 不渲染; 多股权无股数 → per_share_unavailable, 卡片诚实标注;
  // 无营业利润(金融) → 单灯档。卡片按 kind 自行分支。
  const sec = await getSecCompanyData(ticker);
  const floorInput = fundamentalsToFloorInput(ticker, issuer, sec.annual);
  const valuationFloor = computeValuationFloor(floorInput);

  // Strike zone (price vs floor): only when a real per-share floor exists.
  // Multi-class (per_share_unavailable) / thin (undefined) skip the price hit.
  // No env / no price row → getLatestPrice returns null → deriveStrikeZone → undefined → price-vs-floor sub-block omitted (the floor card/section still render).
  const latestPrice = valuationFloor?.kind === "floor" ? await getLatestPrice(ticker) : null;
  const strikeZone =
    valuationFloor?.kind === "floor" ? deriveStrikeZone(valuationFloor, latestPrice) : undefined;

  // Second intrinsic-value method (Buffett owner-earnings DCF) + two-method cross-check.
  // DGS10 read is best-effort; null → DCF uses the 8–10% fallback band (flagged in-card).
  const dgs10 = valuationFloor?.kind === "floor" ? await getLatestDgs10() : null;
  const oeDcf =
    valuationFloor?.kind === "floor"
      ? deriveOeDcf(valuationFloor, floorInput.years, dgs10, latestPrice)
      : undefined;
  const reconciliation =
    valuationFloor?.kind === "floor"
      ? reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, latestPrice)
      : undefined;

  const subtitle =
    lang === "zh"
      ? `${n} 位超级投资者持有 ${issuer}（${ticker}）。`
      : `Held by ${n} superinvestor${n === 1 ? "" : "s"} (${ticker}).`;

  const disclaimer =
    lang === "zh"
      ? "仅供教育与信息参考，不构成投资建议。13F 持仓为机构自行申报，可能滞后最多 45 天。"
      : "Educational data only — not investment advice. 13F positions are self-reported and can lag up to 45 days.";

  const exchange = (await getTickerExchangeMap()).get(ticker);

  const factLabels =
    lang === "zh"
      ? { ticker: "代码", total: "合计市值", largest: "最大持有人", ext: "外部数据" }
      : { ticker: "Ticker", total: "Total value held", largest: "Largest holder", ext: "External" };
  const keyFactsNode = (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-[var(--tt-faint)]">{factLabels.ticker}</dt>
        <dd className="font-mono tabular-nums text-[var(--tt-text)]">{ticker}</dd>
      </div>
      <div>
        <dt className="text-[var(--tt-faint)]">{factLabels.total}</dt>
        <dd className="font-mono tabular-nums text-[var(--tt-text)]">{formatUSD(totalValue)}</dd>
      </div>
      <div>
        <dt className="text-[var(--tt-faint)]">{factLabels.largest}</dt>
        <dd className="text-[var(--tt-text)]">{topHolder.person}</dd>
      </div>
      {cusipsForTicker.length > 0 && (
        <div className="col-span-full">
          <dt className="text-[var(--tt-faint)]">{factLabels.ext}</dt>
          <dd className="mt-1">
            <ExternalFinanceLinks ticker={ticker} exchange={exchange} variant="detail" lang={lang} />
          </dd>
        </div>
      )}
    </dl>
  );

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
        notice={<QuarterMovesPill moves={moves} lang={lang} />}
        keyFacts={[]}
        sources={[{ name: "SEC EDGAR 13F", asOf: latestFiledAt, status: filingFreshness(latestPeriod || null, new Date()) }]}
        related={related}
        footerCta={<NewsletterCTA lang={lang} />}
      >
        <>
          {/* 支柱① 估值结论(头条) — 默认只显结论, 方法在卡内折叠 */}
          {valuationFloor && (
            <section>
              <h2 className="border-t border-[var(--tt-border)] pt-4 pb-3 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                {lang === "zh" ? "估值 · 地基层" : "Valuation"}
              </h2>
              <EarningsPowerFloorCard
                floor={valuationFloor}
                strikeZone={strikeZone}
                oeDcf={oeDcf}
                reconciliation={reconciliation}
                issuer={issuer}
                ticker={ticker}
              />
            </section>
          )}

          {/* 支柱② 谁在买 — Top 10 + 折叠溢出 */}
          <HoldersTable holders={holders} exited={exitedHolders} lang={lang} />

          {/* 佐证区(默认折叠, 内容留 DOM 供 SEO/GEO) */}
          <FoldedSection title={lang === "zh" ? "持有概览" : "Ownership overview"}>
            <StockProse paragraphs={stockProse} lang={lang} bare />
          </FoldedSection>

          {trendSeries.length >= 2 && (
            <FoldedSection title={lang === "zh" ? "持有人趋势" : "Holders over time"}>
              <HolderTrend series={trendSeries} lang={lang} bare />
            </FoldedSection>
          )}

          <FoldedSection title={lang === "zh" ? "关键事实与外部链接" : "Key facts & links"}>
            {keyFactsNode}
          </FoldedSection>
        </>
      </EntityPage>
    </>
  );
}
