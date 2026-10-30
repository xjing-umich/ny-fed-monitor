import type { Lang } from "@/lib/nav";
import type { LinearValueScale } from "@/lib/stocks/stockFirstScreen";
import { fmtPrice, fmtPerShareValue } from "@/lib/format";
import { money } from "@/lib/i18n/format";

/** 同一美元轴,范围和现价均按真实值定位。近邻标签分两行,而非移动数据点。 */
export function LinearValueAxis({ axis, low, high, price, lang }: {
  axis: LinearValueScale; low: number; high: number; price: number; lang: Lang;
}) {
  const point = low === high;
  const middle = (axis.low + axis.high) / 2;
  const close = Math.abs(middle - axis.price) < 25;
  const label = (percent: number) => ({ left: `clamp(2.5rem, ${percent}%, calc(100% - 2.5rem))`, transform: "translateX(-50%)" });
  const description = lang === "zh"
    ? `同一美元刻度：模型${point ? "参考" : "区间"} ${fmtPerShareValue(low)}${point ? "" : ` 至 ${fmtPerShareValue(high)}`}，现价 ${fmtPrice(price)}。`
    : `One US-dollar scale: model ${point ? "estimate" : "range"} ${fmtPerShareValue(low)}${point ? "" : ` to ${fmtPerShareValue(high)}`}; price ${fmtPrice(price)}.`;
  return (
    <div className="mt-6 max-w-4xl" role="img" aria-label={description} data-value-axis="linear" data-point-range={point}>
      <div className={`relative text-xs ${close ? "h-12" : "h-6"}`}>
        <span className="absolute top-0 w-20 text-center text-[var(--val-within)]" style={label(middle)}>
          {lang === "zh" ? point ? "模型参考" : "模型区间" : point ? "Model estimate" : "Model range"}
        </span>
        <span className={`absolute w-20 text-center text-[var(--tt-text)] ${close ? "top-6" : "top-0"}`} style={label(axis.price)}>
          {lang === "zh" ? "现价 ↓" : "Price ↓"}
        </span>
      </div>
      <svg viewBox="0 0 1000 28" width="100%" height="28" preserveAspectRatio="none" className="overflow-visible" aria-hidden="true">
        <line x1="0" x2="1000" y1="14" y2="14" stroke="var(--tt-border)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {point ? (
          <line x1={axis.low * 10} x2={axis.low * 10} y1="5" y2="23" stroke="var(--val-within)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        ) : (
          <rect x={axis.low * 10} width={(axis.high - axis.low) * 10} y="6" height="16" rx="1" fill="var(--val-within-soft)" stroke="var(--val-within)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        <line x1={axis.price * 10} x2={axis.price * 10} y1="3" y2="25" stroke="var(--tt-text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative h-6 font-data text-xs tabular-nums text-[var(--tt-faint)]" aria-hidden="true">
        {axis.ticks.map((tick, i) => (
          <span key={i} className="absolute top-0 whitespace-nowrap" style={{ left: `${tick / axis.max * 100}%`, transform: i === 0 ? undefined : i === axis.ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>
            {i === 0 ? "$0" : money(tick, lang, "table")}
          </span>
        ))}
      </div>
    </div>
  );
}
