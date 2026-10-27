import type { Lang } from "@/lib/nav";

// 现价的两个事实分开说(final-fix B #4):
//   带位置 = 现价 vs 展示的价值带 [rangeLo 零增长底, rangeHi];
//   中枢关系 = 现价 vs 含增长的内在价值 IV(引擎 bucket 的锚)。
// bucket 只回答后者,不能拿来说“低于/高于这条带”(PDD $79 在 $66–$424 带内,却低于中枢 $343)。
export type BandPosition = "below" | "inside" | "above";

export function bandPosition(price: number, rangeLo: number, rangeHi: number): BandPosition {
  if (price < rangeLo) return "below";
  if (price > rangeHi) return "above";
  return "inside";
}

export function priceVsBandAndIv(input: {
  price: number;
  rangeLo: number;
  rangeHi: number;
  iv: number;
  date?: string;
  lang: Lang;
  fmt: (n: number) => string;
}): string {
  const { price, rangeLo, rangeHi, iv, date, lang, fmt } = input;
  const pos = bandPosition(price, rangeLo, rangeHi);
  const rel = price < iv ? "below" : price > iv ? "above" : "level";
  const p = fmt(price);
  const c = fmt(iv);
  if (lang === "zh") {
    const band = pos === "inside" ? "落在价值带内" : pos === "below" ? "低于价值带" : "高于价值带";
    // "低于中枢约 $350" 会被读成"差 $350";括号写明这是中枢本身的值。
    const center = rel === "level" ? `与中枢（约 ${c}）持平` : `${rel === "below" ? "低于" : "高于"}中枢（约 ${c}）`;
    return `今天的价格 ${p}${date ? `（截至 ${date}）` : " "}${band}，${center}。`;
  }
  const band = pos === "inside" ? "inside the band" : `${pos} the band`;
  const center = rel === "level" ? `level with the central read of about ${c}` : `${rel} the central read of about ${c}`;
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
