import React from "react";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import type { Holding, HoldingChange, FilingData } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath, stockPath } from "@/lib/urls";
import { resolveEntity, getEntityAliases } from "@/lib/aliases/resolve";
import { EntityPage } from "@/components/entity/EntityPage";
import { InvestorNarrative } from "@/components/entity/InvestorNarrative";
import { getInvestorNarrative } from "@/lib/ai/investorNarrativeServer";
import { isPeriodStale } from "@/lib/ai/investorNarrative";
import { filingFreshness } from "@/lib/freshness/derive";
import type { Tone } from "@/components/entity/types";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EntityName } from "@/components/common/EntityName";
import { getCusipMap } from "@/lib/managers/securities";

const MAX_HOLDINGS = 25;

// ISR: 预渲染 + 周期性重校验, 让「生成在构建之后」的 AI 叙述(及更新的持仓)无需重新部署即可在 1 小时内出现, 同时保持静态托管利于 SEO。
export const revalidate = 3600;

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
  const nb = await getInvestorNarrative(slug, lang);
  const l = lang === "en" ? "en" : "zh";
  const alternates = {
    canonical: `/${l}/investors/${slug}`,
    languages: {
      en: `/en/investors/${slug}`,
      "zh-CN": `/zh/investors/${slug}`,
      "x-default": `/en/investors/${slug}`,
    },
  };
  return lang === "zh"
    ? {
        title: `${person} 持仓 13F — Compounder · 复利`,
        description: nb?.judgment_line ?? `${name} — ${person} 的最新 SEC 13F 季度持仓披露，持仓明细与环比变动。`,
        alternates,
      }
    : {
        title: `${person} 13F Holdings — Compounder · 复利`,
        description: nb?.judgment_line ?? `${name} — Latest SEC 13F quarterly holdings for ${person}, with positions and quarter-over-quarter changes.`,
        alternates,
      };
}

// ── Holdings table ────────────────────────────────────────────────────────────

const HOLD_COPY = {
  zh: {
    title: "持仓明细",
    cols: { issuer: "标的", value: "市值", shares: "持股数", weight: "权重(上季→本季)" },
    truncated: (n: number, total: number) => `显示前 ${n} 条，共 ${total} 个持仓`,
    newPos: "新建",
    exitedTitle: (n: number) => `本季清仓 (${n})`,
    more: (n: number) => `… 等 ${n} 只`,
  },
  en: {
    title: "Holdings",
    cols: { issuer: "Security", value: "Value", shares: "Shares", weight: "Weight (prev→now)" },
    truncated: (n: number, total: number) => `Showing top ${n} of ${total} positions`,
    newPos: "New",
    exitedTitle: (n: number) => `Exited this quarter (${n})`,
    more: (n: number) => `… +${n} more`,
  },
} as const;

const fmtPct1 = (w: number | undefined): string =>
  w != null ? `${(w * 100).toFixed(1)}%` : "—";

/** QoQ 权重单元格: 数字取权重, 箭头/色取自 change.kind(持股口径)。 */
function WeightQoQ({
  cur,
  prior,
  kind,
  lang,
}: {
  cur?: number;
  prior?: number;
  kind?: HoldingChange["kind"];
  lang: Lang;
}): React.ReactElement {
  const t = HOLD_COPY[lang];
  // 新建: prior 不存在该持仓
  if (prior == null) {
    return (
      <span className="font-mono tabular-nums text-[var(--tt-positive)]">
        {t.newPos} · {fmtPct1(cur)}
      </span>
    );
  }
  const arrow = kind === "increased" ? "▲" : kind === "decreased" ? "▼" : "";
  const colorClass =
    kind === "increased"
      ? "text-[var(--tt-positive)]"
      : kind === "decreased"
      ? "text-[var(--tt-warn)]"
      : "text-[var(--tt-faint)]";
  return (
    <span className="font-mono tabular-nums text-[var(--tt-muted)]">
      {fmtPct1(prior)} <span className={colorClass}>→ {fmtPct1(cur)} {arrow}</span>
    </span>
  );
}

function HoldingsTable({
  holdings,
  prior,
  changes,
  lang,
  cusipToTicker,
}: {
  holdings: Holding[];
  prior?: FilingData;
  changes: HoldingChange[];
  lang: Lang;
  cusipToTicker: Map<string, string>;
}): React.ReactElement {
  const t = HOLD_COPY[lang];
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const capped = sorted.slice(0, MAX_HOLDINGS);
  const truncated = sorted.length > MAX_HOLDINGS;

  const priorByCusip = new Map((prior?.holdings ?? []).map((h) => [h.cusip, h]));
  const changeByCusip = new Map(changes.map((c) => [c.cusip, c]));
  const exits = changes.filter((c) => c.kind === "exited");
  const EXIT_CAP = 12;

  const columns: Column<Holding>[] = [
    {
      key: "issuer",
      header: t.cols.issuer,
      role: "primary",
      cell: (h) => <EntityName issuer={h.issuer} ticker={cusipToTicker.get(h.cusip) ?? h.cusip} />,
    },
    {
      key: "value",
      header: t.cols.value,
      align: "right",
      width: "w-32",
      cell: (h) => formatUSD(h.value),
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
      cell: (h) => (
        <WeightQoQ
          cur={h.weight}
          prior={priorByCusip.get(h.cusip)?.weight}
          kind={changeByCusip.get(h.cusip)?.kind}
          lang={lang}
        />
      ),
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
        getKey={(h) => h.cusip}
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
              <React.Fragment key={c.cusip}>
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

  // CUSIP→ticker 内链解析(spec §5.3)。无库(本地)→ 空 Map → 退回原 cusip 链接(行为不变)。
  const cusipMap = await getCusipMap();
  const cusipToTicker = new Map<string, string>();
  for (const [cusip, info] of cusipMap) if (info.ticker) cusipToTicker.set(cusip, info.ticker);

  // 服务端读已缓存的 AI 叙述(取该投资者该语言最新一条; 无缓存/无库 → null, 优雅降级)
  const narrative = await getInvestorNarrative(slug, lang);

  // 数据新鲜度: 最近申报是否早于"应有最新季"(45天延迟后)。防旧申报冒充当前 → 顶部醒目标注。
  const stale = isPeriodStale(latest.period, new Date());
  const staleNotice = stale ? (
    <div className="border-l-2 border-[var(--tt-warn)] bg-[var(--tt-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--tt-text)]">
      {lang === "zh"
        ? `⚠ 该投资者在此申报主体下最近一次 SEC 13F 申报为 ${latest.period}，此后未再申报。以下持仓与解读反映该期数据，可能并非当前持仓。`
        : `⚠ This manager's most recent SEC 13F filing under this filer is for ${latest.period}, with none since. Holdings and the summary below reflect that filing and may not be current.`}
    </div>
  ) : undefined;

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

  // Key facts
  const topHolding =
    latest.holdings.length > 0
      ? cleanIssuer([...latest.holdings].sort((a, b) => b.value - a.value)[0].issuer)
      : "—";

  // 组合级 QoQ(无 prior 时不显环比)
  const valDeltaPct =
    prior && prior.totalValue > 0 ? (latest.totalValue - prior.totalValue) / prior.totalValue : null;
  const cntDelta = prior ? latest.holdings.length - prior.holdings.length : 0;
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
  const deltaClass = (n: number) =>
    n > 0 ? "text-[var(--tt-positive)]" : n < 0 ? "text-[var(--tt-warn)]" : "text-[var(--tt-faint)]";

  const valueNode = (
    <span className="tnum font-mono text-xl font-medium leading-none text-card-foreground">
      {formatUSD(latest.totalValue)}
      {valDeltaPct != null && valDeltaPct !== 0 && (
        <span className={`ml-1.5 text-xs ${deltaClass(valDeltaPct)}`}>
          （{lang === "zh" ? "环比 " : ""}{sign(valDeltaPct)}
          {Math.abs(valDeltaPct * 100).toFixed(0)}%）
        </span>
      )}
    </span>
  );
  const countNode = (
    <span className="tnum font-mono text-xl font-medium leading-none text-card-foreground">
      {latest.holdings.length}
      {cntDelta !== 0 && (
        <span className={`ml-1.5 text-xs ${deltaClass(cntDelta)}`}>
          （{sign(cntDelta)}{Math.abs(cntDelta)}）
        </span>
      )}
    </span>
  );

  const keyFacts = [
    { label: lang === "zh" ? "组合市值" : "Portfolio value", value: formatUSD(latest.totalValue), node: valueNode },
    { label: lang === "zh" ? "持仓数" : "Holdings", value: String(latest.holdings.length), node: countNode },
    { label: lang === "zh" ? "最新报告期" : "Latest period", value: latest.period },
    { label: lang === "zh" ? "第一大持仓" : "Top holding", value: topHolding },
  ];

  // Subtitle
  const subtitle =
    lang === "zh"
      ? `${manager.name} — ${manager.person} 掌管，美股持仓通过 SEC 13F 季度披露`
      : `${manager.name} — managed by ${manager.person}; US equity positions disclosed quarterly via SEC 13F`;

  // Related: up to 6 other managers from the index
  const idx = await getManagerIndex();
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
        item: `https://thecompounder.fyi/${lang}/investors`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: manager.person,
        item: `https://thecompounder.fyi/${lang}/investors/${manager.slug}`,
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
    url: `https://thecompounder.fyi/${lang}/investors/${manager.slug}`,
    jobTitle: lang === "zh" ? "投资人" : "Investor",
    worksFor: { "@type": "Organization", name: manager.name },
    subjectOf: {
      "@type": "Dataset",
      name:
        lang === "zh"
          ? `${manager.person} 的 SEC 13F 持仓`
          : `${manager.person}'s SEC 13F holdings`,
      isAccessibleForFree: true,
      ...(latest.filedAt ? { dateModified: latest.filedAt } : {}),
      sourceOrganization: { "@type": "Organization", name: "SEC EDGAR" },
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
        notice={staleNotice}
        aiNarrative={narrative ? <InvestorNarrative data={narrative} lang={lang} /> : undefined}
        sources={[{ name: "SEC EDGAR 13F", asOf: latest.filedAt, status: filingFreshness(latest.period || null, new Date()) }]}
        related={related}
      >
        <HoldingsTable holdings={latest.holdings} prior={prior} changes={changes} lang={lang} cusipToTicker={cusipToTicker} />
      </EntityPage>
    </>
  );
}
