import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { macroPath, localePath } from "@/lib/urls";
import { altFor, ogFor } from "@/lib/seo";
import { readMacroSnapshot } from "@/lib/macroSnapshot";
import { MacroRefreshing } from "./MacroRefreshing";
import {
  DRIVER_MODULES,
  RESEARCH_PROMPTS,
  UPCOMING_MACRO_EVENTS,
  buildCrossSignalChecks,
  buildLatestUpdates,
  buildMacroSummary,
  buildMarketSnapshot,
  buildWatchItems,
  type CrossSignalCheck,
  type ResearchPrompt,
  type SnapshotItem,
  type WatchItem,
} from "@/lib/macroResearch";
import SubNav from "@/components/shell/SubNav";
import MacroViewHero from "./MacroViewHero";
import MacroViewModules from "./MacroViewModules";
import MacroSubNav from "./MacroSubNav";

// 宏观数据由 cron 日更(macro:ingest);与 /macro/[indicator] 子页一致用日级 ISR 静态化,
// 而非每 10 分钟重验把整段大 JSONB 快照反复读出(egress) → 概览页 CDN 秒开。
export const revalidate = 86400;

// ── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  // canonical 去掉 ?view= 查询串 → 把 SubNav 链接的 5 个 ?view= 变体全部收口到 /{lang}/macro,
  // 消除近重复 URL 的爬取浪费;同时补上此前缺失的 hreflang(en↔zh 互指)与 per-page OG。
  const alternates = altFor(lang, "/macro");
  const title =
    lang === "zh" ? "宏观 / 流动性 — Treasury Market Monitor" : "Macro / Liquidity — Treasury Market Monitor";
  const description =
    lang === "zh"
      ? "资金面、供给面、政策面全景：回购融资、基准利率、美联储工具、国债拍卖、SOMA 持仓与政策预期。"
      : "Full-spectrum view of funding, supply, and policy: repo financing, reference rates, Fed facilities, Treasury auctions, SOMA portfolio, and policy expectations.";
  return { title, description, alternates, ...ogFor({ lang, title, description, path: localePath(lang, "/macro") }) };
}

// ── Tone → signal color ───────────────────────────────────────────────────────

const TONE_ACCENT: Record<string, string> = {
  red:    "var(--tt-negative)",
  orange: "var(--tt-warn)",
  yellow: "var(--tt-warn)",
  green:  "var(--tt-positive)",
  gray:   "var(--tt-faint)",
};

function ToneDot({ tone }: { tone: SnapshotItem["tone"] | WatchItem["tone"] | CrossSignalCheck["tone"] }) {
  return (
    <span
      aria-hidden="true"
      className="mt-[0.35rem] h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: TONE_ACCENT[tone] ?? TONE_ACCENT.gray }}
    />
  );
}

function SnapshotCell({ item, lang }: { item: SnapshotItem; lang: Lang }) {
  return (
    <Link href={macroPath(lang, item.hrefKey ?? item.sourceKey)} className="block border-t border-[var(--tt-border)] py-3 no-underline">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
          {item.label[lang]}
        </span>
        <ToneDot tone={item.tone} />
      </div>
      <div className="mt-1 font-mono text-base font-medium tabular-nums text-[var(--tt-text)]">
        {item.value}
      </div>
    </Link>
  );
}

function WatchRow({ item, lang }: { item: WatchItem; lang: Lang }) {
  const content = (
    <div className="border-t border-[var(--tt-border)] py-3">
      <div className="flex items-start gap-2">
        <ToneDot tone={item.tone} />
        <div>
          <div className="font-display text-sm font-medium text-[var(--tt-text)]">
            {item.label[lang]}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--tt-muted)]">
            {item.detail[lang]}
          </p>
        </div>
      </div>
    </div>
  );
  if (!item.sourceKey) return content;
  return <Link href={macroPath(lang, item.sourceKey)} className="block no-underline">{content}</Link>;
}

function CrossSignalRow({ item, lang }: { item: CrossSignalCheck; lang: Lang }) {
  return (
    <Link href={macroPath(lang, item.primaryKey)} className="block no-underline">
      <div className="border-t border-[var(--tt-border)] py-3">
        <div className="flex items-start gap-2">
          <ToneDot tone={item.tone} />
          <div>
            <div className="font-display text-sm font-medium text-[var(--tt-text)]">
              {item.label[lang]}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--tt-muted)]">
              {item.detail[lang]}
            </p>
            <span className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-accent)]">
              {lang === "zh" ? "查看相关指标 →" : "Open related signal →"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ResearchPromptCard({ item, lang }: { item: ResearchPrompt; lang: Lang }) {
  return (
    <Link href={macroPath(lang, item.hrefKey)} className="indicator-card block no-underline">
      <div className="border-t border-[var(--tt-border)] py-3">
        <div className="font-display text-sm font-medium leading-snug text-[var(--tt-text)]">
          {item.question[lang]}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--tt-muted)]">
          {item.detail[lang]}
        </p>
        <span className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-accent)]">
          {lang === "zh" ? "深挖 →" : "Dive deeper →"}
        </span>
      </div>
    </Link>
  );
}

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--tt-border)] pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-accent)]">
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MacroOverviewPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<React.ReactElement> {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  // 从物化快照读(构建期不再实时抓外部 API)。快照暂无 → 优雅"刷新中",构建必成功。
  const data = await readMacroSnapshot();
  if (!data) return <MacroRefreshing lang={lang} />;
  const summary = buildMacroSummary(data);
  const snapshot = buildMarketSnapshot(data);
  const watchItems = buildWatchItems(data);
  const crossSignalChecks = buildCrossSignalChecks(data);
  const latestUpdates = buildLatestUpdates(data);

  return (
    <div className="mx-auto max-w-5xl py-8 sm:py-10 flex flex-col gap-10">
      {/* CSS hover: indicator links darken text on hover — no JS event handlers */}
      <style>{`.indicator-card:hover span.font-display { color: var(--tt-accent); }`}</style>

      <React.Suspense
        fallback={(
          <header className="border-b border-[var(--tt-border)] pb-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
              {lang === "zh" ? "宏观 / 流动性" : "Macro / Liquidity"}
            </div>
            <h1 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
              {lang === "zh" ? "美债市场监控" : "Treasury Market Monitor"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--tt-muted)]">
              {lang === "zh"
                ? "先看市场摘要、核心快照和异动，再下钻到资金面、供给面、政策面与宏观定价。"
                : "Start with the market summary, core snapshot, and watch items, then drill into funding, supply, policy, and macro pricing."}
            </p>
          </header>
        )}
      >
        <MacroViewHero lang={lang} />
      </React.Suspense>

      {/* Section sub-nav */}
      <React.Suspense fallback={<SubNav lang={lang} section="macro" />}>
        <MacroSubNav lang={lang} />
      </React.Suspense>

      <React.Suspense fallback={null}>
        <MacroViewModules lang={lang} data={data} placement="featured" />
      </React.Suspense>

      <section>
        <SectionKicker>{lang === "zh" ? "市场摘要" : "Market Summary"}</SectionKicker>
        <div className="grid gap-x-10 gap-y-5 border-b border-[var(--tt-border)] py-5 md:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h2 className="font-display text-2xl font-medium leading-tight text-[var(--tt-text)]">
              {summary.headline[lang]}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--tt-muted)]">
              {summary.primaryDriver[lang]}
            </p>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {summary.bullets.map((item) => (
              <li key={item.en} className="border-t border-[var(--tt-border)] pt-2 text-xs leading-relaxed text-[var(--tt-muted)]">
                {item[lang]}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "市场快照" : "Market Snapshot"}</SectionKicker>
        <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.map((item) => (
            <SnapshotCell key={item.key} item={item} lang={lang} />
          ))}
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "异动与观察清单" : "Top Changes / Watch Items"}</SectionKicker>
        <div className="grid gap-x-10 md:grid-cols-2">
          {watchItems.map((item) => (
            <WatchRow key={item.key} item={item} lang={lang} />
          ))}
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "交叉信号检查" : "Cross-Signal Checks"}</SectionKicker>
        <div className="grid gap-x-10 md:grid-cols-2">
          {crossSignalChecks.map((item) => (
            <CrossSignalRow key={item.key} item={item} lang={lang} />
          ))}
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "研究问题" : "Research Questions"}</SectionKicker>
        <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
          {RESEARCH_PROMPTS.map((item) => (
            <ResearchPromptCard key={item.key} item={item} lang={lang} />
          ))}
        </div>
      </section>

      {/* Driver modules */}
      <React.Suspense fallback={null}>
        <MacroViewModules lang={lang} data={data} placement="remaining" />
      </React.Suspense>

      <section>
        <SectionKicker>{lang === "zh" ? "宏观定价下一步" : "Macro Pricing Next Coverage"}</SectionKicker>
        <div className="grid gap-x-10 gap-y-4 border-b border-[var(--tt-border)] py-4 md:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="font-display text-xl font-medium text-[var(--tt-text)]">
              {lang === "zh" ? "市场价格与宏观确认已接入" : "Market pricing and macro confirmation are live"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--tt-muted)]">
              {lang === "zh"
                ? "FRED 曲线、实际收益率、breakeven、GDPNow、Chicago financial/activity indexes、就业、CPI/PCE 和 Atlanta Fed Wage Growth Tracker 已进入 Macro Pricing。下一步补 Cleveland inflation nowcast。"
                : "FRED curve, real-yield, breakeven, GDPNow, Chicago financial/activity indexes, labor, CPI/PCE, and the Atlanta Fed Wage Growth Tracker now power Macro Pricing. Cleveland inflation nowcast is next."}
            </p>
          </div>
          <ul className="m-0 grid list-none gap-x-8 p-0 sm:grid-cols-2">
            {(DRIVER_MODULES.find((item) => item.key === "macro-pricing")?.comingSignals ?? []).map((item) => (
              <li key={item.en} className="border-t border-[var(--tt-border)] py-2 text-xs leading-relaxed text-[var(--tt-muted)]">
                {item[lang]}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "未来事件" : "Upcoming Macro Events"}</SectionKicker>
        <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {UPCOMING_MACRO_EVENTS.map((item) => (
            <div key={item.en} className="border-t border-[var(--tt-border)] py-3 text-sm text-[var(--tt-text)]">
              {item[lang]}
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "最新数据更新" : "Latest Data Updates"}</SectionKicker>
        <div className="grid gap-x-10 md:grid-cols-2">
          {latestUpdates.map((item) => (
            <p key={item.en} className="m-0 border-t border-[var(--tt-border)] py-3 text-xs leading-relaxed text-[var(--tt-muted)]">
              {item[lang]}
            </p>
          ))}
        </div>
      </section>

    </div>
  );
}
