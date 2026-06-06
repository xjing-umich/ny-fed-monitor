import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import type { Holding, HoldingChange } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath, stockPath } from "@/lib/urls";
import { EntityPage } from "@/components/entity/EntityPage";
import type { Tone } from "@/components/entity/types";
import { formatUSD } from "@/lib/format";

const MAX_HOLDINGS = 25;

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
  return lang === "zh"
    ? {
        title: `${person} 持仓 13F — 聪明钱观察`,
        description: `${name} — ${person} 的最新 SEC 13F 季度持仓披露，持仓明细与环比变动。`,
      }
    : {
        title: `${person} 13F Holdings — Smart Money Watch`,
        description: `${name} — Latest SEC 13F quarterly holdings for ${person}, with positions and quarter-over-quarter changes.`,
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
    <Card className="border border-border shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {t.title}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t.cols.issuer}
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t.cols.value}
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t.cols.shares}
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {t.cols.weight}
                </th>
              </tr>
            </thead>
            <tbody>
              {capped.map((h, i) => (
                <tr
                  key={h.cusip}
                  className={i < capped.length - 1 ? "border-b border-border" : ""}
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    <Link
                      href={stockPath(lang, h.cusip)}
                      className="hover:text-primary hover:underline"
                    >
                      {h.issuer}
                    </Link>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-mono text-foreground">
                    {formatUSD(h.value)}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-mono text-muted-foreground">
                    {h.shares.toLocaleString()}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right font-mono text-muted-foreground">
                    {h.weight != null ? `${(h.weight * 100).toFixed(2)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {truncated && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t.truncated(MAX_HOLDINGS, sorted.length)}
          </p>
        )}
      </CardContent>
    </Card>
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
  new: "text-[var(--positive)]",
  exited: "text-destructive",
  increased: "text-primary",
  decreased: "text-[var(--warn)]",
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
    <div className="rounded-lg border border-border overflow-hidden">
      <div className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] border-b border-border ${colorClass}`}>
        {label}
      </div>
      <div className="py-1.5">
        {items.length === 0 ? (
          <div className="px-3 py-1 text-xs text-muted-foreground">—</div>
        ) : (
          items.map((c) => (
            <div
              key={c.cusip}
              className="flex items-center justify-between gap-2 px-3 py-1"
            >
              <span className="text-xs text-foreground truncate flex-1">{c.issuer}</span>
              {(kind === "increased" || kind === "decreased") && c.deltaPct != null ? (
                <span className={`tnum font-mono text-[11px] flex-shrink-0 ${colorClass}`}>
                  {kind === "increased" ? "+" : ""}
                  {(c.deltaPct * 100).toFixed(1)}%
                </span>
              ) : (
                <span className="tnum font-mono text-[11px] text-muted-foreground flex-shrink-0">
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
    { kind: "new", label: `${t.new} (${changes.filter((c) => c.kind === "new").length})` },
    { kind: "exited", label: `${t.exited} (${changes.filter((c) => c.kind === "exited").length})` },
    { kind: "increased", label: `${t.increased} (${changes.filter((c) => c.kind === "increased").length})` },
    { kind: "decreased", label: `${t.decreased} (${changes.filter((c) => c.kind === "decreased").length})` },
  ];

  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {t.title}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map(({ kind, label }) => (
            <ChangeGroup
              key={kind}
              label={label}
              items={changes.filter((c) => c.kind === kind).slice(0, 8)}
              kind={kind}
            />
          ))}
        </div>
      </CardContent>
    </Card>
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

  return (
    <EntityPage
      lang={lang}
      title={manager.person}
      subtitle={subtitle}
      verdict={verdict}
      keyFacts={keyFacts}
      aiPageKey={`investor:${slug}`}
      sources={[{ name: "SEC EDGAR 13F", asOf: latest.filedAt }]}
      related={related}
    >
      <HoldingsTable holdings={latest.holdings} lang={lang} />
      {hasChanges && <ChangesSection changes={changes} lang={lang} />}
    </EntityPage>
  );
}
