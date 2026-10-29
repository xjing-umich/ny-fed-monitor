export type Lang = "zh" | "en";

export const TOP_NAV = [
  { key: "home", zh: "首页", en: "Home", href: "" },
  { key: "investors", zh: "超级投资者", en: "Superinvestors", href: "/investors" },
  { key: "stocks", zh: "个股", en: "Stocks", href: "/stocks" },
  { key: "strike", zh: "击球区", en: "Strike zone", href: "/stocks/screener?view=strike_zone" },
  { key: "learn", zh: "学习", en: "Learn", href: "/learn" },
] as const;

/** barePath 已由导航组件去除语言前缀;筛选器及内部 variant 只高亮击球区。 */
export function isNavActive(key: string, href: string, barePath: string): boolean {
  const path = barePath.split("?")[0];
  if (key === "home") return path === "" || path === "/";
  const isScreener = path === "/stocks/screener" || path.startsWith("/stocks/screener/");
  if (key === "strike") return isScreener;
  if (key === "stocks" && isScreener) return false;
  const target = href.split("?")[0];
  return path === target || path.startsWith(`${target}/`);
}

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
    { key: "screener", zh: "按价值区间", en: "By value", href: "/stocks/screener" },
  ],
};

const LABELS: Record<string, { zh: string; en: string }> = Object.fromEntries(
  TOP_NAV.map((e) => [e.key, { zh: e.zh, en: e.en }])
);

export function navLabel(lang: Lang, key: string): string {
  const l = LABELS[key];
  return l ? l[lang] : key;
}
