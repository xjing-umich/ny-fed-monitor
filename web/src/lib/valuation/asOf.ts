// 估值 / 价格的"截至哪天、来自哪"标注。纯函数(无 server-only),可被 .check.ts 直接跑。
//
// 数据硬要求:页面上每个价格、估值结论都要标来源和日期。估值快照是在某天收盘价上算的,
// 列表页(首页击球区榜、/stocks 绿标、共识页徽章、投资人页估值列)读快照 + 3–7 天 ISR,
// 读者看到"低于价值带"时必须知道那是哪天的价。

type Lang = "zh" | "en";

/** YYYY-MM-DD 中最晚的一个;全空 → null。 */
export function latestIsoDate(dates: Array<string | null | undefined>): string | null {
  let max: string | null = null;
  for (const d of dates) {
    if (d && /^\d{4}-\d{2}-\d{2}/.test(d) && (max === null || d > max)) max = d.slice(0, 10);
  }
  return max;
}

/** "估值截至 2026-10-22 收盘价"。date 为空 → null(调用方不渲染)。 */
export function valuationAsOfText(lang: Lang, date: string | null): string | null {
  if (!date) return null;
  return lang === "zh" ? `估值截至 ${date} 收盘价` : `Valuations as of the ${date} close`;
}

const PRICE_SOURCE_NAME: Record<string, { zh: string; en: string }> = {
  yahoo: { zh: "Yahoo Finance", en: "Yahoo Finance" },
  eastmoney: { zh: "东方财富", en: "Eastmoney" },
  stooq: { zh: "Stooq", en: "Stooq" },
};

/** prices.source → 展示名;未知/缺失 → 通用名(不编造具体来源)。 */
export function priceSourceName(lang: Lang, source: string | null | undefined): string {
  const hit = source ? PRICE_SOURCE_NAME[source.toLowerCase()] : undefined;
  if (hit) return hit[lang];
  return lang === "zh" ? "收盘价" : "Closing price";
}

const NBSP = "\u00a0";

/** 个股页"现价"下方的注:日期 + 来源;过期加标记。 */
export function priceFactNote(
  lang: Lang,
  p: { date: string; source?: string | null; stale?: boolean } | null,
): string | null {
  if (!p?.date) return null;
  // 来源名内部用不换行空格:窄屏下只允许在「·」处换行,不把 "Yahoo Finance" 拆成两行。
  const src = priceSourceName(lang, p.source).replace(/ /g, NBSP);
  if (lang === "zh") return p.stale ? `${p.date} 收盘 · 已过期 · ${src}` : `${p.date} 收盘 · ${src}`;
  return p.stale ? `${p.date} close · stale · ${src}` : `${p.date} close · ${src}`;
}
