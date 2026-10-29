import type { Lang } from "@/lib/nav";

// 现价的两个事实分开说(final-fix B #4):
//   带位置 = 现价 vs 展示的价值区间 [rangeLo 零增长底, rangeHi];
//   中枢关系 = 现价 vs 含增长的内在价值 IV(引擎 bucket 的锚)。
// bucket 只回答后者,不能拿来说“低于/高于这条带”(PDD $79 在 $66–$424 带内,却低于中枢 $343)。
export type BandPosition = "below" | "inside" | "above";

export function bandPosition(price: number, rangeLo: number, rangeHi: number): BandPosition {
  if (price < rangeLo) return "below";
  if (price > rangeHi) return "above";
  return "inside";
}

/** 三等分区间标尺的展示坐标。单点区间的相等值放中间;带外读数钳在可见范围。 */
export function rangeGaugePercent(value: number, rangeLo: number, rangeHi: number): number {
  if (![value, rangeLo, rangeHi].every(Number.isFinite)) return 50;
  const third = 100 / 3;
  const raw = value < rangeLo
    ? third * value / (rangeLo || 1)
    : value > rangeHi
      ? 2 * third + third * (value - rangeHi) / (rangeHi || 1)
      : rangeHi === rangeLo
        ? 50
        : third + third * (value - rangeLo) / (rangeHi - rangeLo);
  return Math.min(98, Math.max(2, raw));
}

export function priceVsBandAndIv(input: {
  price: number;
  rangeLo: number;
  rangeHi: number;
  iv: number;
  date?: string;
  lang: Lang;
  fmt: (n: number) => string;
  /** 现价单独的格式(到美分);缺省同 fmt。 */
  fmtPrice?: (n: number) => string;
}): string {
  const { price, rangeLo, rangeHi, iv, date, lang, fmt } = input;
  const pos = bandPosition(price, rangeLo, rangeHi);
  const rel = price < iv ? "below" : price > iv ? "above" : "level";
  const p = (input.fmtPrice ?? fmt)(price);
  const c = fmt(iv);
  if (lang === "zh") {
    const band = pos === "inside" ? "落在价值区间内" : pos === "below" ? "低于价值区间" : "高于价值区间";
    // "低于中枢约 $350" 会被读成"差 $350";括号写明这是中枢本身的值。
    const center = rel === "level" ? `与内在价值（约 ${c}）持平` : `${rel === "below" ? "低于" : "高于"}内在价值（约 ${c}）`;
    return `今天的价格 ${p}${date ? `（截至 ${date}）` : " "}${band}，${center}。`;
  }
  const band = pos === "inside" ? "inside the range" : `${pos} the range`;
  const center = rel === "level" ? `level with intrinsic value of about ${c}` : `${rel} intrinsic value of about ${c}`;
  return `Today’s price (${p}${date ? `, as of ${date}` : ""}) sits ${band}, ${center}.`;
}

/** 两法但无含增长中枢 IV 时:只说现价相对这个区间的位置(不借 bucket,bucket 锚的是 IV)。 */
export function priceVsBand(input: {
  price: number;
  rangeLo: number;
  rangeHi: number;
  date?: string;
  lang: Lang;
  fmt: (n: number) => string;
}): string {
  const { price, rangeLo, rangeHi, date, lang, fmt } = input;
  const pos = bandPosition(price, rangeLo, rangeHi);
  const p = fmt(price);
  if (lang === "zh") {
    const where = pos === "inside" ? "落在这个区间内" : pos === "below" ? "低于这个区间" : "高于这个区间";
    return `今天的价格 ${p}${date ? `（截至 ${date}）` : " "}${where}。`;
  }
  return `Today’s price (${p}${date ? `, as of ${date}` : ""}) sits ${pos} this range.`;
}
