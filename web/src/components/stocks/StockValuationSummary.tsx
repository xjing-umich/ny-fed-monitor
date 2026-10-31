import type { Lang } from "@/lib/nav";
import type { StockValueSummary } from "@/lib/stocks/stockFirstScreen";
import { fmtPrice, fmtPerShareValue, fmtValueBand } from "@/lib/format";
import { date as formatDate } from "@/lib/i18n/format";
import { LinearValueAxis } from "./LinearValueAxis";

const POSITION_COLOR = {
  below: "text-[var(--val-below)]",
  within: "text-[var(--val-within)]",
  above: "text-[var(--val-above)]",
} as const;

/** 已通过权威闸门的价格概览。方法/明细仍由原估值卡渲染。 */
export function StockValuationSummary({ model, lang, marginText }: { model: StockValueSummary; lang: Lang; marginText?: string | null }) {
  const zh = lang === "zh";
  const priceText = fmtPrice(model.price);
  const rangeText = fmtValueBand(model.rangeLo, model.rangeHi, fmtPerShareValue);
  // Preserve complete amounts without squeezing a long price into half a phone screen.
  const wideAmounts = priceText.length > 8 || rangeText.length > 13;
  const priceSize = priceText.length > 14 ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl";
  const explanation = model.kind === "sotp"
    ? zh ? "分部估值按各项业务与资产的现有假设汇总，推导表保留在下方估值方法中。" : "The sum-of-the-parts estimate combines the existing assumptions for each business and asset. The derivation is retained in the valuation section."
    : model.kind === "zero-growth"
      ? zh ? "这里只展示零增长盈利能力参考，不据此虚构含增长的内在价值中枢。" : "This is a zero-growth earnings-power reference. No growth-based intrinsic-value midpoint is implied."
      : zh ? "区间来自当前模型假设，是估计值；上沿是模型情景，并非价格的绝对上限。" : "The range is an estimate under the current model assumptions. Its upper end is a modeled scenario, not an absolute price ceiling.";
  return (
    <section aria-label={zh ? "价格与价值判断" : "Price and value assessment"}>
      <h2 className="text-balance font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-5xl">{model.heading}</h2>
      {model.pending && <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--tt-muted)]">{zh ? "近期财报已覆盖，但历史再投资证据不足。本参考假设零增长，未计增长溢价，未计入已确认击球区。" : "Recent financial periods are covered, but historical reinvestment evidence is insufficient. This reference assumes zero growth, includes no growth premium, and is excluded from the confirmed strike zone."}</p>}
      {model.gap && <p className={`mt-2 text-base ${POSITION_COLOR[model.position]}`}><span aria-hidden>● </span>{model.gap}</p>}
      {marginText && <p className="mt-2 font-data text-sm font-medium text-[var(--val-below)]">{marginText}</p>}
      <dl className={`mt-6 grid max-w-3xl gap-x-5 gap-y-4 sm:gap-x-14 ${wideAmounts ? "grid-cols-1" : "grid-cols-2"}`}>
        <div className="min-w-0">
          <dt className="text-sm text-[var(--tt-muted)]">{zh ? "最近收盘价" : "Latest closing price"}</dt>
          <dd className={`mt-1 font-data font-medium leading-tight tracking-tight text-[var(--tt-text)] [overflow-wrap:anywhere] ${priceSize}`}>{priceText}</dd>
          <dd className="mt-2 text-xs text-[var(--tt-muted)]"><time dateTime={model.date}>{formatDate(model.date, lang, "table")}</time><span> · {model.source}</span></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-[var(--tt-muted)]">{model.rangeLabel}</dt>
          <dd className="mt-2 font-data text-2xl font-medium leading-tight text-[var(--tt-text)] [overflow-wrap:anywhere] sm:text-3xl">{rangeText}</dd>
          {model.reference != null && <dd className="mt-2 text-xs text-[var(--tt-muted)]">{model.referenceLabel} <strong className="font-medium text-[var(--tt-text)]">{fmtPerShareValue(model.reference)}</strong></dd>}
        </div>
      </dl>
      <LinearValueAxis axis={model.axis} low={model.rangeLo} high={model.rangeHi} price={model.price} lang={lang} />
      <details className="mt-1 max-w-4xl text-sm text-[var(--tt-muted)]">
        <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 text-xs hover:text-[var(--tt-text)]">{zh ? "价值区间与价格口径" : "About this estimate and price"} <span aria-hidden>＋</span></summary>
        <p className="max-w-prose pb-3 leading-relaxed">{explanation} {zh ? "图上金额使用同一美元刻度。显示金额已经取整，偏离比例按未取整数值计算。报价为所示日期的收盘快照，非实时报价。" : "The plot uses one US-dollar scale. Displayed estimates are rounded; percentage differences use unrounded values. The quote is a closing-price snapshot for the date shown, not a live price."}</p>
      </details>
    </section>
  );
}
