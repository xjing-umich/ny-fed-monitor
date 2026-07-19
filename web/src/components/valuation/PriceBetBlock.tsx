import type { FC } from "react";
import type { Lang } from "@/lib/nav";
import type { Tone } from "@/components/entity/types";
import type { ExpectationsAssessment, ExpectationsTier } from "@/lib/valuation/types";
import { IMPLIED_G_MIN, IMPLIED_G_MAX } from "@/lib/valuation/impliedExpectations";

function pct1(x: number): string {
  const r = (x * 100).toFixed(1);
  return `${r === "-0.0" ? "0.0" : r}%`;
}

// ── masthead 微徽章 ───────────────────────────────────────────────────────
// 与估值 verdict 徽章并列(不替换)。tone 恒为 neutral —— 这是一条事实陈述(现价
// 隐含的增速档位),不是买卖信号,不与击球区/高于价值的色彩语汇混用。
const BADGE_LABEL: Record<Lang, Record<ExpectationsTier, string>> = {
  zh: { modest: "预期 · 温和", fair: "预期 · 公允", demanding: "预期 · 苛刻" },
  en: { modest: "Expectations · modest", fair: "Expectations · fair", demanding: "Expectations · demanding" },
};

export function expectationsBadge(
  e: ExpectationsAssessment | undefined,
  lang: Lang,
): { label: string; tone: Tone } | null {
  if (!e?.assessable || !e.tier) return null;
  return { label: BADGE_LABEL[lang][e.tier], tone: "neutral" };
}

// ── 估值章节内的「价格在赌什么」块 ───────────────────────────────────────────
const COPY = {
  zh: {
    label: "价格在赌什么",
    boundedAbove: (v: string) => `高于 ${v}`,
    boundedBelow: (v: string) => `低于 ${v}`,
    outOfRange: "（已超出常规区间）",
    sentencePrefix: "现价把公司未来几年的 owner-earnings 年增定在 ",
    sentenceMid: "；公司过去营收年增 ",
    sentenceSuffix: "。",
    tierNote: {
      modest: "低于它自己做到过的。",
      fair: "和它自己一贯的水平差不多。",
      demanding: "市场要它明显快过自己一贯的水平。",
    } as Record<ExpectationsTier, string>,
    capPrefix: "粗略地说，现价要它按历史营收增速再增长约 ",
    capSuffix: " 年，才刚好撑得起。",
    lowConfidence:
      "价值带信心不足时仍可对照：这里只说明市场在赌多快，不把它当成「确认便宜」。",
  },
  en: {
    label: "What the price is betting",
    boundedAbove: (v: string) => `over ${v}`,
    boundedBelow: (v: string) => `under ${v}`,
    outOfRange: " (outside the usual range)",
    sentencePrefix: "Today's price pencils in about ",
    sentenceMid: " a year in owner-earnings for the next few years. Revenue actually grew ",
    sentenceSuffix: " a year.",
    tierNote: {
      modest: "Below what it has already done.",
      fair: "About its own track record.",
      demanding: "The market wants it well ahead of its own track record.",
    } as Record<ExpectationsTier, string>,
    capPrefix: "Roughly, the price needs its historical revenue growth to run about ",
    capSuffix: " more years to hold up.",
    lowConfidence:
      "Even when the value band is low-confidence: use this to see what the price assumes — not as a cheapness confirmation.",
  },
} as const;

export const PriceBetBlock: FC<{
  expectations: ExpectationsAssessment;
  lang: Lang;
  /** 价值带 reliable=false 时仍展示本块，但加一句「只读预期、不确认便宜」。 */
  lowConfidence?: boolean;
}> = ({ expectations, lang, lowConfidence = false }) => {
  if (
    !expectations.assessable ||
    expectations.impliedGrowth == null ||
    expectations.historicalGrowth == null ||
    !expectations.tier
  ) {
    return null;
  }
  const t = COPY[lang];
  const bounded = expectations.impliedGrowthBounded;
  const impliedLabel =
    bounded === "above"
      ? t.boundedAbove(pct1(IMPLIED_G_MAX))
      : bounded === "below"
        ? t.boundedBelow(pct1(IMPLIED_G_MIN))
        : pct1(expectations.impliedGrowth);
  const historicalLabel = pct1(expectations.historicalGrowth);

  return (
    <div className="mt-4 border-t border-[var(--tt-border)] pt-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{t.label}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-text)]">
        {t.sentencePrefix}
        <span className="font-semibold font-mono">{impliedLabel}</span>
        {bounded ? t.outOfRange : ""}
        {t.sentenceMid}
        <span className="font-semibold font-mono">{historicalLabel}</span>
        {t.sentenceSuffix}
      </p>
      <p className="mt-1 text-sm text-[var(--tt-muted)]">{t.tierNote[expectations.tier]}</p>
      {expectations.impliedCapYears != null ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--tt-muted)]">
          {t.capPrefix}
          <span className="font-semibold font-mono text-[var(--tt-muted)]">{expectations.impliedCapYears}</span>
          {t.capSuffix}
        </p>
      ) : null}
      {lowConfidence ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--tt-warn)]">{t.lowConfidence}</p>
      ) : null}
    </div>
  );
};
