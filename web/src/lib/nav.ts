export type Lang = "zh" | "en";

export const TOP_NAV = [
  { key: "home", zh: "首页", en: "Home", href: "" },
  { key: "investors", zh: "超级投资者", en: "Superinvestors", href: "/investors" },
  { key: "stocks", zh: "个股", en: "Stocks", href: "/stocks" },
  { key: "macro", zh: "宏观/流动性", en: "Macro / Liquidity", href: "/macro" },
  { key: "learn", zh: "学习", en: "Learn", href: "/learn" },
] as const;

export type SecondaryNavItem = {
  key: string;
  zh: string;
  en: string;
  href?: string;
  soon?: true;
};

export const SECONDARY_NAV: Record<string, SecondaryNavItem[]> = {
  investors: [
    { key: "all", zh: "全部投资者", en: "All", href: "/investors" },
    { key: "buys", zh: "本季最多人买", en: "Top buys", href: "/investors/buys" },
    { key: "sells", zh: "本季最多人卖", en: "Top sells", href: "/investors/sells" },
    { key: "consensus", zh: "共识持仓", en: "Consensus", href: "/investors/consensus" },
  ],
  stocks: [
    { key: "held", zh: "最多机构持有", en: "Most held", href: "/stocks" },
  ],
  macro: [
    { key: "funding", zh: "资金面", en: "Funding", href: "/macro#funding" },
    { key: "supply", zh: "供给面", en: "Supply", href: "/macro#supply" },
    { key: "policy", zh: "政策面", en: "Policy", href: "/macro#policy" },
  ],
};

export const MACRO_GROUPS = [
  { key: "funding", zh: "资金面", en: "Funding",
    indicators: ["repo-financing", "reference-rates", "facility-usage", "fails"] },
  { key: "supply", zh: "供给面", en: "Supply",
    indicators: ["auction-risk", "soma", "dealer-inventory", "transactions", "market-share"] },
  { key: "policy", zh: "政策面", en: "Policy",
    indicators: ["policy-expectations"] },
] as const;

export function indicatorToGroup(indicator: string): string | null {
  const g = MACRO_GROUPS.find((g) => (g.indicators as readonly string[]).includes(indicator));
  return g ? g.key : null;
}

const LABELS: Record<string, { zh: string; en: string }> = Object.fromEntries(
  TOP_NAV.map((e) => [e.key, { zh: e.zh, en: e.en }])
);

export function navLabel(lang: Lang, key: string): string {
  const l = LABELS[key];
  return l ? l[lang] : key;
}
