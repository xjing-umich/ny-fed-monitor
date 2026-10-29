import { date as formatDate } from "@/lib/i18n/format";
import { shares as formatShares } from "@/lib/i18n/format";
import React from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
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
import { countsAsCurrentHolder, effectiveMovesPeriod, filingFreshness, quarterLabel, globalLatestPeriod } from "@/lib/freshness/derive";
import type { Lang } from "@/lib/nav";
import { investorPath, stockPath, localePath, HTML_LANG } from "@/lib/urls";
import { resolveEntity, getEntityAliases } from "@/lib/aliases/resolve";
import { managerLabel } from "@/lib/managers/displayName";
import { stockDisplayName, stockZhName } from "@/lib/stocks/zhNames";
import { EntityPage } from "@/components/entity/EntityPage";
import { NewsletterCTA } from "@/components/entity/NewsletterCTA";
import { ExternalFinanceLinks } from "@/components/entity/ExternalFinanceLinks";
import { formatUSD, cleanIssuer, fmtMarginPct, zhSpacing } from "@/lib/format";
import { priceFactNote, priceSourceName } from "@/lib/valuation/asOf";
import { ivBelowFloorConflict } from "@/lib/valuation/deriveValuationVerdict";
import { altFor, ogFor, datasetLd, breadcrumbLd, fitSnippet, securitySchemaType, edgarFilingsUrl } from "@/lib/seo";
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
  readHoldcoSotp,
  runValuation,
} from "@/lib/valuation";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
import { EarningsPowerFloorCard, ValueBandGauge, cardSummaryMode, perShare as fmtPerShare } from "@/components/valuation/EarningsPowerFloorCard";
import { getLatestPrice, fmtPriceFact, getLatestSplit } from "@/lib/managers/priceRead";
import { WeightQoQ, MoveMark } from "@/components/common/qoqDirection";
import { holderTrendSeries, type HolderTrendPoint } from "@/lib/stocks/holderTrend";
import { filingSeasonNote, hasNewQuarterRows } from "@/lib/stocks/filingSeasonNote";
import { FoldedSection } from "@/components/entity/FoldedSection";
import { stockHandoffFor } from "@/lib/discovery/discoveryHandoff";
import { DiscoveryHandoff } from "@/components/discovery/DiscoveryHandoff";
import { LearnLink } from "@/components/common/LearnLink";
import { isLikelyTicker, knownExchange } from "@/lib/externalLinks";
import { valuationVerdictChip } from "@/lib/stocks/valuationVerdictChip";
import { PriceBetBlock, expectationsBadge } from "@/components/valuation/PriceBetBlock";
import { deriveBusinessQuality } from "@/lib/stocks/businessQuality";
import { stockPageCopy, stockUi } from "@/lib/stocks/stockCopy";
import { conclusionLeftState, stockAnchors, holdersLine, valuationDetailsShown, verdictGaugeReady } from "@/lib/stocks/stockConclusion";
import { StockConclusionBand } from "@/components/stocks/StockConclusionBand";
import { StockAnchorNav } from "@/components/stocks/StockAnchorNav";
import { valuationLabel } from "@/lib/valuation/valuationLabel";
import { Sparkline } from "@/components/common/Sparkline";
import { revenueGrowthStandard } from "@/lib/valuation/growthBaseRate";
import { SectionHeading } from "@/components/common/SectionHeading";

// 预渲染共识热门个股(被最多机构持有的标的,几乎覆盖全部点击来源:首页/搜索/列表),
// 这些直接成为静态 HTML → CDN 秒开。冷门 ticker 不预渲染,靠 dynamicParams 按需渲染
// + ISR 缓存。13F 季度更、价格日更(页面只显示最新价);~2000 个 ticker 页 × ~55 个 8KB 写入单位,
// 日级重验会把 Hobby 的 ISR Writes 额度用穿 → 详情页 7 天兜底,估值/价格随每周六整站刷新更新。
// 周期按 Vercel Hobby 额度定(ISR Writes 按 8KB 计、全站 ~2200 页):列表页 3 天、详情页 7 天;
// 数据批量更新后的整站刷新由 workflow 调 /api/revalidate 承担(13F 有新 filing 时 + 估值每周六)。
export const revalidate = 604800;
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
  // 中文页标题/描述带通行中文名("苹果 Apple Inc"),中文用户按中文名搜。
  const zhIssuer = stockDisplayName("zh", ticker, issuer);

  // 数据驱动 description:持有人数/合计市值/截至季度/最大持有人,与页面持有人表同源同口径
  // (快照非清仓行、按 countsAsCurrentHolder 排除逾期未申报者;"截至"走 effectiveMovesPeriod)。readStockHolders/getManagerIndex 有 cache(),
  // 与页面渲染共享一次查询。快照不可用(本地无库)→ 回退通用描述。
  const [snap, idx] = await Promise.all([readStockHolders(ticker), getManagerIndex()]);
  const metaNow = new Date();
  const held = (snap ?? []).filter((r) => r.kind !== "exited" && countsAsCurrentHolder(r.period, metaNow));
  const displayPeriod =
    effectiveMovesPeriod(idx.managers.map((m) => m.period), metaNow).period ??
    globalLatestPeriod(held.map((r) => r.period ?? null));
  let description: { zh: string; en: string } | null = null;
  if (held.length > 0 && displayPeriod) {
    const n = held.length;
    const total = formatUSD(held.reduce((s, r) => s + r.value, 0), lang);
    const topRow = [...held].sort((a, b) => b.value - a.value)[0];
    const topFor = (l: Lang) => managerLabel(l, topRow.slug, topRow.person);
    const q = quarterLabel(displayPeriod, lang);
    const mixed = held.some((r) => r.period && r.period !== displayPeriod);
    // 从详到简,取第一个不超出搜索摘要长度的写法:先省来源句,再省最大持有人。
    const zhHead = `${n} 位超级投资者持有 ${zhIssuer}（${ticker}），合计 ${total}（${mixed ? "多数申报" : ""}截至 ${q}）`;
    const enHead = `${n} superinvestor${n === 1 ? " holds" : "s hold"} ${issuer} (${ticker}): ${total} combined as of ${q}${mixed ? " (most filings)" : ""}`;
    description = {
      zh: zhSpacing(fitSnippet(
        `${zhHead}，最大持有人 ${topFor("zh")}。各家仓位与季度增减，来自 SEC 13F 申报。`,
        `${zhHead}，最大持有人 ${topFor("zh")}。来自 SEC 13F 申报。`,
        `${zhHead}。来自 SEC 13F 申报。`,
      )),
      en: fitSnippet(
        `${enHead}, led by ${topFor("en")}. Position sizes and quarter-over-quarter moves from SEC 13F filings.`,
        `${enHead}, led by ${topFor("en")}. From SEC 13F filings.`,
        `${enHead}. From SEC 13F filings.`,
      ),
    };
  }

  const alternates = altFor(lang, `/stocks/${ticker}`);
  // 未映射到代码的持仓(多为可转债/票据,如 008073AA6)以 CUSIP 作路由键:不叫"股票",也不进索引。
  const isCusipKey = /^[0-9A-Z]{8}[0-9]$/i.test(ticker);
  const { securityType } = await getSecurityMeta(ticker);
  const schemaType = securitySchemaType(securityType, issuer, ticker);
  const noun = schemaType === "InvestmentFund" ? { zh: "基金", en: "Fund" }
    : isCusipKey || schemaType === "FinancialProduct" ? { zh: "证券", en: "Security" } : { zh: "股票", en: "Stock" };
  const meta =
    lang === "zh"
      ? { title: `${zhIssuer}（${ticker}）${noun.zh} — 谁在持有 | Compounder · 复利`,
          description: description?.zh ?? zhSpacing(`谁在持有 ${zhIssuer}（${ticker}）？查看机构 13F 持仓明细、仓位大小与持有分布（数据来自 SEC 申报）。`) }
      : { title: `${issuer} (${ticker}) ${noun.en} — Who's Holding | Compounder`,
          description: description?.en ?? `Which superinvestors hold ${issuer} (${ticker})? See institutional 13F holders, position sizes, and ownership from SEC filings.` };
  return {
    ...meta,
    alternates,
    ...(isCusipKey ? { robots: { index: false, follow: true } } : {}),
    // 本路由自带 opengraph-image(个股卡),不带品牌卡图以免盖掉它。
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, `/stocks/${ticker}`), brandImage: false }),
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
  /** 该行来源 filing 的报告期（季末 YYYY-MM-DD）。申报过渡期各户可能来自不同季。 */
  period: string | undefined;
};

type ExitedHolder = { person: string; slug: string };

const TABLE_COPY = {
  zh: {
    title: "持有该证券的超级投资者",
    cols: {
      investor: "投资人",
      value: "持仓市值",
      shares: "持股",
      weight: "权重（上季→本季）",
    },
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
    showAll: (n: number) => `Show all ${n} holders`,
  },
} as const;

const HOLDERS_VISIBLE = 10;

function HoldersTable({
  holders,
  lang,
  asOfPeriod,
  seasonNote,
}: {
  holders: HolderRow[];
  lang: Lang;
  /** 页面"截至"季度;与之不同期的行(落后的旧申报、已交下一季的早申报)标出各自季度。 */
  asOfPeriod: string;
  /** 申报季说明(新季未切换时的“Qn 申报中 n/M”);参数 = 表里是否有新季行。 */
  seasonNote: (hasOffQuarterRows: boolean) => string | null;
}): React.ReactElement {
  const t = TABLE_COPY[lang];
  const ui = stockUi(lang);
  const page = stockPageCopy(lang);
  const sorted = [...holders].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, HOLDERS_VISIBLE);
  const tail = sorted.slice(HOLDERS_VISIBLE);
  // 混合期标注:与页面"截至"季度不同期的行在人名后加淡色季度小标。全表同期 → 无标。
  const refPeriod = asOfPeriod || globalLatestPeriod(holders.map((h) => h.period ?? null));
  // 不同期的行不显示"新建/加仓"等动作标:本季动向计数只含展示季度,行内动作标若照显会与计数对不上。
  const offQuarter = (r: HolderRow) => !!(r.period && refPeriod && r.period !== refPeriod);

  const columns: Column<HolderRow>[] = [
    {
      key: "investor",
      header: t.cols.investor,
      role: "primary",
      cell: (r) => (
        <span className="inline-flex items-baseline gap-1.5">
          {r.person}
          {offQuarter(r) ? (
            <span className="font-data text-xs text-[var(--tt-faint)]">{quarterLabel(r.period ?? null, lang)}</span>
          ) : (
            <MoveMark kind={r.kind} lang={lang} />
          )}
        </span>
      ),
    },
    { key: "value", header: lang === "zh" ? `${t.cols.value}（美元）` : t.cols.value, align: "right", width: "w-32", cell: (r) => formatUSD(r.value, lang, "table") },
    { key: "shares", header: lang === "zh" ? "持股数（股）" : t.cols.shares, align: "right", width: "w-32", hideOnMobile: true, cell: (r) => formatShares(r.shares, lang) },
    { key: "weight", header: t.cols.weight, align: "right", width: "w-40", cell: (r) => <WeightQoQ cur={r.weight} prior={r.priorWeight} lang={lang} /> },
  ];

  return (
    <section id="holders" className="scroll-mt-32">
      {/* 支柱②标题:绿眉标 → display 标题(语义 h2, 文档大纲/SEO) */}
      <SectionHeading
        eyebrow={page.holders.eyebrow}
        title={t.title}
      />
      {/* 持有人数/合计/本季动向/趋势已上移到首屏结论带;此处只留申报季说明。 */}
      {(() => {
        const note = seasonNote(hasNewQuarterRows(sorted.map((r) => r.period), refPeriod ?? ""));
        return note ? <p className="mt-3 text-xs text-[var(--tt-muted)]">{note}</p> : null;
      })()}
      <div className="mt-3">
        <DataTable
          columns={columns}
          rows={head}
          getKey={(r) => r.slug}
          rowHref={(r) => investorPath(lang, r.slug)}
          breakpoint="lg"
        />
      </div>

      {/* 溢出行:全部留 DOM,默认折叠(原生 <details>,零 JS) */}
      {tail.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none max-sm:flex max-sm:items-center max-sm:min-h-[44px] py-2 font-data text-xs text-[var(--tt-muted)] hover:text-[var(--tt-accent)] [&::-webkit-details-marker]:hidden">
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

  // 旧 CUSIP URL → 永久跳到 ticker(308,若该 cusip 已解析):CUSIP→ticker 映射稳定,让搜索引擎合并收录。
  const cusipMap = await getCusipMap();
  const asCusip = cusipMap.get(rawTicker);
  if (asCusip?.ticker && asCusip.ticker !== rawTicker && isLikelyTicker(asCusip.ticker)) {
    permanentRedirect(stockPath(lang, asCusip.ticker));
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
  let trendPoints: HolderTrendPoint[] = [];
  // 每行(含清仓行)的 period/filedAt,算完再定"截至"与提交日。
  const filings: { slug: string; period: string; filedAt: string }[] = [];

  // 快路径: ticker-keyed 快照(consensus_stock_holders + consensus_stock_trend),取代对 34 户
  // 逐个 getManagerDetail 的 ~100 次/页往返。快照未部署/未填充(空)→ 回退逐户扫描(行为不变)。
  const [snap, idx] = await Promise.all([readStockHolders(ticker), getManagerIndex()]);

  // 全站展示季度:与首页 masthead、buys/sells 同一口径(effectiveMovesPeriod)。申报季内少数基金
  // 提前交了新季时,"截至"不跟着单只早申报者推到新季;本季动作也只计展示季度的申报
  // (与 currentQuarterOnly 一致)。早申报者的持仓仍在表里,行内标出其季度。无数据 → 不过滤。
  const movesEff = effectiveMovesPeriod(idx.managers.map((m) => m.period), new Date());
  const displayPeriod = movesEff.period ?? "";
  const inDisplayQuarter = (p: string | null | undefined) => !displayPeriod || p === displayPeriod;
  // 当前持有人口径(与 consensus 快照同一判定):最近到期季截止日过后仍没交的 manager 不计入。
  // 快照在 ingest 时已按此过滤;读时再判一次,截止日在两次 ingest 之间跨过时也立即生效。
  const now = new Date();
  const isCurrent = (p: string | null | undefined) => countsAsCurrentHolder(p ?? null, now);

  if (snap && snap.length > 0) {
    for (const r of snap) {
      if (!isCurrent(r.period)) continue;
      if (r.period) filings.push({ slug: r.slug, period: r.period, filedAt: r.filedAt ?? "" });
      const countMove = inDisplayQuarter(r.period);
      // 清仓行: 仅计数 + 收进表底 chip 列表, 不进持有人表。
      if (r.kind === "exited") {
        if (countMove) { moves.exited++; exitedHolders.push({ person: managerLabel(lang, r.slug, r.person), slug: r.slug }); }
        continue;
      }
      issuerFreq[r.issuer] = (issuerFreq[r.issuer] ?? 0) + 1;
      if (countMove) {
        if (r.kind === "new") moves.opened++;
        else if (r.kind === "increased") moves.added++;
        else if (r.kind === "decreased") moves.trimmed++;
      }
      holders.push({ person: managerLabel(lang, r.slug, r.person), slug: r.slug, value: r.value, shares: r.shares, weight: r.weight, priorWeight: r.priorWeight, kind: r.kind ?? undefined, period: r.period ?? undefined });
    }
    trendPoints = (await readStockTrend(ticker)) ?? [];
  } else {
    // 回退: 逐户扫描(快照不可用时, 行为与 PR#72 逐户版完全一致)。
    // targetCusips: 该 ticker 下全部 cusip(含历史); 库为空/未解析则把入参当单个 cusip。
    const targetCusips = new Set(cusipsForTicker.length ? cusipsForTicker : [ticker]);
    const details = await Promise.all(
      idx.managers.map(async (summary) => ({ summary, detail: await getManagerDetail(summary.slug) }))
    );
    for (const { summary, detail: d } of details) {
      if (!d || !isCurrent(d.latest.period)) continue;
      const h = d.latest.holdings.find((holding) => !holding.putCall && targetCusips.has(holding.cusip));
      if (!h) continue;
      issuerFreq[h.issuer] = (issuerFreq[h.issuer] ?? 0) + 1;
      filings.push({ slug: summary.slug, period: d.latest.period, filedAt: d.latest.filedAt });
      // QoQ 口径(零新增 IO)：上季同票权重取自 d.prior，本季动作 kind 取自 d.changes。
      const priorWeight = d.prior?.holdings.find((p) => !p.putCall && targetCusips.has(p.cusip))?.weight;
      const kind = d.changes.find((c) => !c.putCall && targetCusips.has(c.cusip))?.kind;
      holders.push({ person: managerLabel(lang, summary.slug, summary.person), slug: summary.slug, value: h.value, shares: h.shares, weight: h.weight, priorWeight, kind, period: d.latest.period });
    }
    // 本季动作 + 清仓 chip(按持有人计, 含已清仓者): 复用已加载的 details.changes, 零新增 IO。
    for (const { summary, detail: d } of details) {
      if (!d || !isCurrent(d.latest.period)) continue;
      const ch = d.changes.find((c) => !c.putCall && targetCusips.has(c.cusip));
      if (!ch) continue;
      // 清仓者不在持有人循环里,补记其申报期,让早申报的清仓也计入 ahead。
      if (ch.kind === "exited") filings.push({ slug: summary.slug, period: d.latest.period, filedAt: d.latest.filedAt });
      if (!inDisplayQuarter(d.latest.period)) continue;
      if (ch.kind === "new") moves.opened++;
      else if (ch.kind === "increased") moves.added++;
      else if (ch.kind === "decreased") moves.trimmed++;
      else if (ch.kind === "exited") { moves.exited++; exitedHolders.push({ person: managerLabel(lang, summary.slug, summary.person), slug: summary.slug }); }
    }
    // 持有人数趋势: 跨全部 manager 的 filings 历史, 按 period 统计持有本票的人数。
    const periodCounts = new Map<string, number>();
    for (const { detail: d } of details) {
      if (!d) continue;
      for (const f of d.filings) {
        if (f.holdings.some((h) => !h.putCall && targetCusips.has(h.cusip))) {
          periodCounts.set(f.period, (periodCounts.get(f.period) ?? 0) + 1);
        }
      }
    }
    trendPoints = [...periodCounts].map(([period, count]) => ({ period, count }));
  }

  if (holders.length === 0) notFound();

  // 趋势截到展示季度(早申报者的新季只有寥寥几份,不能当终点,否则 "47 → 1");终点用共识口径的
  // 当前持有人数(= 本页持有人数 / 共识榜):落后者按最后一次披露计入,与页面 "N 位持有" 一致。
  const trendSeries = holderTrendSeries(trendPoints, displayPeriod, holders.length);

  const coOwned = await readCoOwnership(ticker);

  const issuer = cleanIssuer(Object.entries(issuerFreq).sort((a, b) => b[1] - a[1])[0][0]);
  // 页头、面包屑、FAQ 用的名字:中文页带通行中文名("苹果 Apple Inc"),英文页就是 issuer。
  const displayName = stockDisplayName(lang, ticker, issuer);
  const n = holders.length;
  const totalValue = holders.reduce((sum, r) => sum + r.value, 0);
  const topHolder = [...holders].sort((a, b) => b.value - a.value)[0];

  // "截至":展示季度;无全站口径时回退到本票持有人的最新期。提交日取该季内最晚一份。
  const asOfPeriod = displayPeriod || (globalLatestPeriod(filings.map((f) => f.period)) ?? "");
  const asOfFiledAt = filings
    .filter((f) => f.period === asOfPeriod)
    .reduce((max, f) => (f.filedAt > max ? f.filedAt : max), "");
  // 已交下一季的早申报者(含在新季清仓、因而不在表里的):正文里点明,避免混期让读者误读口径。
  const aheadBySlug = new Map<string, string>();
  for (const f of filings) if (asOfPeriod && f.period > asOfPeriod) aheadBySlug.set(f.slug, f.period);
  const ahead = aheadBySlug.size
    ? { count: aheadBySlug.size, period: globalLatestPeriod([...aheadBySlug.values()])! }
    : undefined;
  // 持有人表是否混期(含落后的旧申报):FAQ 措辞据此区分。
  const mixedPeriods = holders.some((h) => h.period && h.period !== asOfPeriod);

  // 确定性服务端正文(SEO 支柱 + 差异化): 复用已聚合的持有人/动向数据派生唯一正文。
  const stockProse = buildStockProse(
    { issuer, ticker, holders, totalValue, latestPeriod: asOfPeriod, ahead, moves },
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
  const floorInput = fundamentalsToFloorInput(ticker, issuer, sec.annual, ads.ratio, sic, sec.quarterly);
  // 件⑤:投资主导型控股集团的分部 SOTP。reader 自带件④触发集的窄闸 —— 其余票直接返回
  // undefined,floorInput 一个字段都不动(零漂移);读库失败同样返回 undefined,退回件④抑制。
  // 与 scripts/valuation-ingest.ts 走同一个入口,页面与 screener/首页榜口径不分裂。
  const holdcoSotp0 = await readHoldcoSotp({ ticker, annual: sec.annual, floorInput });
  if (holdcoSotp0) floorInput.holdcoSotp = holdcoSotp0;
  // as-of 重锚(spec §6):TTM 生效 → 新鲜度/拆股闸都按 TTM 期末判。
  const fundamentalsAsOf = floorInput.ttm?.period_end ?? sec.annual?.[0]?.period_end ?? null;
  // 基本面过期闸:与 ingest 同语义 — 最新 FY 期末超阈值 → 抑制估值(不造陈旧幻觉)。
  const fundamentalsStale = isFundamentalsStale(
    fundamentalsAsOf,
    new Date().toISOString(),
  );

  // Always load market price for masthead keyFacts (V / BRK.B multi-class still show Price).
  // A stale quote is never used for valuation, but is still shown as the latest key fact.
  const fetchedPrice = await getLatestPrice(ticker);
  const latestPrice = fetchedPrice;
  const priceStale = fetchedPrice?.stale === true;
  const valuationPrice = priceStale ? null : fetchedPrice;

  // 拆股口径护栏:基本面 as-of 早于最近拆股 → 每股口径与拆股后价格错配,整条抑制估值判定。
  // as-of 仅在 TTM 每股股数真取自最新10-Q(非回退 FY0)时才前滚到 TTM 期末;否则退回 FY 期末,
  // 否则拆股落在 (FY0期末, TTM期末] 且最新10-Q缺股数时会漏抑制假"便宜"信号(spec §6)。
  const latestSplitDate = await getLatestSplit(ticker);
  const splitAsOf =
    floorInput.ttm && !floorInput.ttm.shares_from_fy
      ? floorInput.ttm.period_end
      : sec.annual?.[0]?.period_end ?? null;
  const splitCoverageStale = isSplitCoverageStale({
    fundamentalsAsOf: splitAsOf,
    latestSplitDate,
  });

  // 基本面口径护栏:opInc>revenue / gross>revenue 物理不可能 → 数据损坏,整条抑制估值判定。
  const fundamentalsCorrupt = fundamentalsIntegrityViolated(floorInput.years);

  // Second intrinsic-value method (Buffett owner-earnings DCF) + two-method cross-check.
  // DGS10 read is best-effort; null → DCF uses the 9–11% fallback band (flagged in-card).
  const dgs10 = await getLatestDgs10();
  // 基本面来源脚注:TTM 生效 = 最新 10-K 叠加 10-Q(提交日取 TTM 期末那份 10-Q);否则最新年报。
  const fundamentalsFiled = floorInput.ttm
    ? sec.quarterly?.find((q) => q.period_end === floorInput.ttm!.period_end && !q.is_derived)?.filing_date ?? undefined
    : sec.annual?.[0]?.filing_date ?? undefined;
  const annualForm = sec.annual?.[0]?.form ?? "10-K";
  const fundamentalsSource = fundamentalsAsOf
    ? {
        name: floorInput.ttm ? `SEC ${annualForm} + 10-Q (XBRL)` : `SEC ${annualForm} (XBRL)`,
        asOf: fundamentalsAsOf,
        filed: fundamentalsFiled,
        status: fundamentalsStale ? ("stale" as const) : ("fresh" as const),
      }
    : null;
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
  const holdcoNotAssessable =
    valuationFloor?.kind === "floor" && valuationFloor.holdco_not_assessable === true;
  const holdcoSotp =
    valuationFloor?.kind === "floor" ? valuationFloor.holdco_sotp : undefined;
  const capitalStructureDistorted =
    valuationFloor?.kind === "floor" && valuationFloor.moat_reading.capital_structure_distorted === true;
  // 两法互斥(中枢 IV < 零增长底且现价夹在中间)→ 引擎不出判定;这里取出数字,卡片写明原因而非留空。
  const conflictIv = oeDcf?.assessable ? oeDcf.tiers?.neutral.per_share : undefined;
  const conflictFloor = strikeZone?.epv?.valueFloor;
  const conflictPrice = strikeZone?.price.close;
  const methodsConflict =
    !handoffVerdict && conflictIv != null && conflictIv > 0 && conflictFloor != null && conflictPrice != null &&
    ivBelowFloorConflict({ iv: conflictIv, valueFloor: conflictFloor, price: conflictPrice })
      ? { iv: conflictIv, floor: conflictFloor, price: conflictPrice }
      : null;

  // 反向 DCF 隐含预期(现价背后隐含的 owner-earnings 增速档位)。个股页全程实时计算(不读快照)。
  // 个股页即使 reliable=false 仍展示「价格在赌什么」(对照用,非确认便宜);ingest/快照仍可
  // 用 suppressed 闸聚合面——此处不写库。
  const expectations = run.expectations;
  // 全站唯一的历史营收增速(与引擎 gRaw、「价格在赌什么」同一函数同一输入):生意质量头条引用它。
  const revenueGrowth = revenueGrowthStandard(floorInput.years);

  // 生意质量(复用已加载 sec.latest/sec.annual, 零新查询)。null → 整节不渲染。
  // 最新一期(任何报表)也超 18 个月 → 不展示:PBR/VALE/AEM 改报 20-F/40-F 后 XBRL 只剩
  // 2011–2014 年的 10-Q,曾以"生意质量 截至 2010-12-31"示人。
  const newestSecPeriod = [fundamentalsAsOf, sec.latest?.latest_10q_period_end, sec.latest?.latest_10k_period_end]
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  const secTooOld = newestSecPeriod != null && isFundamentalsStale(newestSecPeriod, new Date().toISOString());
  const bq = secTooOld ? null : deriveBusinessQuality({ latest: sec.latest, annual: sec.annual });

  // 安全边际 keyFact 只在"已确认便宜"时占位(reliable + 击球区/低于内在价值)。
  const marginShown = !!(
    handoffVerdict &&
    handoffVerdict.reliable &&
    (handoffVerdict.inStrikeZone || handoffVerdict.bucket === "below") &&
    handoffVerdict.marginPct != null
  );

  // 结论已在标题徽章与结论带里说过一次;估值区块是"证据",标题说它讲什么,不再重复档名(同一事实只说一次)。
  const page = stockPageCopy(lang);
  const ui = stockUi(lang);
  const valuationTitle = lang === "zh" ? "估值怎么算的" : "How it’s valued";

  // 结论带(spec 2026-10-25 §三.1):左栏状态与原估值区块同一优先级。
  const leftState = conclusionLeftState({
    hasFloor: !!valuationFloor,
    splitCoverageStale,
    holdcoNotAssessable,
    hasHoldcoSotp: !!holdcoSotp,
    capitalStructureDistorted,
    fundamentalsCorrupt,
    methodsConflict: !!methodsConflict,
  });
  const assetFloorShown =
    holdcoNotAssessable &&
    valuationFloor?.kind === "floor" &&
    valuationFloor.asset_floor.assessable &&
    valuationFloor.asset_floor.per_share != null &&
    Number.isFinite(valuationFloor.asset_floor.per_share) &&
    valuationFloor.asset_floor.per_share > 0;
  // holdcoNotAssessable 的资产底一行放在结论带(紧跟“下面的资产底只作参考下限”那句),不再单开 #valuation。
  const hasValuationDetails = valuationDetailsShown(leftState);
  const anchors = stockAnchors({ valuation: hasValuationDetails, quality: !!bq, coOwned: coOwned.length > 0 }, lang);

  const subtitle = page.subtitle(n);
  const disclaimer = page.disclaimer;

  const exchange = (await getTickerExchangeMap()).get(ticker);

  const breadcrumb = breadcrumbLd(lang, [
    { name: page.breadcrumbStocks, path: localePath(lang, "/stocks") },
    { name: displayName, path: localePath(lang, `/stocks/${ticker}`) },
  ]);

  // FAQ structured data — answers the canonical "who holds X?" query with the
  // actual holder list, the exact kind of factual Q&A AI engines cite.
  const holderNames = [...holders].sort((a, b) => b.value - a.value).map((h) => h.person);
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: HTML_LANG[lang],
    mainEntity: [
      {
        "@type": "Question",
        name:
          lang === "zh"
            ? zhSpacing(`哪些超级投资者持有 ${displayName}（${ticker}）？`)
            : `Which superinvestors hold ${issuer} (${ticker})?`,
        acceptedAnswer: {
          "@type": "Answer",
          text:
            lang === "zh"
              ? zhSpacing(`根据各位投资人最新一份 SEC 13F 披露（${mixedPeriods ? "多数" : ""}截至 ${formatDate(asOfPeriod, lang)} 季度），${n} 位超级投资者持有 ${displayName}（${ticker}）：${holderNames.join("、")}。合计市值约 ${formatUSD(totalValue, lang)}，最大持有人为 ${topHolder.person}。`)
              : `Per each investor's latest SEC 13F filing (${mixedPeriods ? "most for " : ""}the quarter ended ${formatDate(asOfPeriod, lang)}), ${n} superinvestor${n === 1 ? "" : "s"} hold ${issuer} (${ticker}): ${holderNames.join(", ")}. Combined value held is about ${formatUSD(totalValue, lang)}, with ${topHolder.person} the largest holder.`,
        },
      },
    ],
  };

  // 个股别名外露:公司名变体 + 票代 + 通行中文名(CUSIP 不外露——非用户语义)。
  const zhName = stockZhName(ticker);
  const stockAliases = [...(await getEntityAliases("stock", ticker)), ...(zhName ? [zhName] : [])].filter(
    (a) => a !== issuer && a !== ticker
  );
  // 基金份额与上市公司分别标注；tickerSymbol 只适用于 Corporation。
  // 本站是关于该证券的页面，不把本站地址当成发行人的官网。
  const listedOn = knownExchange(exchange);
  const schemaType = securitySchemaType(securityType, issuer, ticker);
  const securityEntity = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: issuer,
    alternateName: [ticker, ...stockAliases],
    ...(schemaType === "Corporation"
      ? { tickerSymbol: listedOn ? `${listedOn} ${ticker}` : ticker }
      : { identifier: { "@type": "PropertyValue", propertyID: "Ticker", value: ticker } }),
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
    // Snapshots lack accession numbers: cite each actual holder's 13F filing list.
    sourceUrls: holders.flatMap((h) => {
      const manager = idx.managers.find((m) => m.slug === h.slug);
      return manager ? [edgarFilingsUrl(manager.cik)] : [];
    }),
    period: asOfPeriod || null,
    dateModified: asOfFiledAt || null,
    variableMeasured:
      lang === "zh"
        ? ["持有人", "持仓市值（美元）", "持股数", "组合权重", "季度变动"]
        : ["Holder", "Position value (USD)", "Shares held", "Portfolio weight", "Quarter-over-quarter change"],
  });

  // 结论带左栏:现价(带日期/来源,过期置灰)并入左栏,不再单列 keyFacts。
  const priceLine = (
    <p className={latestPrice?.stale ? "font-data text-sm text-[var(--tt-faint)]" : "font-data text-sm text-[var(--tt-text)]"}>
      {page.price} {fmtPriceFact(latestPrice)}
      {priceFactNote(lang, latestPrice) ? <span className="ml-2 text-xs text-[var(--tt-muted)]">{priceFactNote(lang, latestPrice)}</span> : null}
    </p>
  );
  const messageLeft = (text: string) => (
    <>
      {priceLine}
      <p className="text-sm text-[var(--tt-muted)]">{text}</p>
    </>
  );
  // 未评估:档名单独一行(短、muted),原因作为下面一句,不用冒号把两句硬接。
  const unassessed = valuationLabel(null, lang);
  const unassessedLeft = (
    <>
      {priceLine}
      <p className="text-xs font-medium text-[var(--tt-muted)]">{unassessed.label}</p>
      {unassessed.title && <p className="text-sm text-[var(--tt-muted)]">{unassessed.title}</p>}
    </>
  );
  // 卡摘要为空(价格轴可比、但没有权威判定 → 脊柱与缺价格说明都不出):左栏不能只剩一个价格。
  const cardSummaryEmpty = valuationFloor?.kind === "floor" && cardSummaryMode(strikeZone, handoffVerdict) === "none";
  const bandLeft =
    leftState === "card" ? (
      cardSummaryEmpty ? (
        unassessedLeft
      ) : (
        <>
          {/* 卡的价值脊柱自带现价/日期/来源;脊柱不出现(无权威判定)时补一行现价,别让现价从页面消失。 */}
          {!handoffVerdict && priceLine}
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
            ttmPeriodEnd={floorInput.ttm?.period_end}
            part="summary"
            priceKnown={!!valuationPrice && valuationPrice.close > 0}
          />
        </>
      )
    ) : leftState === "holdcoSotp" && holdcoSotp ? (
      // 每股中枢与刻度盘同进同出(与改版前一致):没有权威判定就不在首屏亮一个大数,改说未评估。
      // 三栏 SOTP 推导表仍在 #valuation。
      verdictGaugeReady(handoffVerdict) ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-data text-2xl font-semibold tracking-tight text-[var(--tt-text)]">{fmtPerShare(holdcoSotp.per_share.base)}</span>
            <span className="text-xs text-[var(--tt-muted)]">{page.valuation.holdcoSotpCentral}</span>
          </div>
          <ValueBandGauge bucket={handoffVerdict.bucket} rangeLo={handoffVerdict.rangeLo} rangeHi={handoffVerdict.rangeHi} price={handoffVerdict.price} lang={lang} />
        </>
      ) : (
        unassessedLeft
      )
    ) : leftState === "splitPaused" ? messageLeft(page.valuation.splitPaused)
    : leftState === "holdcoNotAssessable" ? (
      <>
        {messageLeft(page.valuation.holdcoNotAssessable)}
        {/* 文案说“下面的资产底只作参考下限”——资产底就紧跟在这句下面。 */}
        {assetFloorShown && valuationFloor?.kind === "floor" && (
          <p className="text-sm text-[var(--tt-muted)]">
            {page.valuation.assetFloorLabel}: {fmtPerShare(valuationFloor.asset_floor.per_share)}
          </p>
        )}
      </>
    )
    : leftState === "moatDistorted" ? messageLeft(page.valuation.moatDistorted)
    : leftState === "fundamentalsSuspect" ? messageLeft(page.valuation.fundamentalsSuspect)
    : leftState === "methodsConflict" && methodsConflict
      ? messageLeft(page.valuation.methodsConflict(fmtPerShare(methodsConflict.iv), fmtPerShare(methodsConflict.floor), fmtPerShare(methodsConflict.price)))
    : unassessedLeft;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(securityEntity) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }} />
      <EntityPage
        lang={lang}
        title={displayName}
        titleMeta={ticker}
        subtitle={subtitle}
        disclaimer={disclaimer}
        topAction={
          <Link
            href={localePath(lang, "/stocks")}
            className="inline-block text-xs text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-text)]"
          >
            {ui.backToStocks}
          </Link>
        }
        verdict={valuationVerdictChip(handoffVerdict, lang) ?? undefined}
        // 红旗档：正文 PriceBetBlock 仍可对照预期并标 lowConfidence；masthead 微徽章只在
        // reliable 时挂出，避免无 caveats 的「预期 · 苛刻」与未确认便宜信号抢视线。
        verdictExtra={
          handoffVerdict?.reliable
            ? expectationsBadge(expectations, lang) ?? undefined
            : undefined
        }
        // 现价、安全边际、持有人数、合计市值都移进首屏结论带,不在这里重复。
        keyFacts={[]}
        sources={[
          { name: "SEC EDGAR 13F", asOf: asOfPeriod, filed: asOfFiledAt, status: filingFreshness(asOfPeriod || null, new Date()) },
          ...(latestPrice
            ? [{ name: priceSourceName(lang, latestPrice.source), asOf: latestPrice.date, status: latestPrice.stale ? ("stale" as const) : ("fresh" as const) }]
            : []),
          ...(fundamentalsSource ? [fundamentalsSource] : []),
          ...(dgs10 ? [{ name: lang === "zh" ? "FRED 10 年期美债(DGS10)" : "FRED 10-year Treasury (DGS10)", asOf: dgs10.date }] : []),
        ]}
        footerCta={<NewsletterCTA lang={lang} source="stock" />}
      >
        <>
          <StockConclusionBand
            lang={lang}
            left={bandLeft}
            marginText={marginShown ? `${page.marginOfSafety} ${fmtMarginPct(handoffVerdict!.marginPct!)}` : null}
            holders={{
              line: holdersLine(n, formatUSD(totalValue, lang), lang),
              quarter: quarterLabel(displayPeriod, lang) || "",
              moves,
              exited: exitedHolders.map((e) => ({ name: e.person, href: investorPath(lang, e.slug) })),
              trend: trendSeries,
            }}
          />
          <StockAnchorNav lang={lang} anchors={anchors} />

          {/* 持有人 — 表 + 文字说明同簇，避免与表双份叙事抢独立一节 */}
          <div>
            <HoldersTable
              holders={holders}
              lang={lang}
              asOfPeriod={asOfPeriod}
              seasonNote={(has) => filingSeasonNote(movesEff, has, lang)}
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

          {/* 估值与方法:结论(标尺/中枢/提示句)已在首屏结论带,这里只放明细 */}
          {hasValuationDetails && (
            <section id="valuation" className="scroll-mt-32">
              <SectionHeading
                eyebrow={page.valuation.eyebrow}
                title={valuationTitle}
              />
              {leftState === "card" ? (
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
                      ttmPeriodEnd={floorInput.ttm?.period_end}
                      part="details"
                    />
                  </div>
                  {floorInput.ttm && (
                    <p className="mt-2 text-xs text-[var(--tt-muted)]">
                      {page.valuation.ttmBasis(floorInput.ttm.period_end)}
                    </p>
                  )}
                  {expectations?.assessable && (
                    <PriceBetBlock
                      expectations={expectations}
                      lang={lang}
                      lowConfidence={!handoffVerdict?.reliable}
                      historicalSpan={revenueGrowth}
                    />
                  )}
                  <LearnLink
                    lang={lang}
                    slug="what-is-intrinsic-value"
                    label={page.valuation.learn}
                  />
                </>
              ) : leftState === "holdcoSotp" ? (
                holdcoSotp ? (
                  <div className="mt-3">
                    <p className="text-sm text-[var(--tt-muted)]">{page.valuation.holdcoSotpIntro}</p>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[420px] text-sm tabular-nums">
                        <thead>
                          <tr className="text-[var(--tt-muted)]">
                            <th className="py-1 text-left font-normal"> </th>
                            <th className="py-1 text-right font-normal">{page.valuation.tierPessimistic}</th>
                            <th className="py-1 text-right font-normal">{page.valuation.tierBase}</th>
                            <th className="py-1 text-right font-normal">{page.valuation.tierOptimistic}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="py-1">{page.valuation.holdcoSotpInvestments}</td>
                            <td className="py-1 text-right text-[var(--tt-muted)]" colSpan={3}>
                              {fmtPerShare(holdcoSotp.columns.investments)}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-1">{page.valuation.holdcoSotpOperating}</td>
                            <td className="py-1 text-right">{fmtPerShare(holdcoSotp.columns.operating.pessimistic)}</td>
                            <td className="py-1 text-right">{fmtPerShare(holdcoSotp.columns.operating.base)}</td>
                            <td className="py-1 text-right">{fmtPerShare(holdcoSotp.columns.operating.optimistic)}</td>
                          </tr>
                          <tr>
                            <td className="py-1">{page.valuation.holdcoSotpUnderwriting}</td>
                            <td className="py-1 text-right">{fmtPerShare(holdcoSotp.columns.underwriting.pessimistic)}</td>
                            <td className="py-1 text-right">{fmtPerShare(holdcoSotp.columns.underwriting.base)}</td>
                            <td className="py-1 text-right">{fmtPerShare(holdcoSotp.columns.underwriting.optimistic)}</td>
                          </tr>
                          <tr>
                            <td className="py-1">{page.valuation.holdcoSotpDeferredTax}</td>
                            <td className="py-1 text-right text-[var(--tt-muted)]" colSpan={3}>
                              −{fmtPerShare(holdcoSotp.columns.deferred_tax)}
                            </td>
                          </tr>
                          <tr className="border-t border-[var(--tt-border)] font-medium">
                            <td className="py-2">{page.valuation.holdcoSotpTotal}</td>
                            <td className="py-2 text-right">{fmtPerShare(holdcoSotp.per_share.pessimistic)}</td>
                            <td className="py-2 text-right">{fmtPerShare(holdcoSotp.per_share.base)}</td>
                            <td className="py-2 text-right">{fmtPerShare(holdcoSotp.per_share.optimistic)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-xs text-[var(--tt-muted)]">{page.valuation.holdcoSotpNote}</p>
                  </div>
                ) : null
              ) : null}
            </section>
          )}

          {bq && (
            <section id="quality" aria-label={page.bq.aria} className="scroll-mt-32">
              <SectionHeading
                eyebrow={page.bq.eyebrow}
                title={page.bq.title}
                trailing={
                  bq.asOf ? (
                    <span className="font-data text-xs text-[var(--tt-faint)]">
                      {page.bq.asOf(bq.asOf)}
                    </span>
                  ) : undefined
                }
              />
              {floorInput.ttm && (
                <p className="mt-2 text-xs text-[var(--tt-muted)]">
                  {page.valuation.ttmBasis(floorInput.ttm.period_end)}
                </p>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {[
                  revenueGrowth
                    ? { k: page.bq.revenueGrowth(`${revenueGrowth.fromYear}–${revenueGrowth.toYear}`), v: revenueGrowth.rate, sign: true }
                    : { k: page.bq.revenueYoy, v: bq.revenueYoy, sign: true },
                  { k: page.bq.netMargin, v: bq.netMargin, sign: false },
                  { k: "ROE", v: bq.roe, sign: false },
                  { k: page.bq.fcfMargin, v: bq.fcfMargin, sign: false },
                ].map((m) => (
                  <div key={m.k}>
                    <dt className="font-data text-xs text-[var(--tt-faint)]">{m.k}</dt>
                    <dd className="tnum mt-1 font-data text-lg text-[var(--tt-text)]">
                      {m.v == null ? "—" : `${m.sign && m.v > 0 ? "+" : ""}${(m.v * 100).toFixed(1)}%`}
                    </dd>
                  </div>
                ))}
              </dl>
              {/* 营收多年轨迹(口径无歧义)。净利率折线暂缓 —— 其结尾值与净利率格子(latest_net_margin
                  疑似配期异常, 见数据任务)矛盾, 不上自相矛盾的两个数。 */}
              {bq.revenueSeries.length >= 2 && (
                <div className="mt-5 flex items-center gap-3">
                  <span className="font-data text-xs text-[var(--tt-muted)]">
                    {page.bq.revenueTrail(
                      formatUSD(bq.revenueSeries[0], lang),
                      formatUSD(bq.revenueSeries[bq.revenueSeries.length - 1], lang),
                      bq.revenueSpan,
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

          {coOwned.length > 0 && (
            <section id="co-owned" aria-label={page.coOwned.aria} className="scroll-mt-32">
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
                      {stockDisplayName(lang, c.coTicker, cleanIssuer(c.coIssuer))}
                      <span className="ml-1.5 font-code text-xs text-[var(--tt-faint)]">{c.coTicker}</span>
                    </Link>
                    <span className="ml-auto shrink-0 font-data text-xs tabular-nums text-[var(--tt-muted)]">
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
              <span className="font-data text-xs text-[var(--tt-faint)]">
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
