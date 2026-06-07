// Localized macro indicator names (from i18n sidebarItems). Shared by the macro
// indicator page and its opengraph-image route so the OG card can show the
// proper localized name without re-running buildAllSections.

export const ALL_SECTION_KEYS = [
  "dealer-inventory",
  "transactions",
  "repo-financing",
  "fails",
  "reference-rates",
  "soma",
  "market-share",
  "facility-usage",
  "auction-risk",
  "policy-expectations",
  "data-freshness",
] as const;

export type IndicatorKey = (typeof ALL_SECTION_KEYS)[number];

export const SECTION_NAME: Record<IndicatorKey, { zh: string; en: string }> = {
  "repo-financing":      { zh: "回购融资", en: "Repo Financing" },
  "reference-rates":     { zh: "短端利率", en: "Reference Rates" },
  "facility-usage":      { zh: "资金工具", en: "ON RRP / SRP" },
  "fails":               { zh: "结算失败", en: "Fails / Specialness" },
  "auction-risk":        { zh: "拍卖风险", en: "Auction Risk" },
  "soma":                { zh: "美联储持仓", en: "SOMA" },
  "dealer-inventory":    { zh: "交易商库存", en: "Dealer Inventory" },
  "transactions":        { zh: "成交与流动性", en: "Transactions / Liquidity" },
  "market-share":        { zh: "交易商集中度", en: "Market Share" },
  "policy-expectations": { zh: "政策预期", en: "Policy Expectations" },
  "data-freshness":      { zh: "数据新鲜度", en: "Data Freshness" },
};
