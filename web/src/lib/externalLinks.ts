// 个股外部数据出口 URL 构造。纯函数, 仅依赖 ticker(已核实 securities.exchange 全为 "US",
// 无法构造 Google Finance quote 页, 故 Google 走搜索 URL)。无网络、无 DB, 可单测。

export type ExternalFinanceUrls = { yahoo: string; google: string; sec: string };

/**
 * 像 ticker 而非 CUSIP 吗？CUSIP 为 9 位含数字, ticker 为 1–6 个字母(可带一位类别后缀)。
 * 用于在 cusip-fallback 行/页上跳过外链(避免把 cusip 当 ticker 拼出无效链接)。
 */
export function isLikelyTicker(s: string): boolean {
  return /^[A-Za-z]{1,6}(\.[A-Za-z])?$/.test(s);
}

/** ticker → Yahoo / Google / SEC EDGAR 三个 URL。 */
export function buildExternalFinanceLinks(ticker: string): ExternalFinanceUrls {
  const t = ticker.trim().toUpperCase();
  const yahooSym = encodeURIComponent(t.replace(/\./g, "-")); // BRK.B → BRK-B
  const enc = encodeURIComponent(t); // encodeURIComponent 保留 "." 不变
  return {
    yahoo: `https://finance.yahoo.com/quote/${yahooSym}`,
    google: `https://www.google.com/search?q=${enc}+stock`,
    sec: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${enc}&type=10-K&count=40`,
  };
}
