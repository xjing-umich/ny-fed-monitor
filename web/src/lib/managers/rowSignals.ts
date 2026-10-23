import type { FilingData } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { deriveConviction, type ConvictionSignal } from "@/lib/managers/conviction";

export type RowSignal = {
  conviction?: { label: string; signal: ConvictionSignal };
};

// 行内信念徽章短标签(单行不换行)。
// fresh_conviction 同时覆盖新建与加仓(conviction.ts: 最新季持股 > 上一季且权重 ≥3%);
// q = 末尾连续持有季数,q === 1 即上一季持股为 0 → 新建,否则是加仓。只写"新建"会把加仓说成新开仓。
const CONV_LABEL: Record<Lang, Record<ConvictionSignal, (q: number, s: number) => string>> = {
  zh: {
    accumulating: (_q, s) => `连续加仓·${s}季`,
    fresh_conviction: (q) => (q === 1 ? "重磅新建" : "重磅加仓"),
    long_core: (q) => `长期核心·${q}季`,
    never_trimmed: (q) => `从不减仓·${q}季`,
  },
  en: {
    accumulating: (_q, s) => `Adding · ${s} quarters`,
    fresh_conviction: (q) => (q === 1 ? "Big new position" : "Big add"),
    long_core: (q) => `Core · ${q} quarters`,
    never_trimmed: (q) => `No trims · ${q} quarters`,
  },
};

/**
 * 按 cusip 归并行内信念徽章(高信念)。key = cusip。
 * convictionLimit 放宽到 12(默认): 内联徽章覆盖面比原 3 张卡片宽,但仍只标"够格"的。
 * (便宜/击球区徽章已移除 —— 与同行「估值」列 ValuationBadge + 估值姿态小节 chip 重复。)
 */
export function deriveRowSignals({
  filings,
  lang,
  convictionLimit = 12,
}: {
  filings: FilingData[];
  lang: Lang;
  convictionLimit?: number;
}): Map<string, RowSignal> {
  const out = new Map<string, RowSignal>();

  // 信念
  const picks = deriveConviction(filings, convictionLimit);
  for (const p of picks) {
    const label = CONV_LABEL[lang][p.signal](p.quartersHeld, p.addStreak);
    out.set(p.cusip, { conviction: { label, signal: p.signal } });
  }

  return out;
}
