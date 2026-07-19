import React from "react";
import Link from "next/link";
import { notFound, redirect, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import type { HoldingChange } from "@/lib/managers/types";
import { readStockHolders, readStockTrend, readCoOwnership } from "@/lib/managers/consensusRead";
import {
  getCusipMap,
  tickerToCusips,
  getTickerExchangeMap,
  getSecurityMeta,
} from "@/lib/managers/securities";
import { filingFreshness } from "@/lib/freshness/derive";
import type { Lang } from "@/lib/nav";
import { investorPath, stockPath, absoluteUrl, localePath } from "@/lib/urls";
import { resolveEntity, getEntityAliases } from "@/lib/aliases/resolve";
import { EntityPage } from "@/components/entity/EntityPage";
import { NewsletterCTA } from "@/components/entity/NewsletterCTA";
import { ExternalFinanceLinks } from "@/components/entity/ExternalFinanceLinks";
import { formatUSD, cleanIssuer, fmtMarginPct } from "@/lib/format";
import { altFor, ogFor, datasetLd } from "@/lib/seo";
import { DataTable, type Column } from "@/components/common/DataTable";
import { buildStockProse } from "@/lib/stocks/stockProse";
import { StockProse } from "@/components/entity/StockProse";
import { getSecCompanyData } from "@/lib/sec/read";
import {
  fundamentalsToFloorInput,
  resolveAds,
  isFundamentalsStale,
  isSplitCoverageStale,
  fundamentalsIntegrityViolated,
  runValuation,
} from "@/lib/valuation";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
import { EarningsPowerFloorCard } from "@/components/valuation/EarningsPowerFloorCard";
import { getLatestPrice, fmtPriceFact, getLatestSplit } from "@/lib/managers/priceRead";
import { WeightQoQ } from "@/components/common/qoqDirection";
import { QuarterMovesPill, type QuarterMoves } from "@/components/entity/QuarterMovesPill";
import { HolderTrend } from "@/components/entity/HolderTrend";
import { FoldedSection } from "@/components/entity/FoldedSection";
import { stockHandoffFor } from "@/lib/discovery/discoveryHandoff";
import { DiscoveryHandoff } from "@/components/discovery/DiscoveryHandoff";
import { LearnLink } from "@/components/common/LearnLink";
import { isLikelyTicker } from "@/lib/externalLinks";
import { valuationVerdictChip } from "@/lib/stocks/valuationVerdictChip";
import { PriceBetBlock, expectationsBadge } from "@/components/valuation/PriceBetBlock";
import { deriveBusinessQuality } from "@/lib/stocks/businessQuality";
import { stockGlossary, stockPageCopy, stockUi } from "@/lib/stocks/stockCopy";
import { Sparkline } from "@/components/common/Sparkline";
import { SectionHeading } from "@/components/common/SectionHeading";

// 预渲染共识热门个股(被最多机构持有的标的,几乎覆盖全部点击来源:首页/搜索/列表),
// 这些直接成为静态 HTML → CDN 秒开。冷门 ticker 不预渲染,靠 dynamicParams 按需渲染
// + 日级 ISR 缓存。13F 季度更、价格日更(页面只显示最新价),日级重验足够新鲜,
// 且避免几千个 ticker 页每小时各重验一次反复读库(egress)。
export const revalidate = 86400;
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

  const alternates = altFor(lang, `/stocks/${ticker}`);
  const meta =
    lang === "zh"
      ? { title: `${issuer}（${ticker}）股票 — 谁在持有 | Compounder · 复利`,
          description: `谁在持有 ${issuer}（${ticker}）？查看机构 13F 持仓明细、仓位大小与持有分布（数据来自 SEC 申报）。` }
      : { title: `${issuer} (${ticker}) Stock — Who's Holding | Compounder`,
          description: `Which superinvestors hold ${issuer} (${ticker})? See institutional 13F holders, position sizes, and ownership from SEC filings.` };
  return {
    ...meta,
    alternates,
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, `/stocks/${ticker}`) }),
  };
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
    meta: (n: number, total: string, opened: number, exited: number) =>
      `${n} 位持有 · 合计 ${total} · 本季 +${opened} 新建 / -${exited} 清仓`,
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
    meta: (n: number, total: string, opened: number, exited: number) =>
      `${n} holder${n === 1 ? "" : "s"} · ${total} combined · this quarter +${opened} opened / -${exited} exited`,
  },
} as const;

const EXIT_CAP = 12;
const HOLDERS_VISIBLE = 10;

function HoldersTable({
  issuer,
  ticker,
  holders,
  exited,
  totalValue,
  moves,
  lang,
  trend,
}: {
  issuer: string;
  ticker: string;
  holders: HolderRow[];
  exited: ExitedHolder[];
  totalValue: number;
  moves: QuarterMoves;
  lang: Lang;
  trend: number[];
}): React.ReactElement {
  const t = TABLE_COPY[lang];
  const ui = stockUi(lang);
  const page = stockPageCopy(lang);
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
      {/* 支柱②标题:绿眉标 → Fraunces 标题(语义 h2, 文档大纲/SEO) */}
      <SectionHeading
        eyebrow={page.holders.eyebrow}
        title={t.title}
      />
      <div className="mb-3 mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)]">
          {t.meta(sorted.length, formatUSD(totalValue), moves.opened, moves.exited)}
        </p>
        <QuarterMovesPill moves={moves} lang={lang} />
      </div>
      {trend.length >= 2 && (
        <div className="mb-3">
          <HolderTrend series={trend} lang={lang} variant="inline" />
        </div>
      )}
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
          <summary className="cursor-pointer list-none max-sm:flex max-sm:items-center max-sm:min-h-[44px] py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)] hover:text-[var(--tt-accent)] [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">{t.showAll(sorted.length)} ▸</span>
            <span className="hidden group-open:inline">{ui.collapse} ▾</span>
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
        <div className="mt-5 pt-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--tt-negative)]">
            {t.exitedTitle(exited.length)}
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {exited.slice(0, EXIT_CAP).map((e) => (
              <Link
                key={e.slug}
                href={investorPath(lang, e.slug)}
                className="inline-flex items-center rounded-md border border-[var(--tt-border)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-muted)] no-underline transition-colors hover:border-[var(--tt-accent)] hover:text-[var(--tt-accent)]"
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
  if (asCusip?.ticker && asCusip.ticker !== rawTicker && isLikelyTicker(asCusip.ticker)) {
    redirect(stockPath(lang, asCusip.ticker));
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
      const h = d.latest.holdings.find((holding) => !holding.putCall && targetCusips.has(holding.cusip));
      if (!h) continue;
      issuerFreq[h.issuer] = (issuerFreq[h.issuer] ?? 0) + 1;
      if (!latestFiledAt || d.latest.filedAt > latestFiledAt) latestFiledAt = d.latest.filedAt;
      if (!latestPeriod || d.latest.period > latestPeriod) latestPeriod = d.latest.period;
      // QoQ 口径(零新增 IO)：上季同票权重取自 d.prior，本季动作 kind 取自 d.changes。
      const priorWeight = d.prior?.holdings.find((p) => !p.putCall && targetCusips.has(p.cusip))?.weight;
      const kind = d.changes.find((c) => !c.putCall && targetCusips.has(c.cusip))?.kind;
      holders.push({ person: summary.person, slug: summary.slug, value: h.value, shares: h.shares, weight: h.weight, priorWeight, kind });
    }
    // 本季动作 + 清仓 chip(按持有人计, 含已清仓者): 复用已加载的 details.changes, 零新增 IO。
    for (const { summary, detail: d } of details) {
      if (!d) continue;
      const ch = d.changes.find((c) => !c.putCall && targetCusips.has(c.cusip));
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
        if (f.holdings.some((h) => !h.putCall && targetCusips.has(h.cusip))) {
          periodCounts.set(f.period, (periodCounts.get(f.period) ?? 0) + 1);
        }
      }
    }
    trendSeries = [...periodCounts.keys()].sort().slice(-8).map((p) => periodCounts.get(p)!);
  }

  if (holders.length === 0) notFound();

  const coOwned = await readCoOwnership(ticker);

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
  // ADR/ADS 归一化:ADR 用每 ADS 口径;ADR 但比例未策展 → 视同无地板(卡片走 no-floor 分支,不显示错带)。
  const { securityType, adsRatio } = await getSecurityMeta(ticker);
  const ads = resolveAds(securityType, adsRatio);
  // SIC 用于金融股(银行/保险)判定 → 引擎改用可持续增长率封顶而非扁平 moderate。
  // sec_companies.sic 可能是字符串或 null;安全转 number,NaN/null → undefined(不误触闸)。
  const sicRaw = sec.company?.sic;
  const sicNum = sicRaw == null ? undefined : Number(sicRaw);
  const sic = sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
  const floorInput = fundamentalsToFloorInput(ticker, issuer, sec.annual, ads.ratio, sic);
  // 基本面过期闸:与 ingest 同语义 — 最新 FY 期末超阈值 → 抑制估值(不造陈旧幻觉)。
  const fundamentalsStale = isFundamentalsStale(
    sec.annual?.[0]?.period_end ?? null,
    new Date().toISOString(),
  );

  // Always load market price for masthead keyFacts (V / BRK.B multi-class still show Price).
  // A stale quote is never used for valuation, but is still shown as the latest key fact.
  const fetchedPrice = await getLatestPrice(ticker);
  const latestPrice = fetchedPrice;
  const priceStale = fetchedPrice?.stale === true;
  const valuationPrice = priceStale ? null : fetchedPrice;

  // 拆股口径护栏:基本面 as-of 早于最近拆股 → 每股口径与拆股后价格错配,整条抑制估值判定。
  const latestSplitDate = await getLatestSplit(ticker);
  const splitCoverageStale = isSplitCoverageStale({
    fundamentalsAsOf: sec.annual?.[0]?.period_end ?? null,
    latestSplitDate,
  });

  // 基本面口径护栏:opInc>revenue / gross>revenue 物理不可能 → 数据损坏,整条抑制估值判定。
  const fundamentalsCorrupt = fundamentalsIntegrityViolated(floorInput.years);

  // Second intrinsic-value method (Buffett owner-earnings DCF) + two-method cross-check.
  // DGS10 read is best-effort; null → DCF uses the 9–11% fallback band (flagged in-card).
  const dgs10 = await getLatestDgs10();
  const run = runValuation({
    floorInput,
    price: valuationPrice,
    dgs10,
    guards: {
      adsSuppressed: ads.suppressed,
      fundamentalsStale,
      priceStale,
      splitCoverageStale,
      fundamentalsCorrupt,
    },
    suppressExpectations: false,
  });
  const { floor: valuationFloor, strikeZone, oeDcf, reconciliation } = run;
  const handoffVerdict = run.verdict;
  const capitalStructureDistorted =
    valuationFloor?.kind === "floor" && valuationFloor.moat_reading.capital_structure_distorted === true;

  // 反向 DCF 隐含预期(现价背后隐含的 owner-earnings 增速档位)。个股页全程实时计算(不读快照)。
  // 个股页即使 reliable=false 仍展示「价格在赌什么」(对照用,非确认便宜);ingest/快照仍可
  // 用 suppressed 闸聚合面——此处不写库。
  const expectations = run.expectations;

  // 生意质量(复用已加载 sec.latest/sec.annual, 零新查询)。null → 整节不渲染。
  const bq = deriveBusinessQuality({ latest: sec.latest, annual: sec.annual });

  // 安全边际 keyFact 只在"已确认便宜"时占位(reliable + 击球区/低于价值带)。
  const marginShown = !!(
    handoffVerdict &&
    handoffVerdict.reliable &&
    (handoffVerdict.inStrikeZone || handoffVerdict.bucket === "below") &&
    handoffVerdict.marginPct != null
  );

  // 估值区块 Fraunces 标题直接承载结论 —— bucket 与卡内 deriveValuationVerdict 同源, 永不漂移。
  // handoffVerdict 为 null(kind!=floor / 多股权 / 无地板)→ 卡走 CompactFloor 无状态 → 标题回退"估值"。
  const page = stockPageCopy(lang);
  const g = stockGlossary(lang);
  const ui = stockUi(lang);
  const valuationTitle = handoffVerdict
    ? handoffVerdict.bucket === "below"
      ? page.valuation.below
      : handoffVerdict.bucket === "within"
        ? page.valuation.within
        : page.valuation.above
    : page.valuation.titleFallback;

  const subtitle = page.subtitle(n);
  const disclaimer = page.disclaimer;

  const exchange = (await getTickerExchangeMap()).get(ticker);

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: page.breadcrumbStocks, item: absoluteUrl(localePath(lang, `/stocks`)) },
      { "@type": "ListItem", position: 2, name: issuer, item: absoluteUrl(localePath(lang, `/stocks/${ticker}`)) },
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
    url: absoluteUrl(localePath(lang, `/stocks/${ticker}`)),
  };

  // Dataset structured data — the stock's 13F holders table as a factual,
  // SEC-sourced dataset (GEO-friendly; mirrors the investor page's Dataset).
  const dataset = datasetLd({
    lang,
    name:
      lang === "zh"
        ? `${issuer}（${ticker}）的机构 13F 持有人`
        : `${issuer} (${ticker}) institutional 13F holders`,
    description:
      lang === "zh"
        ? `持有 ${issuer}（${ticker}）的超级投资者及其持股数量、市值与组合权重，来自 SEC 13F 季度申报。`
        : `Superinvestors holding ${issuer} (${ticker}) with share counts, market values, and portfolio weights, from quarterly SEC 13F filings.`,
    path: localePath(lang, `/stocks/${ticker}`),
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }} />
      <EntityPage
        lang={lang}
        title={issuer}
        titleMeta={ticker}
        subtitle={subtitle}
        disclaimer={disclaimer}
        topAction={
          <Link
            href={localePath(lang, "/stocks")}
            className="inline-block text-xs text-[var(--tt-faint)] no-underline transition-colors hover:text-[var(--tt-text)]"
          >
            {ui.backToStocks}
          </Link>
        }
        verdict={valuationVerdictChip(handoffVerdict, lang) ?? undefined}
        verdictExtra={expectationsBadge(expectations, lang) ?? undefined}
        keyFacts={[
          { label: page.price, value: fmtPriceFact(latestPrice) },
          // 安全边际只在"已确认便宜"(reliable + 击球区/低于价值带)时占位并显数字 ——
          // 高于价值 / 带内 / 红旗档不显空格子(那是噪音), 结论交给 masthead 徽章 + 估值区块标题。
          ...(marginShown
            ? [{ label: page.marginOfSafety, value: fmtMarginPct(handoffVerdict!.marginPct!), tone: "positive" as const }]
            : []),
          { label: g.holdersPeople, value: String(n) },
          { label: g.totalValue, value: formatUSD(totalValue) },
        ]}
        sources={[{ name: "SEC EDGAR 13F", asOf: latestPeriod, filed: latestFiledAt, status: filingFreshness(latestPeriod || null, new Date()) }]}
        footerCta={<NewsletterCTA lang={lang} source="stock" />}
      >
        <>
          {bq && (
            <section aria-label={page.bq.aria}>
              <SectionHeading
                eyebrow={page.bq.eyebrow}
                title={page.bq.title}
                trailing={
                  bq.asOf ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
                      {page.bq.asOf(bq.asOf)}
                    </span>
                  ) : undefined
                }
              />
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {[
                  { k: page.bq.revenueGrowth, v: bq.revenueYoy, sign: true },
                  { k: page.bq.netMargin, v: bq.netMargin, sign: false },
                  { k: "ROE", v: bq.roe, sign: false },
                  { k: page.bq.fcfMargin, v: bq.fcfMargin, sign: false },
                ].map((m) => (
                  <div key={m.k}>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">{m.k}</dt>
                    <dd className="tnum mt-1 font-mono text-lg text-[var(--tt-text)]">
                      {m.v == null ? "—" : `${m.sign && m.v > 0 ? "+" : ""}${(m.v * 100).toFixed(1)}%`}
                    </dd>
                  </div>
                ))}
              </dl>
              {/* 营收多年轨迹(口径无歧义)。净利率折线暂缓 —— 其结尾值与净利率格子(latest_net_margin
                  疑似配期异常, 见数据任务)矛盾, 不上自相矛盾的两个数。 */}
              {bq.revenueSeries.length >= 2 && (
                <div className="mt-5 flex items-center gap-3">
                  <span className="font-mono text-[11px] text-[var(--tt-muted)]">
                    {page.bq.revenueTrail(
                      formatUSD(bq.revenueSeries[0]),
                      formatUSD(bq.revenueSeries[bq.revenueSeries.length - 1]),
                      bq.revenueSeries.length,
                    )}
                  </span>
                  <Sparkline series={bq.revenueSeries} color="var(--tt-muted)" />
                </div>
              )}
              {!bq.reliable && (
                <p className="mt-3 text-xs text-[var(--tt-muted)]">
                  {page.bq.incomplete}
                </p>
              )}
              <LearnLink
                lang={lang}
                slug="reading-business-quality"
                label={page.bq.learn}
              />
            </section>
          )}

          {/* 支柱① 估值结论(头条) — Fraunces 标题直接是结论, 位置带/句子/方法在卡内 */}
          {valuationFloor && (
            <section>
              <SectionHeading
                eyebrow={page.valuation.eyebrow}
                title={valuationTitle}
              />
              {splitCoverageStale ? (
                <p className="mt-3 text-sm text-[var(--tt-muted)]">{page.valuation.splitPaused}</p>
              ) : capitalStructureDistorted ? (
                <p className="mt-3 text-sm text-[var(--tt-muted)]">{page.valuation.moatDistorted}</p>
              ) : fundamentalsCorrupt ? (
                <p className="mt-3 text-sm text-[var(--tt-muted)]">{page.valuation.fundamentalsSuspect}</p>
              ) : (
                <>
                  <div className="mt-3">
                    <EarningsPowerFloorCard
                      floor={valuationFloor}
                      strikeZone={strikeZone}
                      oeDcf={oeDcf}
                      reconciliation={reconciliation}
                      issuer={issuer}
                      ticker={ticker}
                      lang={lang}
                      showStatus={false}
                      verdict={run.verdict}
                    />
                  </div>
                  {expectations?.assessable && (
                    <PriceBetBlock
                      expectations={expectations}
                      lang={lang}
                      lowConfidence={!handoffVerdict?.reliable}
                    />
                  )}
                  <LearnLink
                    lang={lang}
                    slug="what-is-intrinsic-value"
                    label={page.valuation.learn}
                  />
                </>
              )}
            </section>
          )}

          {/* 支柱② 谁持有 — 表 + 文字说明同簇，避免与表双份叙事抢独立一节 */}
          <div>
            <HoldersTable
              issuer={issuer}
              ticker={ticker}
              holders={holders}
              exited={exitedHolders}
              totalValue={totalValue}
              moves={moves}
              lang={lang}
              trend={trendSeries}
            />
            <FoldedSection eyebrow={page.foldedEyebrow} title={page.folded}>
              <StockProse paragraphs={stockProse} lang={lang} bare />
            </FoldedSection>
            <LearnLink
              lang={lang}
              slug="how-to-read-a-13f"
              label={page.holders.learn}
            />
          </div>

          {coOwned.length > 0 && (
            <section aria-label={page.coOwned.aria}>
              <SectionHeading
                eyebrow={page.coOwned.eyebrow}
                title={page.coOwned.title}
              />
              <p className="mb-3 mt-3 text-sm text-[var(--tt-muted)]">
                {page.coOwned.lead(issuer, ticker)}
              </p>
              <ul className="mt-1 grid list-none grid-cols-1 gap-x-6 gap-y-1.5 p-0 sm:grid-cols-2">
                {coOwned.map((c) => (
                  <li key={c.coTicker} className="flex items-baseline gap-2 text-sm">
                    <Link
                      href={stockPath(lang, c.coTicker)}
                      className="min-w-0 truncate text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]"
                    >
                      {cleanIssuer(c.coIssuer)}
                      <span className="ml-1.5 font-mono text-[11px] text-[var(--tt-faint)]">{c.coTicker}</span>
                    </Link>
                    <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[var(--tt-muted)]">
                      {page.coOwned.shared(c.sharedHolders)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <DiscoveryHandoff {...stockHandoffFor(handoffVerdict, ticker, lang)} />

          {/* 外链沉到正文末、Sources 前：不抢质量/估值/持有人主线；detail=图标无框 */}
          {cusipsForTicker.length > 0 && (
            <section
              aria-label={page.externalAria}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
                {ui.alsoOn}
              </span>
              <ExternalFinanceLinks ticker={ticker} exchange={exchange} variant="detail" lang={lang} />
            </section>
          )}
        </>
      </EntityPage>
    </>
  );
}
