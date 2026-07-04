import type { FilingData } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import { deriveConviction, type ConvictionSignal } from "@/lib/managers/conviction";

export type RowSignal = {
  conviction?: { label: string; signal: ConvictionSignal };
  cheap?: { marginPct: number | null };
};

// 行内信念徽章短标签(比 ConvictionPicks 卡片更短; 单行不换行)。
const CONV_LABEL: Record<Lang, Record<ConvictionSignal, (q: number, s: number) => string>> = {
  zh: {
    accumulating: (_q, s) => `连续加仓·${s}季`,
    fresh_conviction: () => "重磅新建",
    long_core: (q) => `长期核心·${q}季`,
    never_trimmed: (q) => `从不减仓·${q}季`,
  },
  en: {
    accumulating: (_q, s) => `Adding ${s}q`,
    fresh_conviction: () => "Big new buy",
    long_core: (q) => `Core ${q}q`,
    never_trimmed: (q) => `Never trimmed`,
  },
};

/**
 * 按 cusip 归并两类行内信号(高信念 + 便宜/击球区)。key = cusip。
 * convictionLimit 放宽到 12(默认): 内联徽章覆盖面比原 3 张卡片宽,但仍只标"够格"的。
 */
export function deriveRowSignals({
  filings,
  verdicts,
  cusipToTicker,
  lang,
  convictionLimit = 12,
}: {
  filings: FilingData[];
  verdicts: Map<string, SnapshotVerdict>;
  cusipToTicker: Map<string, string>;
  lang: Lang;
  convictionLimit?: number;
}): Map<string, RowSignal> {
  const out = new Map<string, RowSignal>();

  // 信念
  const picks = deriveConviction(filings, convictionLimit);
  for (const p of picks) {
    const label = CONV_LABEL[lang][p.signal](p.quartersHeld, p.addStreak);
    out.set(p.cusip, { ...(out.get(p.cusip) ?? {}), conviction: { label, signal: p.signal } });
  }

  // 便宜(击球区): 遍历有 verdict 的 cusip
  for (const [cusip, ticker] of cusipToTicker) {
    const v = verdicts.get(ticker.toUpperCase());
    if (v?.inStrikeZone) {
      out.set(cusip, { ...(out.get(cusip) ?? {}), cheap: { marginPct: v.marginPct } });
    }
  }

  return out;
}
