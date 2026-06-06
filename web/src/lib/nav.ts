export type Lang = "zh" | "en";

export const TOP_NAV = [
  { key: "home", zh: "首页", en: "Home", href: "" },
  { key: "investors", zh: "超级投资者", en: "Superinvestors", href: "/investors" },
  { key: "macro", zh: "宏观/流动性", en: "Macro / Liquidity", href: "/macro" },
] as const;

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
