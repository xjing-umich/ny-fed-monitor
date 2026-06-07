import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import type { Holding, HoldingChange } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath, stockPath } from "@/lib/urls";
import { EntityPage } from "@/components/entity/EntityPage";
import { InvestorNarrative } from "@/components/entity/InvestorNarrative";
import { getInvestorNarrative } from "@/lib/ai/investorNarrativeServer";
import { isPeriodStale } from "@/lib/ai/investorNarrative";
import type { Tone } from "@/components/entity/types";
import { formatUSD } from "@/lib/format";

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
    cols: { issuer: "标的", value: "市值", shares: "持股数", weight: "权重" },
    truncated: (n: number, total: number) => `显示前 ${n} 条，共 ${total} 个持仓`,
  },
  en: {
    title: "Holdings",
    cols: { issuer: "Security", value: "Value", shares: "Shares", weight: "Weight" },
    truncated: (n: number, total: number) => `Showing top ${n} of ${total} positions`,
  },
} as const;

function HoldingsTable({ holdings, lang }: { holdings: Holding[]; lang: Lang }): React.ReactElement {
  const t = HOLD_COPY[lang];
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const capped = sorted.slice(0, MAX_HOLDINGS);
  const truncated = sorted.length > MAX_HOLDINGS;

  return (
    <section>
      {/* Section label with hairline rule */}
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.title}
        </span>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--tt-border)]">
              <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)]">
                {t.cols.issuer}
              </th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-32">
                {t.cols.value}
              </th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-32">
                {t.cols.shares}
              </th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-24">
                {t.cols.weight}
              </th>
            </tr>
          </thead>
          <tbody>
            {capped.map((h, i) => (
              <tr
                key={h.cusip}
                className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
              >
                <td className="py-3 pr-4">
                  <Link
                    href={stockPath(lang, h.cusip)}
                    className="font-display font-medium text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)] transition-colors"
                  >
                    {h.issuer}
                  </Link>
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-faint)]">
                    {h.cusip}
                  </span>
                </td>
                <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-text)]">
                  {formatUSD(h.value)}
                </td>
                <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-muted)]">
                  {h.shares.toLocaleString()}
                </td>
                <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-muted)]">
                  {h.weight != null ? `${(h.weight * 100).toFixed(2)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p className="mt-2 text-xs text-[var(--tt-faint)]">
          {t.truncated(MAX_HOLDINGS, sorted.length)}
        </p>
      )}
    </section>
  );
}

// ── Changes section ───────────────────────────────────────────────────────────

const CHANGE_COPY = {
  zh: {
    title: "环比变动",
    new: "新建",
    exited: "清仓",
    increased: "加仓",
    decreased: "减仓",
    none: "—",
  },
  en: {
    title: "Quarter Changes",
    new: "New",
    exited: "Exited",
    increased: "Added",
    decreased: "Trimmed",
    none: "—",
  },
} as const;

const KIND_COLOR: Record<HoldingChange["kind"], string> = {
  new:       "text-[var(--tt-positive)]",
  exited:    "text-[var(--tt-negative)]",
  increased: "text-[var(--tt-accent)]",
  decreased: "text-[var(--tt-warn)]",
};

function ChangeGroup({
  label,
  items,
  kind,
}: {
  label: string;
  items: HoldingChange[];
  kind: HoldingChange["kind"];
}): React.ReactElement {
  const colorClass = KIND_COLOR[kind];
  return (
    <div className="border-t border-[var(--tt-border)] pt-3">
      <div className={`text-[10px] font-medium uppercase tracking-[0.1em] mb-2 ${colorClass}`}>
        {label}
      </div>
      <div>
        {items.length === 0 ? (
          <div className="text-xs text-[var(--tt-faint)]">—</div>
        ) : (
          items.map((c) => (
            <div
              key={c.cusip}
              className="flex items-center justify-between gap-2 py-1 border-b border-[var(--tt-border)] last:border-0"
            >
              <span className="text-xs text-[var(--tt-text)] truncate flex-1">{c.issuer}</span>
              {(kind === "increased" || kind === "decreased") && c.deltaPct != null ? (
                <span className={`font-mono tabular-nums text-[11px] flex-shrink-0 ${colorClass}`}>
                  {kind === "increased" ? "+" : ""}
                  {(c.deltaPct * 100).toFixed(1)}%
                </span>
              ) : (
                <span className="font-mono tabular-nums text-[11px] text-[var(--tt-faint)] flex-shrink-0">
                  {formatUSD(c.value)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ChangesSection({ changes, lang }: { changes: HoldingChange[]; lang: Lang }): React.ReactElement {
  const t = CHANGE_COPY[lang];
  const groups: { kind: HoldingChange["kind"]; label: string }[] = [
    { kind: "new",       label: `${t.new} (${changes.filter((c) => c.kind === "new").length})` },
    { kind: "exited",   label: `${t.exited} (${changes.filter((c) => c.kind === "exited").length})` },
    { kind: "increased",label: `${t.increased} (${changes.filter((c) => c.kind === "increased").length})` },
    { kind: "decreased",label: `${t.decreased} (${changes.filter((c) => c.kind === "decreased").length})` },
  ];

  return (
    <section>
      {/* Section label with hairline rule */}
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.title}
        </span>
      </div>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map(({ kind, label }) => (
          <ChangeGroup
            key={kind}
            label={label}
            items={changes.filter((c) => c.kind === kind).slice(0, 8)}
            kind={kind}
          />
        ))}
      </div>
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
  if (!d) notFound();

  const { manager, latest, prior, changes } = d;

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
      ? [...latest.holdings].sort((a, b) => b.value - a.value)[0].issuer
      : "—";

  const keyFacts = [
    {
      label: lang === "zh" ? "组合市值" : "Portfolio value",
      value: formatUSD(latest.totalValue),
    },
    {
      label: lang === "zh" ? "持仓数" : "Holdings",
      value: String(latest.holdings.length),
    },
    {
      label: lang === "zh" ? "最新报告期" : "Latest period",
      value: latest.period,
    },
    {
      label: lang === "zh" ? "第一大持仓" : "Top holding",
      value: topHolding,
    },
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

  const hasChanges = changes.length > 0 && prior != null;

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
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: manager.person,
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
        sources={[{ name: "SEC EDGAR 13F", asOf: latest.filedAt }]}
        related={related}
      >
        <HoldingsTable holdings={latest.holdings} lang={lang} />
        {hasChanges && <ChangesSection changes={changes} lang={lang} />}
      </EntityPage>
    </>
  );
}
