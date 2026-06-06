import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Users, LineChart, Activity, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getManagerIndex } from "@/lib/managers/source";
import { buildAllSections } from "@/lib/build";
import { sectionLabel, metricLabel } from "@/lib/dashboard";
import { formatUSD } from "@/lib/format";
import { investorPath, macroPath } from "@/lib/urls";
import type { Lang } from "@/lib/nav";
import type { Section, Metric } from "@/lib/types";
import type { ManagerSummary } from "@/lib/managers/types";

export const dynamic = "force-dynamic";

// ── Copy ──────────────────────────────────────────────────────────────────────

const COPY = {
  zh: {
    product: "聪明钱观察",
    beta: "公开测试版",
    headline: "看清聪明钱在买什么、它值不值、大环境如何",
    sub: "把顶级投资者的持仓、个股估值与宏观流动性，整理成普通投资者也能读懂的清晰视图。",
    ctaPrimary: "浏览超级投资者",
    ctaSecondary: "查看宏观环境",
    pillarsTitle: "三个视角",
    pillars: {
      who: { title: "谁在买", desc: "跟踪巴菲特、Burry 等顶级基金经理的 SEC 13F 季度持仓。" },
      worth: { title: "值不值", desc: "结合持仓与个股估值，判断好公司是否处在好价格。", soon: "估值数据即将上线" },
      macro: { title: "大环境", desc: "回购、利率、拍卖与美联储工具，读懂资金面的大背景。" },
    },
    focusTitle: "本周聚焦",
    focusInvestors: "组合规模最大的投资者",
    focusMacro: "一个值得留意的宏观信号",
    topHolding: "第一大持仓",
    viewAll: "查看全部",
    sources: "数据来源：SEC EDGAR 13F、纽约联储、Treasury.gov。",
  },
  en: {
    product: "Smart Money Watch",
    beta: "Public beta",
    headline: "See what smart money is buying, whether it's worth it, and the macro backdrop",
    sub: "Top investors' holdings, single-stock valuation, and macro liquidity — organized into a clear view everyday investors can read.",
    ctaPrimary: "Browse superinvestors",
    ctaSecondary: "View the macro backdrop",
    pillarsTitle: "Three ways to look",
    pillars: {
      who: { title: "Who's buying", desc: "Track quarterly SEC 13F holdings of top managers like Buffett and Burry." },
      worth: { title: "Is it worth it", desc: "Pair holdings with single-stock valuation to see if a good company is at a good price.", soon: "Valuation data coming soon" },
      macro: { title: "Macro backdrop", desc: "Repo, rates, auctions, and Fed facilities — read the funding backdrop." },
    },
    focusTitle: "This week's focus",
    focusInvestors: "Largest portfolios right now",
    focusMacro: "One macro signal worth watching",
    topHolding: "Top holding",
    viewAll: "View all",
    sources: "Sources: SEC EDGAR 13F, NY Fed, Treasury.gov.",
  },
} as const;

// ── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const t = COPY[lang];
  return { title: `${t.product}`, description: t.headline };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Pick one meaningful macro headline signal, defensively. Returns null if none usable. */
function pickMacroSignal(
  lang: Lang,
  sections: Record<string, Section>
): { indicator: string; name: string; metricLabel: string; value: string } | null {
  // Priority order: funding-stress style signals first, then broad fallbacks.
  const candidates = [
    "reference-rates",
    "repo-financing",
    "dealer-inventory",
    "auction-risk",
    "fails",
    "soma",
  ];
  for (const indicator of candidates) {
    const section = sections[indicator];
    if (!section) continue;
    const metric: Metric | undefined = section.key_metrics?.find(
      (m) => m.value && !m.value.toLowerCase().includes("unavailable")
    );
    if (!metric) continue;
    const name = sectionLabel(lang, section) ?? indicator;
    const lbl = metricLabel(lang, metric) ?? metric.label;
    const value = `${metric.value}${metric.unit ? " " + metric.unit : ""}`;
    return { indicator, name, metricLabel: lbl, value };
  }
  return null;
}

// ── Sub-components (server-safe; hover via CSS utility classes only) ───────────

function PillarCard({
  icon: Icon,
  title,
  desc,
  soon,
  href,
}: {
  icon: typeof Users;
  title: string;
  desc: string;
  soon?: string;
  href?: string;
}) {
  const inner = (
    <Card
      className={
        "h-full transition-colors" + (href ? " hover:border-primary/40" : "")
      }
    >
      <CardContent className="flex h-full flex-col gap-3 px-6 py-6">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {soon && (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {soon}
            </Badge>
          )}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
        {href && (
          <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium text-primary">
            <ArrowRight className="size-4" aria-hidden />
          </span>
        )}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function ManagerMiniCard({ lang, manager }: { lang: Lang; manager: ManagerSummary }) {
  const t = COPY[lang];
  return (
    <Link href={investorPath(lang, manager.slug)} className="block">
      <Card className="h-full transition-colors hover:border-primary/40">
        <CardContent className="flex h-full flex-col gap-1.5 px-5 py-4">
          <span className="truncate text-sm font-semibold text-foreground">
            {manager.person}
          </span>
          <span className="tnum font-mono text-base font-semibold text-primary">
            {formatUSD(manager.totalValue)}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {t.topHolding}: {titleCase(manager.topHolding)}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const t = COPY[lang];

  // Real data, defensive.
  const managerIdx = await getManagerIndex();
  const topManagers = [...(managerIdx.managers ?? [])]
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 4);

  let macroSignal: ReturnType<typeof pickMacroSignal> = null;
  try {
    const data = await buildAllSections();
    macroSignal = pickMacroSignal(lang, data.sections);
  } catch {
    macroSignal = null;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-14 px-2 py-8 sm:py-12">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-start gap-5">
        <Badge variant="secondary">{t.beta}</Badge>
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          {t.headline}
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t.sub}
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link href={`/${lang}/investors`} className={buttonVariants({ size: "lg" })}>
            {t.ctaPrimary}
          </Link>
          <Link
            href={`/${lang}/macro`}
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            {t.ctaSecondary}
          </Link>
        </div>
      </section>

      {/* ── Three pillars ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {t.pillarsTitle}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PillarCard
            icon={Users}
            title={t.pillars.who.title}
            desc={t.pillars.who.desc}
            href={`/${lang}/investors`}
          />
          <PillarCard
            icon={LineChart}
            title={t.pillars.worth.title}
            desc={t.pillars.worth.desc}
            soon={t.pillars.worth.soon}
          />
          <PillarCard
            icon={Activity}
            title={t.pillars.macro.title}
            desc={t.pillars.macro.desc}
            href={`/${lang}/macro`}
          />
        </div>
      </section>

      {/* ── This week's focus ─────────────────────────────────────────── */}
      {(topManagers.length > 0 || macroSignal) && (
        <section className="flex flex-col gap-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {t.focusTitle}
          </h2>

          {topManagers.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {t.focusInvestors}
                </span>
                <Link
                  href={`/${lang}/investors`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  {t.viewAll}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {topManagers.map((m) => (
                  <ManagerMiniCard key={m.cik} lang={lang} manager={m} />
                ))}
              </div>
            </div>
          )}

          {macroSignal && (
            <div className="flex flex-col gap-3">
              <span className="text-sm font-medium text-foreground">
                {t.focusMacro}
              </span>
              <Link href={macroPath(lang, macroSignal.indicator)} className="block">
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {macroSignal.name}
                      </span>
                      <span className="text-sm text-foreground">
                        {macroSignal.metricLabel}
                      </span>
                    </div>
                    <span className="tnum font-mono text-xl font-semibold text-foreground">
                      {macroSignal.value}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </div>
          )}
        </section>
      )}

      {/* ── Sources line (short; full trust note is in AppShell footer) ── */}
      <p className="text-xs leading-relaxed text-muted-foreground">{t.sources}</p>
    </div>
  );
}
