import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SubNav from "@/components/shell/SubNav";
import type { Lang } from "@/lib/nav";
import { macroPath, localePath } from "@/lib/urls";
import { altFor, ogFor } from "@/lib/seo";
import {
  DRIVER_MODULES,
  MACRO_INDICATOR_RESEARCH,
  MACRO_USEFULNESS,
  type MacroDisplayLevel,
  type MacroSignalRole,
} from "@/lib/macroResearch";
import { SECTION_NAME, type IndicatorKey } from "@/lib/macroNames";

// 方法论为近静态内容,日级 ISR 足够。
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const alternates = altFor(lang, "/macro/methodology");
  const title = lang === "zh" ? "宏观方法论 — Treasury Market Monitor" : "Macro Methodology — Treasury Market Monitor";
  const description =
    lang === "zh"
      ? "说明宏观首页如何选择信号、如何降级低价值数据、以及各指标的数据来源和使用边界。"
      : "How the macro dashboard selects top-level signals, downgrades low-usefulness data, and maps indicators to sources.";
  return {
    title,
    description,
    alternates,
    ...ogFor({ lang, title, description, path: localePath(lang, "/macro/methodology") }),
  };
}

const DISPLAY_LABEL: Record<MacroDisplayLevel, { zh: string; en: string }> = {
  overview: { zh: "首页核心", en: "Home overview" },
  detail: { zh: "详情页", en: "Detail page" },
  source: { zh: "来源/方法论", en: "Source / methodology" },
  hidden: { zh: "隐藏", en: "Hidden" },
};

const ROLE_LABEL: Record<MacroSignalRole, { zh: string; en: string }> = {
  core_signal: { zh: "核心信号", en: "Core signal" },
  supporting_signal: { zh: "辅助信号", en: "Supporting signal" },
  context_metadata: { zh: "背景信息", en: "Context metadata" },
  todo_placeholder: { zh: "待接入占位", en: "TODO placeholder" },
};

const DISPLAY_RULES = [
  {
    zh: "Score 5：可以进入首页快照，并参与市场摘要或观察清单。",
    en: "Score 5: eligible for the home snapshot and market summary/watch list.",
  },
  {
    zh: "Score 4：重要辅助信号，可以进入首页或 driver module，但不单独决定结论。",
    en: "Score 4: important supporting signal; may appear on the home page or driver module, but should not decide the verdict alone.",
  },
  {
    zh: "Score 3：保留在详情页或来源层，适合做背景交叉验证。",
    en: "Score 3: stays in detail/source layers for background cross-checks.",
  },
  {
    zh: "Score 1-2：metadata-only、TODO、空表或低价值信号，不进入用户主路径。",
    en: "Score 1-2: metadata-only, TODO, empty, or low-usefulness signals stay out of the main user path.",
  },
];

const CONFIDENCE_RULES = [
  {
    zh: "单个读数只触发观察，不直接生成高置信度结论。",
    en: "A single print can trigger a watch item, but not a high-confidence conclusion.",
  },
  {
    zh: "高置信度判断需要 driver signal、独立确认和数据新鲜度同时成立。",
    en: "High-confidence calls require a driver signal, independent confirmation, and acceptable freshness.",
  },
  {
    zh: "不同频率的数据要明确降级：日频价格、周度 dealer/FCI、月度就业/通胀不能强行解释同一天行情。",
    en: "Mixed frequencies are downgraded explicitly: daily pricing, weekly dealer/FCI, and monthly labor/inflation data should not be forced into one same-day story.",
  },
  {
    zh: "相关指标可以增加 breadth，但不能伪装成独立证据，例如 SOFR、TGCR、BGCR 都属于同一资金利率族群。",
    en: "Related indicators can add breadth, but should not be treated as fully independent evidence, such as SOFR, TGCR, and BGCR within the same repo-rate family.",
  },
];

const PLANNED_SOURCES = [
  {
    label: { zh: "FRED（已接入）", en: "FRED (connected)" },
    use: {
      zh: "曲线、实际利率、breakeven、CPI/PCE、就业、失业率和 Atlanta Fed Wage Growth Tracker 已接入；财政代理变量后续扩展。",
      en: "Curve, real yields, breakevens, CPI/PCE, payrolls, unemployment, and the Atlanta Fed Wage Growth Tracker are connected; fiscal proxies are later extensions.",
    },
  },
  {
    label: { zh: "Atlanta Fed GDPNow（已接入）", en: "Atlanta Fed GDPNow (connected)" },
    use: {
      zh: "GDPNow 与 Wage Growth Tracker 已通过 FRED 接入。",
      en: "GDPNow and the Wage Growth Tracker are connected through FRED.",
    },
  },
  {
    label: { zh: "Cleveland Fed", en: "Cleveland Fed" },
    use: {
      zh: "Inflation nowcast 与通胀预期，用于通胀持久性判断。",
      en: "Inflation nowcast and expectations for inflation persistence.",
    },
  },
  {
    label: { zh: "Chicago Fed（已接入）", en: "Chicago Fed (connected)" },
    use: {
      zh: "NFCI、ANFCI、CFNAI 已通过 FRED 接入，用于金融条件和全国活动指数。",
      en: "NFCI, ANFCI, and CFNAI are connected through FRED for financial conditions and national activity.",
    },
  },
  {
    label: { zh: "San Francisco Fed", en: "San Francisco Fed" },
    use: {
      zh: "r-star / neutral rate，用于实际政策立场和长端中枢。",
      en: "r-star / neutral rate for real policy stance and long-end anchors.",
    },
  },
];

function indicatorName(lang: Lang, key: string): string {
  const name = SECTION_NAME[key as IndicatorKey];
  return name ? name[lang] : key;
}

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--tt-border)] pb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
      {children}
    </div>
  );
}

export default async function MacroMethodologyPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<React.ReactElement> {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  const rows = Object.entries(MACRO_USEFULNESS);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-2 py-8 sm:py-10">
      <SubNav lang={lang} section="macro" active="methodology" />

      <header className="border-b border-[var(--tt-border)] pb-6">
        <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
          {lang === "zh" ? "宏观方法论" : "Macro Methodology"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--tt-muted)]">
          {lang === "zh"
            ? "这个页面解释首页为什么只展示少量核心信号：先判断美债市场压力，再把数据来源、限制和待接入覆盖放在可追溯的二级层。"
            : "This page explains why the home view shows only a small set of core signals: first identify Treasury market pressure, then keep sources, limits, and planned coverage in traceable second-level layers."}
        </p>
      </header>

      <section>
        <SectionKicker>{lang === "zh" ? "展示规则" : "Display Rules"}</SectionKicker>
        <div className="grid gap-x-10 md:grid-cols-[0.9fr_1.1fr]">
          <div className="border-t border-[var(--tt-border)] py-4">
            <h2 className="font-display text-xl font-medium text-[var(--tt-text)]">
              {lang === "zh" ? "首页不是数据目录" : "The home page is not a data directory"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--tt-muted)]">
              {lang === "zh"
                ? "参考 Google Finance 的信息层级，首页先回答“现在最该看什么”，而不是罗列所有来源。低价值、metadata-only 和 TODO 信号会降级到详情或方法论层。"
                : "Following the information hierarchy of Google Finance, the home page answers what to look at first instead of listing every source. Low-usefulness, metadata-only, and TODO signals are downgraded to detail or methodology layers."}
            </p>
          </div>
          <ul className="m-0 grid list-none gap-0 p-0">
            {DISPLAY_RULES.map((rule) => (
              <li key={rule.en} className="border-t border-[var(--tt-border)] py-3 text-sm leading-relaxed text-[var(--tt-muted)]">
                {rule[lang]}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "置信度规则" : "Confidence Rules"}</SectionKicker>
        <div className="grid gap-x-10 md:grid-cols-[0.9fr_1.1fr]">
          <div className="border-t border-[var(--tt-border)] py-4">
            <h2 className="font-display text-xl font-medium text-[var(--tt-text)]">
              {lang === "zh" ? "先确认，再归因" : "Confirm Before Attributing"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--tt-muted)]">
              {lang === "zh"
                ? "canonical 包的核心不是增加更多卡片，而是给每个信号设置信心边界：资金、供给、宏观和政策都要经过交叉验证，避免用一个漂亮数字讲完整故事。"
                : "The canonical package is less about adding more cards and more about confidence boundaries: funding, supply, macro, and policy signals all need cross-checks before one clean number becomes a full story."}
            </p>
          </div>
          <ul className="m-0 grid list-none gap-0 p-0">
            {CONFIDENCE_RULES.map((rule) => (
              <li key={rule.en} className="border-t border-[var(--tt-border)] py-3 text-sm leading-relaxed text-[var(--tt-muted)]">
                {rule[lang]}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "四个驱动模块" : "Four Driver Modules"}</SectionKicker>
        <div className="grid gap-x-8 sm:grid-cols-2">
          {DRIVER_MODULES.map((driver) => (
            <div key={driver.key} className="border-t border-[var(--tt-border)] py-4">
              <h2 className="font-display text-lg font-medium text-[var(--tt-text)]">
                {driver.label[lang]}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--tt-muted)]">
                {driver.question[lang]}
              </p>
              {driver.indicatorKeys.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {driver.indicatorKeys.map((key) => (
                    <Link
                      key={key}
                      href={macroPath(lang, key)}
                      className="rounded-sm border border-[var(--tt-border)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-muted)] no-underline hover:border-[var(--tt-accent)] hover:text-[var(--tt-accent)]"
                    >
                      {indicatorName(lang, key)}
                    </Link>
                  ))}
                </div>
              )}
              {driver.comingSignals && (
                <ul className="mt-3 m-0 list-none p-0">
                  {driver.comingSignals.map((item) => (
                    <li key={item.en} className="border-t border-[var(--tt-border)] py-2 text-xs leading-relaxed text-[var(--tt-muted)]">
                      {item[lang]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "信号分级表" : "Signal Triage"}</SectionKicker>
        <div className="overflow-x-auto border-t border-[var(--tt-border)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--tt-border)] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
                <th className="py-2 pr-4 font-medium">{lang === "zh" ? "指标" : "Indicator"}</th>
                <th className="py-2 pr-4 font-medium">Score</th>
                <th className="py-2 pr-4 font-medium">{lang === "zh" ? "展示层级" : "Display"}</th>
                <th className="py-2 pr-4 font-medium">{lang === "zh" ? "角色" : "Role"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, rule]) => (
                <tr key={key} className="border-b border-[var(--tt-border)]">
                  <td className="py-2.5 pr-4 text-[var(--tt-text)]">
                    <Link href={macroPath(lang, key)} className="text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">
                      {indicatorName(lang, key)}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs tabular-nums text-[var(--tt-muted)]">
                    {rule.usefulnessScore}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-[var(--tt-muted)]">
                    {DISPLAY_LABEL[rule.displayLevel][lang]}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-[var(--tt-muted)]">
                    {ROLE_LABEL[rule.signalRole][lang]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "数据来源链路" : "Data Lineage"}</SectionKicker>
        <div className="grid gap-x-8 sm:grid-cols-2">
          {Object.entries(MACRO_INDICATOR_RESEARCH).map(([key, note]) => (
            <div key={key} className="border-t border-[var(--tt-border)] py-4">
              <Link href={macroPath(lang, key)} className="font-display text-base font-medium text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">
                {indicatorName(lang, key)}
              </Link>
              <p className="mt-2 text-xs leading-relaxed text-[var(--tt-muted)]">
                {note.lineage[lang]}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-faint)]">
                {note.sources.join(" / ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionKicker>{lang === "zh" ? "覆盖状态" : "Coverage Status"}</SectionKicker>
        <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {PLANNED_SOURCES.map((source) => (
            <div key={source.label.en} className="border-t border-[var(--tt-border)] py-4">
              <h2 className="font-display text-base font-medium text-[var(--tt-text)]">
                {source.label[lang]}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-[var(--tt-muted)]">
                {source.use[lang]}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
