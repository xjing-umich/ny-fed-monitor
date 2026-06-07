// 个股外部数据出口 URL 构造。纯函数, 无网络、无 DB, 可单测。
// Google Finance 的 quote 页必须带交易所后缀(TICKER:EXCHANGE, 如 GOOG:NASDAQ);
// 裸 ticker 会落到空白页。交易所由 securities.exchange 提供(经 SEC 回填为
// NASDAQ/NYSE 等)。未知交易所则回退 Google 搜索, 避免空白链接。

export type ExternalFinanceUrls = { yahoo: string; google: string; sec: string };

/**
 * 像 ticker 而非 CUSIP 吗？CUSIP 为 9 位含数字, ticker 为 1–6 个字母(可带一位类别后缀)。
 * 用于在 cusip-fallback 行/页上跳过外链(避免把 cusip 当 ticker 拼出无效链接)。
 */
export function isLikelyTicker(s: string): boolean {
  return /^[A-Za-z]{1,6}(\.[A-Za-z])?$/.test(s);
}

// Google Finance 能识别的交易所代码白名单(其余/未知 → 回退搜索)。
const GF_EXCHANGES = new Set(["NASDAQ", "NYSE", "OTCMKTS", "NYSEAMERICAN", "NYSEARCA", "CBOE"]);

/** ticker(+交易所) → Yahoo / Google Finance / SEC EDGAR 三个 URL。 */
export function buildExternalFinanceLinks(ticker: string, exchange?: string | null): ExternalFinanceUrls {
  const t = ticker.trim().toUpperCase();
  const yahooSym = encodeURIComponent(t.replace(/\./g, "-")); // BRK.B → BRK-B
  const enc = encodeURIComponent(t); // encodeURIComponent 保留 "." 不变
  const ex = (exchange ?? "").trim().toUpperCase();
  const google = GF_EXCHANGES.has(ex)
    ? `https://www.google.com/finance/quote/${enc}:${ex}` // 如 GOOG:NASDAQ
    : `https://www.google.com/search?q=${enc}+stock`; // 未知交易所 → 回退搜索
  return {
    yahoo: `https://finance.yahoo.com/quote/${yahooSym}`,
    google,
    sec: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${enc}&type=10-K&count=40`,
  };
}
