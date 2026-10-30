import { OptionalLink } from "@/components/common/OptionalLink";
import { currentStockKeys, availableStockHref } from '@/lib/stocks/stockLinks';
import { readStockLinkHolders } from '@/lib/managers/consensusRead';
import { summaryForDetail, investorVerdictChip, valueChangeSplit, valueSplitNote, investorAnchors, top5Share } from "@/lib/managers/investorConclusion";
import { QuarterMovesBlock } from "@/components/investor/QuarterMovesBlock";
import { InvestorHoldingsTable } from "@/components/investor/InvestorHoldingsTable";
import { PageAnchorNav } from "@/components/common/PageAnchorNav";
import { BAND_COPY } from "@/lib/stocks/stockConclusion";
import { date as formatDate } from "@/lib/i18n/format";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import { holdingKey } from "@/lib/managers/assemble";
import type { Lang } from "@/lib/nav";
import { investorPath, absoluteUrl, localePath, HTML_LANG } from "@/lib/urls";
import { resolveEntity } from "@/lib/aliases/resolve";
import { personNameAliases } from "@/lib/aliases/config";
import { managerLabel, managerTitleName, managerSubtitle, managerIsOrganization, managerStewardPeople } from "@/lib/managers/displayName";
import { ShareButton } from "@/components/share/ShareButton";
import { buildShareText, shareLabels } from "@/lib/share/shareText";
import { EntityPage } from "@/components/entity/EntityPage";
import { NewsletterCTA } from "@/components/entity/NewsletterCTA";
import { filingFreshness, freshness13F, isScopeChange, quarterLag, globalLatestPeriod, quarterLabel } from "@/lib/freshness/derive";
import { FreshnessBadge } from "@/components/entity/FreshnessBadge";
import { formatUSD, cleanIssuer, fmtMarginPct, zhSpacing } from "@/lib/format";
import { stockDisplayName } from "@/lib/stocks/zhNames";
import { latestIsoDate } from "@/lib/valuation/asOf";
import { altFor, ogFor, breadcrumbLd, edgarFilingsUrl, SEC_DATA_LICENSE, fitSnippet } from "@/lib/seo";
import { snapshotTime, filingSourceLd } from "@/lib/datasetTime";
import { isLikelyTicker } from "@/lib/externalLinks";
import { getCusipMap } from "@/lib/managers/securities";
import { deriveRowSignals } from "@/lib/managers/rowSignals";
import { buildInvestorProse, displayFundName } from "@/lib/managers/profileProse";
import { InvestorProfileProse } from "@/components/entity/InvestorProfileProse";
import { readValuationVerdicts } from "@/lib/valuation/valuationSnapshot";
import { readHolderCounts } from "@/lib/managers/consensusRead";
import { investorHandoffFor } from "@/lib/discovery/discoveryHandoff";
import { DiscoveryHandoff } from "@/components/discovery/DiscoveryHandoff";
import { deriveLonelyConviction } from "@/lib/managers/lonelyConviction";
import { deriveValuationPosture, postureLeadIn, strikePendingIssuers, POSTURE_LIMIT } from "@/lib/managers/valuationPosture";
import { PENDING_WORD, valuationLabel } from "@/lib/valuation/valuationLabel";
import { LearnLink } from "@/components/common/LearnLink";
import { FoldedSection } from "@/components/entity/FoldedSection";
import { SectionHeading } from "@/components/common/SectionHeading";


// ISR: 预渲染 + 周期性重校验, 让「生成在构建之后」的持仓更新无需重新部署即可出现, 同时保持静态托管利于 SEO。
// 13F 季度级数据 → 详情页 7 天兜底;新 filing 入库后由 ingest workflow 整站刷新。
// 周期按 Vercel Hobby 额度定(ISR Writes 按 8KB 计、全站 ~2200 页):列表页 3 天、详情页 7 天;
// 数据批量更新后的整站刷新由 workflow 调 /api/revalidate 承担(13F 有新 filing 时 + 估值每周六)。
export const revalidate = 604800;

export async function generateStaticParams() {
  const idx = await getManagerIndex();
  const langs = ["zh", "en"] as const;
  return langs.flatMap((lang) =>
    idx.managers.map((m) => ({ lang, slug: m.slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, slug } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const d = await getManagerDetail(slug);
  if (!d) return {};
  const { person, name } = d.manager;
  const fundName = displayFundName(name);
  const q = d.latest?.period ? quarterLabel(d.latest.period, lang) : "";
  const qSuffix = q ? ` ${q}` : "";
  // 确定性 meta description：从已加载的 13F 数据派生，每位投资人各异（不再依赖已退役的 AI judgment_line）。
  // 仅统计长仓（排除 put/call 期权），与可见页面的 key-facts 口径保持一致（Task 12）。
  const longHoldings = (d.latest?.holdings ?? []).filter((h) => !h.putCall);
  const longTotalValue = longHoldings.reduce((s, h) => s + h.value, 0);
  const posCount = longHoldings.length;
  const totalLabel = d.latest ? formatUSD(longTotalValue, lang) : "";
  const top = longHoldings.length > 0 ? [...longHoldings].sort((a, b) => b.value - a.value)[0] : null;
  const topName = top
    ? stockDisplayName(lang, (await getCusipMap()).get(top.cusip)?.ticker ?? "", cleanIssuer(top.issuer))
    : "";
  const alternates = altFor(lang, `/investors/${slug}`);
  // 中文页用中文名(段永平、巴菲特……);伯克希尔/Daily Journal 按现任掌管人改写,见 displayName.ts。
  const who = managerLabel(lang, slug, person);
  const titleName = managerTitleName(lang, slug, person);
  // 停报(一年无新 13F)的申报人:标题、描述直接说明是最后一份、已停报 —— 搜索结果和 AI 引用只看得到这两行,
  // 不能让 "Michael Burry Portfolio — 13F Holdings Q3 2025" 被当成当前持仓。偏旧(落后 2~3 季)的在描述里注明。
  const globalLatest = globalLatestPeriod((await getManagerIndex()).managers.map((m) => m.period));
  const fresh = d.latest?.period ? freshness13F(d.latest.period, globalLatest) : "current";
  const lag = d.latest?.period ? quarterLag(d.latest.period, globalLatest) ?? 0 : 0;
  // 描述按从详到简排几种写法,取第一个不超出搜索摘要长度的(fitSnippet):先省来源句,再省申报主体名。
  const zhLead = (withFund: boolean) => {
    const fund = withFund ? `（${fundName}）` : "";
    return fresh === "inactive"
      ? `${who}${fund}最后一份 SEC 13F 持仓（${q}），此后未再申报`
      : `${who}${fund}的 SEC 13F 持仓组合${q ? `，${q}` : ""}${fresh === "stale" ? `（最新公开申报，落后 ${lag} 季）` : ""}`;
  };
  const enLead = (withFund: boolean) => {
    const fund = withFund ? ` (${fundName})` : "";
    return fresh === "inactive"
      ? `${who}'s last SEC 13F${fund}, ${q}; none filed since`
      : `${who}'s SEC 13F portfolio${fund}${q ? `, ${q}` : ""}${fresh === "stale" ? ` (latest public filing, ${lag} quarters behind)` : ""}`;
  };
  const zhBody = `：${posCount} 个持仓，市值 ${totalLabel}${topName ? `，第一大持仓 ${topName}` : ""}。`;
  const enBody = `: ${posCount} positions worth ${totalLabel}${topName ? `, led by ${topName}` : ""}.`;
  const zhTail = fresh === "inactive" ? "为历史数据，来自 SEC EDGAR。" : "含环比变动，数据来自 SEC EDGAR。";
  const enTail = fresh === "inactive" ? " Historical holdings from SEC EDGAR." : " Quarter-over-quarter changes, sourced from SEC EDGAR.";
  const meta =
    lang === "zh"
      ? {
          title: zhSpacing(fresh === "inactive"
            ? `${titleName} — 最后一份 13F${qSuffix}（已停报） | Compounder · 复利`
            : `${titleName} — 13F${qSuffix} | Compounder · 复利`),
          description: zhSpacing(posCount === 0 && d.latest
            ? `${who}（${fundName}）${q} 的 SEC 13F 申报持仓为零，未列任何持仓。数据来自 SEC EDGAR。`
            : fitSnippet(
                zhLead(true) + zhBody + zhTail,
                zhLead(true) + zhBody + "数据来自 SEC EDGAR。",
                zhLead(false) + zhBody + "数据来自 SEC EDGAR。",
                zhLead(false) + zhBody,
              )),
        }
      : {
          title: fresh === "inactive"
            ? `${titleName} — Last 13F Holdings${qSuffix} (No Longer Filing) | Compounder`
            : `${titleName} — 13F Holdings${qSuffix} | Compounder`,
          description: posCount === 0 && d.latest
            ? `${who}'s SEC 13F (${fundName}) for ${q} reports zero holdings. Sourced from SEC EDGAR.`
            : fitSnippet(
                enLead(true) + enBody + enTail,
                enLead(true) + enBody + " Source: SEC EDGAR.",
                enLead(false) + enBody + " Source: SEC EDGAR.",
                enLead(false) + enBody,
              ),
        };
  return {
    ...meta,
    alternates,
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, `/investors/${slug}`), type: "profile", brandImage: false }),
  };
}

// ── Holdings table ────────────────────────────────────────────────────────────

export default async function InvestorSlugPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<React.ReactElement> {
  const { lang: rawLang, slug } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  const d = await getManagerDetail(slug);
  if (!d) {
    // 别名解析:查不到真实页 → 尝试把别名(人名/接班人/票代/中英/曾用名)308 跳到 canonical。
    // 仅 high 触发;命中且 ≠ 当前 slug 才跳(自指 no-op);否则 404。permanentRedirect 抛出,
    // 控制流等价于 notFound()(spec §5.1, §6)。
    const hit = await resolveEntity("investor", slug);
    if (hit && hit.canonicalSlug !== slug) permanentRedirect(investorPath(lang, hit.canonicalSlug));
    notFound();
  }

  const { manager, latest, prior, changes } = d;
  const longHoldings = latest.holdings.filter((h) => !h.putCall);
  const longChanges = changes.filter((c) => !c.putCall);
  // 基金名展示化(全大写 EDGAR 名 → 标题化, 策展混合大小写名原样): 副标题/结构化数据/正文统一口径。
  const fund = displayFundName(manager.name);
  const who = managerLabel(lang, slug, manager.person);

  // CUSIP→ticker 内链解析(spec §5.3)。无库(本地)→ 空 Map → 退回原 cusip 链接(行为不变)。
  // 仅收 ticker 形态的值:脊梁富化偶有脏 ticker(如数字 "9.2343e+106"),否则会生成坏内链;
  // 这类行回退为原 cusip 链接(个股页仍能按 cusip 解析)。
  const cusipMap = await getCusipMap();
  const cusipToTicker = new Map<string, string>();
  for (const [cusip, info] of cusipMap)
    if (info.ticker && isLikelyTicker(info.ticker)) cusipToTicker.set(cusip, info.ticker);

  // 估值叠加(读物化快照, 廉价; 失败优雅返回空 Map → 无徽章, 不阻断渲染)。
  const holdingTickers = longHoldings
    .map((h) => cusipToTicker.get(h.cusip))
    .filter((t): t is string => Boolean(t));
  const verdicts = await readValuationVerdicts(holdingTickers);
  const holderCounts = await readHolderCounts(holdingTickers);

  // 持仓表行内信念徽章(连续加仓/长期核心等): 按 cusip 归并, 零新增 IO(复用已加载的 filings)。
  // (便宜徽章已移除 —— 与同行「估值」列 + 估值姿态小节 chip 重复。)
  const rowSignals = deriveRowSignals({ filings: d.filings, lang });

  // 组合估值姿态(现价 vs 保守价值带): reliable-gated 单一真相源, 喂 keyFact/小节/页底 handoff。
  const posture = deriveValuationPosture({
    holdings: longHoldings.map((h) => ({ cusip: h.cusip, issuer: h.issuer })),
    cusipToTicker,
    verdicts,
  });

  // index 供全局最新季基准与 Related 共用（getManagerIndex 有 cache()，单次查询）
  const idx = await getManagerIndex();

  // 确定性服务端正文(SEO 支柱)：复用同一份已装配的 13F 数据派生 3~5 段唯一正文，零新增 IO。
  // 取代了原先读缓存的「AI Read」叙述(时有时无、刻意无数字、带 AI 免责声明) —— 本正文每页必出、含真实数字、零幻觉。
  const prose = buildInvestorProse(d, lang);
  const stockKeys = [...new Set([
    ...latest.holdings.map((h) => h.cusip), ...changes.map((h) => h.cusip),
    ...prose.flatMap((p) => p.flatMap((s) => typeof s === 'string' ? [] : [s.cusip])),
  ].map((cusip) => cusipToTicker.get(cusip) ?? cusip))];
  const linkNow = new Date();
  const linkRows = await readStockLinkHolders(stockKeys);
  const availableStocks = currentStockKeys(linkRows, linkNow);
  const snapshotKeys = new Set(linkRows.map((r) => r.ticker));
  // A current long holding also proves the fallback detail route can render it.
  for (const key of currentStockKeys(longHoldings.map((h) => ({ ticker: cusipToTicker.get(h.cusip) ?? h.cusip, kind: null, period: latest.period })), linkNow)) if (!snapshotKeys.has(key)) availableStocks.add(key);
  const stockHref = (cusip: string) => availableStockHref(lang, cusipToTicker.get(cusip) ?? cusip, availableStocks);

  // 三档新鲜度(全局最新季基准, spec freshness-guard §B/C1): 常显来源+截止日, stale/inactive 加警示。
  const globalLatest = globalLatestPeriod(idx.managers.map((m) => m.period));
  const fresh = freshness13F(latest.period, globalLatest);
  const lag = quarterLag(latest.period, globalLatest) ?? 0;
  const freshnessNotice = (
    <FreshnessBadge lang={lang} period={latest.period} filedAt={latest.filedAt} status={fresh} lagQuarters={lag} />
  );

  // 与入库季度汇总复用同一金额口径,不新增数据请求。
  const summary = summaryForDetail(d);
  const verdict = investorVerdictChip(summary, lang);
  const changeByKey = new Map(changes.map((c) => [holdingKey(c), c]));

  // 长仓 only 子集(汇总口径排除 put/call 期权行, spec: 期权名义市值会扭曲第一大持仓/组合市值)。
  // 持仓表(HoldingsTable)仍传入全量 latest.holdings —— 期权行照常列出(后续任务加 PUT/CALL 徽章)。
  const longTotalValue = longHoldings.reduce((s, h) => s + h.value, 0);

  // 页面上的个股名:中文页带通行中文名("苹果 Apple Inc"),与个股页同一叫法。
  const stockName = (cusip: string, issuer: string): string =>
    stockDisplayName(lang, cusipToTicker.get(cusip) ?? "", cleanIssuer(issuer));

  // Key facts
  const top = longHoldings.length > 0 ? [...longHoldings].sort((a, b) => b.value - a.value)[0] : null;
  const topHolding = top ? stockName(top.cusip, top.issuer) : "—";

  // 分享文案数据（确定性，缺失走退化）
  const shareTopHolding = top ? topHolding : null;
  const added = longChanges.find((c) => c.kind === "new");
  const shareAddedName = added ? stockName(added.cusip, added.issuer) : null;
  const shareUrl = absoluteUrl(investorPath(lang, slug));
  const shareText = buildShareText(
    { kind: "investor", managerName: who, topHolding: shareTopHolding, addedName: shareAddedName },
    lang,
    who,
  );

  // 组合级 QoQ(无 prior 时不显环比;对照组同样限定长仓 only,避免期权进出污染环比)
  const priorLong = prior ? prior.holdings.filter((h) => !h.putCall) : null;
  const priorLongTotal = priorLong ? priorLong.reduce((s, h) => s + h.value, 0) : 0;
  const valDeltaPct =
    priorLong && priorLongTotal > 0 ? (longTotalValue - priorLongTotal) / priorLongTotal : null;
  const cntDelta = priorLong ? longHoldings.length - priorLong.length : 0;
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
  // 环比量级异常(≤−50% / ≥+100%)的说明:股价一季动不到这个量级,读者容易当成数据错误或"大举清仓"。
  // 数字照申报原文展示,旁边讲清楚它通常意味着什么(例: Cantillon Q2 2026 $150 亿 → $6.7 亿,−96%)。
  // 零持仓申报(如 Olstein 2026Q2):明说"本季申报持仓为零",不让读者以为数据缺失,也不展示旧季持仓。
  // 申报不写原因,故不把它说成卖出(changes 已在 assembleManagerDetail 置空)。
  const zeroReport = latest.holdings.length === 0;
  const filingUrl = /^\d{10}-\d{2}-\d{6}$/.test(latest.accession) ? `https://www.sec.gov/Archives/edgar/data/${manager.cik.replace(/^0+/, "")}/${latest.accession.replace(/-/g, "")}/` : edgarFilingsUrl(manager.cik);
  const zeroNote = zeroReport ? (
    <p className="mt-2 text-sm text-[var(--tt-muted)]">
      {lang === "zh" ? (
        <>
          <strong className="font-medium text-[var(--tt-text)]">{quarterLabel(latest.period, lang)} 申报持仓为零。</strong>
          {fund}{latest.filedAt ? ` ${formatDate(latest.filedAt, lang)} ` : ""}提交的 13F（
          <a href={filingUrl} className="text-[var(--tt-text)]" rel="noopener noreferrer" target="_blank">SEC 原文</a>
          ）只有一行全 0 占位，未列任何持仓。申报没写原因，常见的是清盘、委托转给别家管理人，或管理规模跌破 13F 申报门槛，这里不算作卖出。
          {prior && priorLong ? `上一季 ${quarterLabel(prior.period, lang)} 申报 ${priorLong.length} 只持仓，合计 ${formatUSD(priorLongTotal, lang)}。` : ""}
        </>
      ) : (
        <>
          <strong className="font-medium text-[var(--tt-text)]">{quarterLabel(latest.period, lang)} 13F reports zero holdings.</strong>{" "}
          The filing {fund} submitted{latest.filedAt ? ` on ${formatDate(latest.filedAt, lang)}` : ""} (
          <a href={filingUrl} className="text-[var(--tt-text)]" rel="noopener noreferrer" target="_blank">SEC original</a>
          ) has a single all-zero placeholder row and no positions. It gives no reason; the usual ones are a wind-down, discretion moving to another adviser, or assets falling below the 13F threshold. We don&apos;t count it as selling.
          {prior && priorLong ? ` The prior quarter, ${quarterLabel(prior.period, lang)}, reported ${priorLong.length} positions worth ${formatUSD(priorLongTotal, lang)}.` : ""}
        </>
      )}
    </p>
  ) : null;
  const scopeNote =
    !zeroReport && prior && isScopeChange(valDeltaPct) ? (
      <p className="mt-2 text-xs text-[var(--tt-muted)]">
        {lang === "zh"
          ? `持仓市值环比 ${sign(valDeltaPct!)}${Math.abs(valDeltaPct! * 100).toFixed(0)}%（${quarterLabel(prior.period, lang)} ${formatUSD(priorLongTotal, lang)} → ${quarterLabel(latest.period, lang)} ${formatUSD(longTotalValue, lang)}，持仓 ${priorLong!.length} → ${longHoldings.length} 只），数字取自 13F 申报原文。股价一个季度变不了这么多，常见原因是资金赎回、清盘，或部分账户不再计入 13F 申报范围；不等于基金经理主动卖出了这么多。`
          : `Portfolio value ${sign(valDeltaPct!)}${Math.abs(valDeltaPct! * 100).toFixed(0)}% QoQ (${quarterLabel(prior.period, lang)} ${formatUSD(priorLongTotal, lang)} → ${quarterLabel(latest.period, lang)} ${formatUSD(longTotalValue, lang)}, ${priorLong!.length} → ${longHoldings.length} positions), as reported in the 13F. Prices don't move this much in a quarter: the usual causes are client redemptions, a wind-down, or accounts dropping out of the 13F's reporting scope — not necessarily the manager selling on purpose.`}
      </p>
    ) : null;
  const countNode = (
    <span className="tnum font-data text-xl font-medium leading-none text-[var(--tt-text)]">
      {longHoldings.length}
      {cntDelta !== 0 && (
        <span className="ml-1.5 text-xs text-[var(--tt-muted)]">
          {lang === "zh"
            ? `（${sign(cntDelta)}${Math.abs(cntDelta)}）`
            : ` (${sign(cntDelta)}${Math.abs(cntDelta)})`}
        </span>
      )}
    </span>
  );

  // 独门重仓(少人持 ∩ 够重): 计数入独门小节 h2, chip 喂小节。
  const lonely = deriveLonelyConviction({
    holdings: longHoldings.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: h.value })),
    cusipToTicker,
    holderCounts,
    totalValue: longTotalValue,
  });

  // 估值相关数字(低于内在价值计数、估值列、隐含预期句)全部来自估值快照:取其最晚价格日标注。
  const valuationAsOf = latestIsoDate([...verdicts.values()].map((v) => v.priceDate));
  const split = summary ? valueChangeSplit(summary) : null;
  const top5 = top5Share(longHoldings.map((h) => h.value));
  const keyFacts = [
    {
      label: lang === "zh" ? "组合市值" : "Portfolio value",
      value: formatUSD(longTotalValue, lang),
      note: split ? valueSplitNote(split, lang)
        : valDeltaPct != null && valDeltaPct !== 0
          ? (lang === "zh" ? `较上季 ${sign(valDeltaPct)}${Math.abs(valDeltaPct * 100).toFixed(0)}%` : `${sign(valDeltaPct)}${Math.abs(valDeltaPct * 100).toFixed(0)}% vs last quarter`)
          : undefined,
    },
    {
      label: lang === "zh" ? "持仓数" : "Holdings",
      value: String(longHoldings.length),
      node: countNode,
      note: top5 != null ? (lang === "zh" ? `前 5 大占 ${Math.round(top5 * 100)}%` : `Top 5: ${Math.round(top5 * 100)}%`) : undefined,
    },
  ];
  const hasPosture = posture.cheap.length > 0 || posture.pending.length > 0;
  const anchors = investorAnchors({ moves: !!summary, holdings: !zeroReport, valuation: hasPosture }, lang);
  const lonelyTickers = new Set(lonely.map((h) => h.ticker.toUpperCase()));

  // Subtitle
  const subtitle = managerSubtitle(lang, slug, manager.person, fund);

  // Related: up to 6 other managers from the index
  const related = idx.managers
    .filter((m) => m.slug !== slug)
    .slice(0, 6)
    .map((m) => ({ label: managerLabel(lang, m.slug, m.person), href: investorPath(lang, m.slug) }));

  const breadcrumb = breadcrumbLd(lang, [
    { name: lang === "zh" ? "超级投资者" : "Superinvestors", path: localePath(lang, "/investors") },
    { name: who, path: localePath(lang, `/investors/${manager.slug}`) },
  ]);

  // 实体结构化数据:一般是 Person(投资人)+ 其申报主体;库里"人名"本身是机构名、或掌管人已变的
  // (伯克希尔、Daily Journal)改用 Organization,不把新一季持仓挂在一个不再做决定的人名下。
  // 别名只放本人的名字变体(中文名等);接班人、票代、基金名、曾用名不进 Person,见 personNameAliases。
  const datasetTime = snapshotTime(lang, [latest.period]);
  const dataset = {
    "@type": "Dataset",
    name: lang === "zh" ? zhSpacing(`${who} 的 SEC 13F 持仓`) : `${who}'s SEC 13F holdings`,
    description:
      lang === "zh"
        ? `${fund} 向美国证券交易委员会（SEC）申报的 13F 季度持仓数据，包含个股、持股数量与申报市值。${datasetTime.note}`
        : `Quarterly 13F holdings disclosed by ${fund} to the U.S. Securities and Exchange Commission (SEC), including positions, share counts, and reported market values. ${datasetTime.note}`,
    inLanguage: HTML_LANG[lang],
    isAccessibleForFree: true,
    ...(datasetTime.temporalCoverage ? { temporalCoverage: datasetTime.temporalCoverage } : {}),
    creator: { "@type": "Organization", name: fund },
    sourceOrganization: { "@type": "Organization", name: "SEC EDGAR" },
    isBasedOn: filingSourceLd({ name: `${fund} SEC 13F filing`, url: /^\d{10}-\d{2}-\d{6}$/.test(latest.accession) ? filingUrl : edgarFilingsUrl(manager.cik), period: latest.period, filedAt: latest.filedAt }),
    license: SEC_DATA_LICENSE,
  };
  const pageUrl = absoluteUrl(localePath(lang, `/investors/${manager.slug}`));
  // CIK 是该基金(13F 申报主体)在 SEC 的编号;投资人以其掌管的申报主体被识别。
  const cikId = { "@type": "PropertyValue", propertyID: "SEC CIK", value: manager.cik };
  let entityLd: Record<string, unknown>;
  if (managerIsOrganization(slug)) {
    const zhName = managerLabel("zh", slug, manager.person);
    const steward = managerStewardPeople(slug);
    entityLd = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: fund,
      // 机构名本身的中文名(道奇考克斯等)才作别名;伯克希尔的展示名是两个人名,不能当机构别名。
      ...(!steward.length && zhName !== fund && zhName !== manager.person ? { alternateName: [zhName] } : {}),
      url: pageUrl,
      identifier: cikId,
      ...(steward.length
        ? {
            employee: steward.map((p) => ({
              "@type": "Person",
              name: p.name,
              ...(p.zh ? { alternateName: [p.zh] } : {}),
              jobTitle: p.jobTitle,
            })),
          }
        : {}),
      subjectOf: dataset,
    };
  } else {
    const aliasNames = personNameAliases(manager.slug, manager.person).filter((a) => a !== manager.person);
    entityLd = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: manager.person,
      ...(aliasNames.length ? { alternateName: aliasNames } : {}),
      url: pageUrl,
      identifier: cikId,
      jobTitle: lang === "zh" ? "投资人" : "Investor",
      worksFor: { "@type": "Organization", name: fund },
      subjectOf: dataset,
    };
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(entityLd) }}
      />
      <EntityPage
        lang={lang}
        title={who}
        subtitle={subtitle}
        topAction={
          <Link
            href={localePath(lang, "/investors")}
            className="inline-block text-xs text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-text)] max-sm:flex max-sm:min-h-[44px] max-sm:items-center"
          >
            {lang === "zh" ? "← 超级投资者" : "← Superinvestors"}
          </Link>
        }
        verdict={verdict}
        keyFacts={keyFacts}
        headerAction={
          <ShareButton
            url={shareUrl}
            text={shareText}
            labels={shareLabels(lang)}
            meta={{ entity: slug, entityType: "investor", lang }}
          />
        }
        notice={
          <>
            {freshnessNotice}
            {zeroNote}
            {scopeNote}
          </>
        }
        sources={[
          { name: "SEC EDGAR 13F", href: filingUrl, asOf: latest.period, filed: latest.filedAt, status: filingFreshness(latest.period || null, new Date()) },
          // 估值列 / 低于内在价值 / 隐含预期:估值快照 = SEC 10-K/10-Q 财报 × 收盘价,日期取快照价格日。
          ...(valuationAsOf
            ? [{ name: lang === "zh" ? "估值(SEC 财报 × 收盘价)" : "Valuations (SEC filings × closing prices)", asOf: valuationAsOf }]
            : []),
        ]}
        related={related}
        footerCta={<NewsletterCTA lang={lang} source="investor" />}
      >
        <>
          <PageAnchorNav ariaLabel={BAND_COPY[lang].anchorsAria} anchors={anchors} />
          {summary && (
            <QuarterMovesBlock lang={lang} summary={summary} quarter={quarterLabel(latest.period, lang)} nameOf={stockName}
              hrefOf={stockHref} />
          )}
          {!zeroReport && (
            <InvestorHoldingsTable holdings={latest.holdings} lang={lang} cusipToTicker={cusipToTicker} verdicts={verdicts}
              holderCounts={holderCounts} rowSignals={rowSignals} changeByKey={changeByKey} hasPrior={!!prior}
              lonelyTickers={lonelyTickers} filingUrl={filingUrl} availableStocks={availableStocks} />
          )}
          {hasPosture && (
            <section id="valuation" aria-label={lang === "zh" ? "估值姿态" : "Valuation posture"} className="scroll-mt-32">
              <SectionHeading
                eyebrow={lang === "zh" ? "13F × 估值" : "13F × valuation"}
                title={lang === "zh" ? "估值姿态" : "Valuation posture"}
              />
              <p className="mb-3 mt-3 text-sm text-[var(--tt-muted)]">
                {postureLeadIn(posture, lang)}
              </p>
              <ul className="mt-1 grid list-none grid-cols-1 gap-x-6 gap-y-1.5 p-0 sm:grid-cols-2">
                {posture.cheap.slice(0, POSTURE_LIMIT).map((h) => (
                  <li key={h.ticker} className="flex items-baseline gap-2 text-sm">
                    <OptionalLink
                      href={availableStockHref(lang, h.ticker, availableStocks)}
                      className="min-w-0 truncate text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                    >
                      {stockDisplayName(lang, h.ticker, cleanIssuer(h.issuer))}
                      <span className="ml-1.5 font-code text-xs text-[var(--tt-faint)]">{h.ticker}</span>
                    </OptionalLink>
                    <span className="ml-auto shrink-0 font-data text-xs tabular-nums text-[var(--tt-muted)]">
                      {h.marginPct != null ? fmtMarginPct(h.marginPct) : ""}
                      {h.marginPct != null ? " · " : ""}
                      {valuationLabel({ bucket: h.bucket, inStrikeZone: h.inStrikeZone, reliable: true }, lang).label}
                    </span>
                  </li>
                ))}
                {/* 待确认:便宜档但估值带红旗,照实列出,中性色 + 后缀,不计入上面的数 */}
                {posture.pending.map((h) => {
                  // 档位文案与待确认原因都来自 valuationLabel(单一说法源)
                  const vl = valuationLabel({ bucket: h.bucket, inStrikeZone: h.inStrikeZone, reliable: false }, lang);
                  return (
                  <li key={`pending-${h.ticker}`} title={vl.title ?? undefined} className="flex items-baseline gap-2 text-sm">
                    <OptionalLink
                      href={availableStockHref(lang, h.ticker, availableStocks)}
                      className="min-w-0 truncate text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                    >
                      {stockDisplayName(lang, h.ticker, cleanIssuer(h.issuer))}
                      <span className="ml-1.5 font-code text-xs text-[var(--tt-faint)]">{h.ticker}</span>
                    </OptionalLink>
                    <span className="ml-auto shrink-0 font-data text-xs tabular-nums text-[var(--tt-faint)]">
                      {vl.label}
                      {` · ${PENDING_WORD[lang]}`}
                    </span>
                  </li>
                  );
                })}
              </ul>
            </section>
          )}
          <div id="about" className="scroll-mt-32">
            <FoldedSection title={lang === "zh" ? "关于这位投资者" : "About this investor"}>
              <InvestorProfileProse paragraphs={prose} lang={lang} cusipToTicker={cusipToTicker} availableStocks={availableStocks} />
            </FoldedSection>
            <LearnLink lang={lang} slug="what-is-a-superinvestor" label={lang === "zh" ? "什么是超级投资者" : "What is a superinvestor"} />
          </div>
          <DiscoveryHandoff {...investorHandoffFor(posture.strikeCount, who, lang, strikePendingIssuers(posture).map(cleanIssuer))} />
        </>
      </EntityPage>
    </>
  );
}
