import React from "react";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import { holdingKey } from "@/lib/managers/assemble";
import type { Holding, HoldingChange } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath, stockPath, absoluteUrl, localePath } from "@/lib/urls";
import { resolveEntity, getEntityAliases } from "@/lib/aliases/resolve";
import { ShareButton } from "@/components/share/ShareButton";
import { buildShareText, shareLabels } from "@/lib/share/shareText";
import { EntityPage } from "@/components/entity/EntityPage";
import { NewsletterCTA } from "@/components/entity/NewsletterCTA";
import { filingFreshness, freshness13F, quarterLag, globalLatestPeriod, quarterLabel } from "@/lib/freshness/derive";
import { FreshnessBadge } from "@/components/entity/FreshnessBadge";
import type { Tone } from "@/components/entity/types";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { altFor, ogFor } from "@/lib/seo";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityName } from "@/components/common/EntityName";
import { isLikelyTicker } from "@/lib/externalLinks";
import { getCusipMap } from "@/lib/managers/securities";
import { WeightBar } from "@/components/investor/WeightBar";
import { deriveRowSignals, type RowSignal } from "@/lib/managers/rowSignals";
import { buildInvestorProse, displayFundName } from "@/lib/managers/profileProse";
import { InvestorProfileProse } from "@/components/entity/InvestorProfileProse";
import { readValuationVerdicts, type SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import { ValuationBadge } from "@/components/valuation/ValuationBadge";
import { readHolderCounts } from "@/lib/managers/consensusRead";
import { investorHandoffFor } from "@/lib/discovery/discoveryHandoff";
import { DiscoveryHandoff } from "@/components/discovery/DiscoveryHandoff";

const MAX_HOLDINGS = 25;

// ISR: 预渲染 + 周期性重校验, 让「生成在构建之后」的 AI 叙述(及更新的持仓)无需重新部署即可在一天内出现, 同时保持静态托管利于 SEO。
// 13F 季度级数据 → 日级重验足够,避免 76 户详情页每小时各重验一次反复读库(egress)。
export const revalidate = 86400;

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
  const q = d.latest?.period ? quarterLabel(d.latest.period) : "";
  const qSuffix = q ? ` ${q}` : "";
  // 确定性 meta description：从已加载的 13F 数据派生，每位投资人各异（不再依赖已退役的 AI judgment_line）。
  // 仅统计长仓（排除 put/call 期权），与可见页面的 key-facts 口径保持一致（Task 12）。
  const longHoldings = (d.latest?.holdings ?? []).filter((h) => !h.putCall);
  const longTotalValue = longHoldings.reduce((s, h) => s + h.value, 0);
  const posCount = longHoldings.length;
  const totalLabel = d.latest ? formatUSD(longTotalValue) : "";
  const topName =
    longHoldings.length > 0
      ? cleanIssuer([...longHoldings].sort((a, b) => b.value - a.value)[0].issuer)
      : "";
  const alternates = altFor(lang, `/investors/${slug}`);
  const meta =
    lang === "zh"
      ? {
          title: `${person} 持仓组合 — 13F${qSuffix} | Compounder · 复利`,
          description: `${person}（${fundName}）的 SEC 13F 持仓组合${q ? `，${q}` : ""}：${posCount} 个持仓，市值 ${totalLabel}${topName ? `，第一大持仓 ${topName}` : ""}。含环比变动，数据来自 SEC EDGAR。`,
        }
      : {
          title: `${person} Portfolio — 13F Holdings${qSuffix} | Compounder`,
          description: `${person}'s SEC 13F portfolio (${fundName})${q ? `, ${q}` : ""}: ${posCount} positions worth ${totalLabel}${topName ? `, led by ${topName}` : ""}. Quarter-over-quarter changes, sourced from SEC EDGAR.`,
        };
  return {
    ...meta,
    alternates,
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, `/investors/${slug}`), type: "profile" }),
  };
}

// ── Holdings table ────────────────────────────────────────────────────────────

const HOLD_COPY = {
  zh: {
    title: "持仓明细",
    cols: { issuer: "标的", value: "市值", valuation: "估值", consensus: "持有人数", shares: "持股数", weight: "权重", signal: "信号" },
    truncated: (n: number, total: number) => `显示前 ${n} 条，共 ${total} 个持仓`,
    exitedTitle: (n: number) => `本季清仓 (${n})`,
    more: (n: number) => `… 等 ${n} 只`,
  },
  en: {
    title: "Holdings",
    cols: { issuer: "Security", value: "Value", valuation: "Valuation", consensus: "Holders", shares: "Shares", weight: "Weight", signal: "Signal" },
    truncated: (n: number, total: number) => `Showing top ${n} of ${total} positions`,
    exitedTitle: (n: number) => `Exited this quarter (${n})`,
    more: (n: number) => `… +${n} more`,
  },
} as const;

function HoldingsTable({
  holdings,
  changes,
  lang,
  cusipToTicker,
  verdicts,
  holderCounts,
  rowSignals,
}: {
  holdings: Holding[];
  changes: HoldingChange[];
  lang: Lang;
  cusipToTicker: Map<string, string>;
  verdicts: Map<string, SnapshotVerdict>;
  holderCounts: Map<string, number>;
  rowSignals: Map<string, RowSignal>;
}): React.ReactElement {
  const t = HOLD_COPY[lang];
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const capped = sorted.slice(0, MAX_HOLDINGS);
  const truncated = sorted.length > MAX_HOLDINGS;

  const exits = changes.filter((c) => c.kind === "exited");
  const EXIT_CAP = 12;

  const columns: Column<Holding>[] = [
    {
      key: "issuer",
      header: t.cols.issuer,
      role: "primary",
      cell: (h) => (
        <span className="inline-flex items-center gap-1.5">
          <EntityName issuer={h.issuer} ticker={cusipToTicker.get(h.cusip) ?? h.cusip} />
          {h.putCall && (
            <span
              className={`rounded-sm px-1 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] border border-current/40 ${h.putCall === "Put" ? "text-[var(--tt-warn)]" : "text-[var(--tt-muted)]"}`}
              title={lang === "zh" ? "期权:市值为标的名义价值,非权利金" : "Option: value is notional, not premium"}
            >
              {h.putCall === "Put" ? "PUT" : "CALL"}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "value",
      header: t.cols.value,
      align: "right",
      width: "w-32",
      cell: (h) => formatUSD(h.value),
    },
    {
      key: "valuation",
      header: t.cols.valuation,
      align: "right",
      width: "w-32",
      cell: (h) => {
        const tk = cusipToTicker.get(h.cusip);
        return <ValuationBadge verdict={tk ? verdicts.get(tk.toUpperCase()) : undefined} lang={lang} />;
      },
    },
    {
      key: "consensus",
      header: t.cols.consensus,
      align: "right",
      width: "w-24",
      cell: (h) => {
        const tk = cusipToTicker.get(h.cusip);
        const c = tk ? holderCounts.get(tk.toUpperCase()) : undefined;
        return c != null
          ? <span className="font-mono tabular-nums text-[var(--tt-muted)]">{c}</span>
          : <span className="text-[var(--tt-faint)]">—</span>;
      },
    },
    {
      key: "shares",
      header: t.cols.shares,
      align: "right",
      width: "w-32",
      hideOnMobile: true,
      cell: (h) => h.shares.toLocaleString(),
    },
    {
      key: "weight",
      header: t.cols.weight,
      align: "right",
      width: "w-40",
      cell: (h) => h.putCall ? <span className="text-[var(--tt-faint)]">—</span> : <WeightBar weight={h.weight ?? null} />,
    },
    {
      key: "signal",
      header: t.cols.signal,
      align: "right",
      width: "w-40",
      role: "trail",
      cell: (h) => {
        const s = rowSignals.get(h.cusip);
        if (!s) return <span className="text-[var(--tt-faint)]">—</span>;
        return (
          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
            {s.cheap && (
              <span className="rounded-sm border border-[var(--tt-positive)]/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-positive)]">
                {lang === "zh" ? "便宜" : "Cheap"}
                {s.cheap.marginPct != null && s.cheap.marginPct > 0 ? ` −${Math.round(s.cheap.marginPct * 100)}%` : ""}
              </span>
            )}
            {s.conviction && (
              <span className="rounded-sm border border-[var(--tt-border)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-muted)]">
                {s.conviction.label}
              </span>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <section>
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.title}
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={capped}
        getKey={(h) => holdingKey(h)}
        rowHref={(h) => {
          const tk = cusipToTicker.get(h.cusip);
          if (tk) return stockPath(lang, tk);
          return h.cusip ? stockPath(lang, h.cusip) : "";
        }}
        breakpoint="lg"
      />
      {truncated && (
        <p className="mt-2 text-xs text-[var(--tt-faint)]">{t.truncated(MAX_HOLDINGS, sorted.length)}</p>
      )}

      {exits.length > 0 && (
        <div className="mt-4 border-t border-[var(--tt-border)] pt-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--tt-negative)]">
            {t.exitedTitle(exits.length)}
          </span>
          <span className="ml-2 text-sm text-[var(--tt-muted)]">
            {exits.slice(0, EXIT_CAP).map((c, i) => (
              <React.Fragment key={holdingKey(c)}>
                {i > 0 && "、"}
                <Link href={stockPath(lang, cusipToTicker.get(c.cusip) ?? c.cusip)} className="text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">{cleanIssuer(c.issuer)}</Link>
              </React.Fragment>
            ))}
            {exits.length > EXIT_CAP && <span className="text-[var(--tt-faint)]">{t.more(exits.length - EXIT_CAP)}</span>}
          </span>
        </div>
      )}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

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
  // 基金名展示化(全大写 EDGAR 名 → 标题化, 策展混合大小写名原样): 副标题/结构化数据/正文统一口径。
  const fund = displayFundName(manager.name);

  // CUSIP→ticker 内链解析(spec §5.3)。无库(本地)→ 空 Map → 退回原 cusip 链接(行为不变)。
  // 仅收 ticker 形态的值:脊梁富化偶有脏 ticker(如数字 "9.2343e+106"),否则会生成坏内链;
  // 这类行回退为原 cusip 链接(个股页仍能按 cusip 解析)。
  const cusipMap = await getCusipMap();
  const cusipToTicker = new Map<string, string>();
  for (const [cusip, info] of cusipMap)
    if (info.ticker && isLikelyTicker(info.ticker)) cusipToTicker.set(cusip, info.ticker);

  // 估值叠加(读物化快照, 廉价; 失败优雅返回空 Map → 无徽章, 不阻断渲染)。
  const holdingTickers = latest.holdings
    .map((h) => cusipToTicker.get(h.cusip))
    .filter((t): t is string => Boolean(t));
  const verdicts = await readValuationVerdicts(holdingTickers);
  const holderCounts = await readHolderCounts(holdingTickers);

  // 持仓表行内信号(便宜/高信念徽章): 按 cusip 归并, 零新增 IO(复用已加载的 verdicts/filings)。
  const rowSignals = deriveRowSignals({ filings: d.filings, verdicts, cusipToTicker, lang });

  // 该投资人当前持仓中现价落在击球区的只数(与 screener strike_zone 视图同口径)。
  const strikeCount = latest.holdings.reduce((acc, h) => {
    const tk = cusipToTicker.get(h.cusip);
    return acc + (tk && verdicts.get(tk.toUpperCase())?.inStrikeZone ? 1 : 0);
  }, 0);

  // index 供全局最新季基准与 Related 共用（getManagerIndex 有 cache()，单次查询）
  const idx = await getManagerIndex();

  // 确定性服务端正文(SEO 支柱)：复用同一份已装配的 13F 数据派生 3~5 段唯一正文，零新增 IO。
  // 取代了原先读缓存的「AI Read」叙述(时有时无、刻意无数字、带 AI 免责声明) —— 本正文每页必出、含真实数字、零幻觉。
  const prose = buildInvestorProse(d, lang);

  // 三档新鲜度(全局最新季基准, spec freshness-guard §B/C1): 常显来源+截止日, stale/inactive 加警示。
  const globalLatest = globalLatestPeriod(idx.managers.map((m) => m.period));
  const fresh = freshness13F(latest.period, globalLatest);
  const lag = quarterLag(latest.period, globalLatest) ?? 0;
  const freshnessNotice = (
    <FreshnessBadge lang={lang} period={latest.period} filedAt={latest.filedAt} status={fresh} lagQuarters={lag} />
  );

  // Verdict
  const buying = changes.filter((c) => c.kind === "new" || c.kind === "increased").length;
  const selling = changes.filter((c) => c.kind === "exited" || c.kind === "decreased").length;
  let verdict: { label: string; tone: Tone } | undefined;
  if (changes.length > 0 && prior) {
    if (buying > selling) {
      verdict = { label: lang === "zh" ? "整体加仓" : "Net buying", tone: "positive" };
    } else if (selling > buying) {
      verdict = { label: lang === "zh" ? "整体减仓" : "Net selling", tone: "warn" };
    } else {
      verdict = { label: lang === "zh" ? "持仓微调" : "Mostly held", tone: "neutral" };
    }
  }

  // 长仓 only 子集(汇总口径排除 put/call 期权行, spec: 期权名义市值会扭曲第一大持仓/组合市值)。
  // 持仓表(HoldingsTable)仍传入全量 latest.holdings —— 期权行照常列出(后续任务加 PUT/CALL 徽章)。
  const longHoldings = latest.holdings.filter((h) => !h.putCall);
  const longTotalValue = longHoldings.reduce((s, h) => s + h.value, 0);

  // Key facts
  const topHolding =
    longHoldings.length > 0
      ? cleanIssuer([...longHoldings].sort((a, b) => b.value - a.value)[0].issuer)
      : "—";

  // 分享文案数据（确定性，缺失走退化）
  const shareTopHolding =
    longHoldings.length > 0
      ? [...longHoldings].sort((a, b) => b.value - a.value)[0].issuer
      : null;
  const shareAddedName = changes.find((c) => c.kind === "new")?.issuer ?? null;
  const shareUrl = absoluteUrl(investorPath(lang, slug));
  const shareText = buildShareText(
    { kind: "investor", managerName: manager.person, topHolding: shareTopHolding, addedName: shareAddedName },
    lang,
    manager.person,
  );

  // 组合级 QoQ(无 prior 时不显环比;对照组同样限定长仓 only,避免期权进出污染环比)
  const priorLong = prior ? prior.holdings.filter((h) => !h.putCall) : null;
  const priorLongTotal = priorLong ? priorLong.reduce((s, h) => s + h.value, 0) : 0;
  const valDeltaPct =
    priorLong && priorLongTotal > 0 ? (longTotalValue - priorLongTotal) / priorLongTotal : null;
  const cntDelta = priorLong ? longHoldings.length - priorLong.length : 0;
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
  const deltaClass = (n: number) =>
    n > 0 ? "text-[var(--tt-positive)]" : n < 0 ? "text-[var(--tt-warn)]" : "text-[var(--tt-faint)]";

  const valueNode = (
    <span className="tnum font-mono text-xl font-medium leading-none text-[var(--tt-text)]">
      {formatUSD(longTotalValue)}
      {valDeltaPct != null && valDeltaPct !== 0 && (
        <span className={`ml-1.5 text-xs ${deltaClass(valDeltaPct)}`}>
          （{lang === "zh" ? "环比 " : ""}{sign(valDeltaPct)}
          {Math.abs(valDeltaPct * 100).toFixed(0)}%）
        </span>
      )}
    </span>
  );
  const countNode = (
    <span className="tnum font-mono text-xl font-medium leading-none text-[var(--tt-text)]">
      {longHoldings.length}
      {cntDelta !== 0 && (
        <span className={`ml-1.5 text-xs ${deltaClass(cntDelta)}`}>
          （{sign(cntDelta)}{Math.abs(cntDelta)}）
        </span>
      )}
    </span>
  );

  // 第一大仓占比(占组合权重,长仓 only)
  const top1 = longHoldings.length > 0
    ? [...longHoldings].sort((a, b) => b.value - a.value)[0]
    : null;
  const top1Pct = top1 && longTotalValue > 0 ? (top1.value / longTotalValue) * 100 : null;

  const keyFacts = [
    { label: lang === "zh" ? "组合市值" : "Portfolio value", value: formatUSD(longTotalValue), node: valueNode },
    { label: lang === "zh" ? "持仓数" : "Holdings", value: String(longHoldings.length), node: countNode },
    { label: lang === "zh" ? "第一大持仓" : "Top holding", value: topHolding },
    { label: lang === "zh" ? "第一大仓占比" : "Top position", value: top1Pct != null ? `${top1Pct.toFixed(1)}%` : "—" },
  ];

  // Subtitle
  const subtitle =
    lang === "zh"
      ? `${fund} — ${manager.person} 掌管，美股持仓通过 SEC 13F 季度披露`
      : `${fund} — managed by ${manager.person}; US equity positions disclosed quarterly via SEC 13F`;

  // Related: up to 6 other managers from the index
  const related = idx.managers
    .filter((m) => m.slug !== slug)
    .slice(0, 6)
    .map((m) => ({ label: m.person, href: investorPath(lang, m.slug) }));

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: lang === "zh" ? "超级投资者" : "Superinvestors",
        item: absoluteUrl(localePath(lang, `/investors`)),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: manager.person,
        item: absoluteUrl(localePath(lang, `/investors/${manager.slug}`)),
      },
    ],
  };

  // Person structured data — identifies the investor as an entity and links the
  // fund they run, so search/AI engines can attribute holdings to a real person.
  // 别名外露:把人名/接班人/票代/中英/曾用名喂给搜索/AI(spec §5.2)。排除与主名重复者。
  const aliasNames = (await getEntityAliases("investor", manager.slug)).filter((a) => a !== manager.person);
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: manager.person,
    ...(aliasNames.length ? { alternateName: aliasNames } : {}),
    url: absoluteUrl(localePath(lang, `/investors/${manager.slug}`)),
    jobTitle: lang === "zh" ? "投资人" : "Investor",
    worksFor: { "@type": "Organization", name: fund },
    subjectOf: {
      "@type": "Dataset",
      name:
        lang === "zh"
          ? `${manager.person} 的 SEC 13F 持仓`
          : `${manager.person}'s SEC 13F holdings`,
      description:
        lang === "zh"
          ? `${fund} 向美国证券交易委员会（SEC）申报的 13F 季度持仓数据，包含个股、持股数量与申报市值。`
          : `Quarterly 13F holdings disclosed by ${fund} to the U.S. Securities and Exchange Commission (SEC), including positions, share counts, and reported market values.`,
      isAccessibleForFree: true,
      ...(latest.filedAt ? { dateModified: latest.filedAt } : {}),
      creator: { "@type": "Organization", name: fund },
      sourceOrganization: { "@type": "Organization", name: "SEC EDGAR" },
      license: "https://creativecommons.org/publicdomain/mark/1.0/",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(person) }}
      />
      <EntityPage
        lang={lang}
        title={manager.person}
        subtitle={subtitle}
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
        notice={freshnessNotice}
        sources={[{ name: "SEC EDGAR 13F", asOf: latest.period, filed: latest.filedAt, status: filingFreshness(latest.period || null, new Date()) }]}
        related={related}
        footerCta={<NewsletterCTA lang={lang} source="investor" />}
      >
        <>
          <HoldingsTable holdings={latest.holdings} changes={changes} lang={lang} cusipToTicker={cusipToTicker} verdicts={verdicts} holderCounts={holderCounts} rowSignals={rowSignals} />
          <details className="group border-t border-[var(--tt-border)] pt-4">
            <summary className="cursor-pointer list-none font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)] marker:hidden [&::-webkit-details-marker]:hidden">
              {lang === "zh" ? "关于这位投资者 ▸" : "About this investor ▸"}
            </summary>
            <div className="mt-3">
              <InvestorProfileProse paragraphs={prose} lang={lang} cusipToTicker={cusipToTicker} />
            </div>
          </details>
          <DiscoveryHandoff {...investorHandoffFor(strikeCount, manager.person, lang)} />
        </>
      </EntityPage>
    </>
  );
}
