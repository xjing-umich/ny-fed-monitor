import type { Lang } from "@/lib/nav";
import type { LatestPrice } from "@/lib/managers/priceRead";
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";
import type { ConclusionLeftState } from "./stockConclusion";
import { bandPosition } from "@/lib/valuation/bandPosition";
import { priceSourceName } from "@/lib/valuation/asOf";

export type LinearValueScale = { max: number; low: number; high: number; price: number; ticks: number[] };

/** 原始美元值同轴映射,不使用三段等宽或截断现价。极大/极小数避免中间乘法溢出。 */
export function linearValueAxis(lo: number, hi: number, price: number): LinearValueScale | null {
  if (![lo, hi, price].every((v) => Number.isFinite(v) && v > 0) || lo > hi) return null;
  const largest = Math.max(hi, price);
  const padded = largest * 1.08;
  const rough = padded / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= rough)! * magnitude;
  const ceiling = Math.ceil(padded / step) * step;
  const safe = Number.isFinite(ceiling) && Number.isFinite(step) && step > 0 && ceiling >= largest;
  const max = safe ? ceiling : largest;
  const count = safe ? Math.round(max / step) : 1;
  const ticks = safe && count <= 5 ? Array.from({ length: count + 1 }, (_, i) => i * step) : [0, max];
  return { max, low: lo / max * 100, high: hi / max * 100, price: price / max * 100, ticks };
}

export type StockSummaryKind = "earnings" | "zero-growth" | "sotp";
export type StockValueSummary = {
  kind: StockSummaryKind;
  pending?: boolean;
  price: number;
  rangeLo: number;
  rangeHi: number;
  date: string;
  source: string;
  reference: number | null;
  referenceLabel: string;
  rangeLabel: string;
  position: "below" | "within" | "above";
  heading: string;
  gap: string | null;
  axis: LinearValueScale;
};

/** 只接受当前编排层的可信结论;没有结论就保留页面原有原因,不在展示层重算一个。 */
export function stockValueSummary(input: {
  verdict: ValuationVerdict | null | undefined;
  quote: LatestPrice | null;
  reference?: number;
  kind: StockSummaryKind;
  securityUnit?: "share" | "ADS";
}, lang: Lang): StockValueSummary | null {
  const { verdict: v, quote: q } = input;
  const pending=v?.referenceOnly==="missing_reinvestment";
  const kind=pending?"zero-growth":input.kind;
  if ((!v?.reliable && !pending) || !v || !q || q.stale || q.currency.toUpperCase() !== "USD" || !Number.isFinite(q.close) || q.close <= 0) return null;
  if (q.date !== v.priceDate || !Number.isFinite(v.price) || Math.abs(q.close - v.price) > Math.max(1, q.close) * 1e-9) return null;
  const axis = linearValueAxis(v.rangeLo, v.rangeHi, v.price);
  if (!axis) return null;
  const band = bandPosition(v.price, v.rangeLo, v.rangeHi);
  const position = band === "inside" ? "within" : band;
  const reference = kind !== "zero-growth" && input.reference != null && Number.isFinite(input.reference) && input.reference > 0 ? input.reference : null;
  const point = v.rangeLo === v.rangeHi;
  const subject = kind === "sotp" ? (lang === "zh" ? point ? "分部估值参考" : "分部估值区间" : point ? "sum-of-the-parts estimate" : "sum-of-the-parts range")
    : kind === "zero-growth" ? (lang === "zh" ? point ? "零增长价值参考" : "零增长估值范围" : point ? "zero-growth estimate" : "zero-growth range")
    : point ? (lang === "zh" ? "模型价值参考" : "model estimate") : lang === "zh" ? "价值区间" : "value range";
  const heading = lang === "zh"
    ? point && position === "within" ? `现价与${subject}相当` : `现价${position === "below" ? "低于" : position === "above" ? "高于" : "处于"}${subject}`
    : `Price is ${position === "below" ? "below" : position === "above" ? "above" : point ? "at" : "within"} the ${subject}`;
  const ratio = position === "below" ? 1 - v.price / v.rangeLo : position === "above" ? v.price / v.rangeHi - 1 : 0;
  const percent = Math.round(ratio * 100);
  const gap = position === "within" || !Number.isFinite(percent) ? null : lang === "zh"
    ? `比${point ? "模型参考" : position === "below" ? "模型下沿" : "模型上沿"}${position === "below" ? "低" : "高"}约 ${percent < 1 ? "<1" : percent}%`
    : `About ${percent < 1 ? "<1" : percent}% ${position === "below" ? "below" : "above"} the ${point ? "model estimate" : position === "below" ? "lower estimate" : "upper estimate"}`;
  const unitLabel = input.securityUnit === "ADS" ? (lang === "zh" ? "每 ADS" : "per ADS") : lang === "zh" ? "每股" : "per share";
  const rangeLabel = lang === "zh" ? `${kind === "sotp" ? "分部估值区间" : kind === "zero-growth" ? "零增长价值参考" : point ? "模型价值参考" : "模型价值区间"} · ${unitLabel}`
    : `${kind === "sotp" ? "Sum-of-the-parts range" : kind === "zero-growth" ? "Zero-growth estimate" : point ? "Model estimate" : "Model value range"} · ${unitLabel}`;
  return {
    kind, pending, price: v.price, rangeLo: v.rangeLo, rangeHi: v.rangeHi, date: q.date, source: priceSourceName(lang, q.source), reference,
    referenceLabel: lang === "zh" ? kind === "sotp" ? "分部估值参考" : "内在价值参考" : kind === "sotp" ? "SOTP reference" : "Intrinsic value reference",
    rangeLabel, position, heading:pending?(lang==="zh"?"零增长参考 · 待确认":"Zero-growth reference · pending review"):heading, gap:pending?null:gap, axis,
  };
}

export function stockFallbackHeading(state: ConclusionLeftState, reliable: boolean | undefined, lang: Lang): string {
  if (state === "card" && reliable === false) return lang === "zh" ? "估值待确认" : "Valuation pending confirmation";
  const labels: Partial<Record<ConclusionLeftState, [string, string]>> = {
    splitPaused: ["估值暂停", "Valuation paused"],
    growthEvidenceMissing: ["增长证据不足", "Growth evidence incomplete"],
    methodsConflict: ["估值方法存在分歧", "Valuation methods disagree"],
    fundamentalsSuspect: ["财报数据待核实", "Financial data needs verification"],
    moatDistorted: ["估值口径受资本结构影响", "Capital structure limits valuation"],
  };
  return labels[state]?.[lang === "zh" ? 0 : 1] ?? (lang === "zh" ? "暂无可用估值" : "Valuation unavailable");
}
