// 个股外部数据出口 URL 构造。纯函数, 仅依赖 ticker。无网络、无 DB, 可单测。
// Google 用 Google Finance 的 quote 路径(裸 ticker, 无交易所后缀): Google 会自行
// 跳转到对应 quote 页。securities.exchange 全为 "US", 无 NASDAQ/NYSE 信息拼后缀,
// 但裸 ticker 形式仍稳定落到 Google Finance(而非 Google 搜索)。

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
    google: `https://www.google.com/finance/quote/${enc}`,
    sec: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${enc}&type=10-K&count=40`,
  };
}
