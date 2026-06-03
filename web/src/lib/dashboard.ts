import type { Section, Metric } from "@/lib/types";

type Lang = "zh" | "en";

export function displayStatusValue(lang: Lang, value: string | undefined | null): string {
  if (lang !== "zh") {
    const mapping: Record<string, string> = {
      some_unavailable: "Some Unavailable",
      some_stale: "Some Stale",
      all_fresh: "All Fresh",
      manual_required: "Manual Required",
      "manual-live": "Live",
      "manual-missing": "Unavailable",
    };
    return mapping[value ?? ""] ?? value ?? "Unavailable";
  }
  const mapping: Record<string, string> = {
    Normal: "Normal 正常",
    Watch: "Watch 观察",
    "Watch / Mixed": "Watch / Mixed 观察 / 混合",
    Elevated: "Elevated 偏高",
    "Elevated / High usage": "Elevated / High usage 偏高 / 高使用量",
    High: "High 高",
    Extreme: "Extreme 极端",
    Fresh: "Fresh 最新",
    Stale: "Stale 可能过期",
    Old: "Old 已过期",
    Missing: "Missing 缺失",
    Manual: "Manual 手动",
    Unavailable: "Unavailable 不可用",
    unavailable: "Unavailable 不可用",
    live: "Live 实时数据",
    mock: "Mock 模拟数据",
    "manual-live": "Live 实时数据",
    "manual-missing": "Unavailable 不可用",
    "partial-live": "Partial 部分真实数据",
    partial: "Partial 部分真实数据",
    mixed: "mixed 混合",
    completed: "completed 已完成",
    idle: "idle 空闲",
    Active: "Active / Watch 活跃 / 观察",
    Inactive: "Inactive 未使用",
    "Small value exercise only": "Small value exercise only 小额测试",
    Moderate: "Moderate 中等",
    "Low-Watch": "Low / Watch 偏低 / 观察",
    "Limited sample": "Limited sample 样本有限",
    "Stable / improving": "Stable / improving 稳定 / 改善",
    rising: "rising 上升",
    some_unavailable: "部分不可用 Some Unavailable",
    some_stale: "部分过期 Some Stale",
    all_fresh: "全部较新 All Fresh",
    manual_required: "需要手动更新 Manual Required",
  };
  return mapping[value ?? ""] ?? value ?? "Unavailable 不可用";
}

export function badgeTone(value: string | number | undefined | null): "red" | "orange" | "yellow" | "gray" | "green" {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("extreme") || raw.includes("stress")) return "red";
  if (raw.includes("high") || raw.includes("elevated")) return "orange";
  if (
    raw.includes("watch") ||
    raw.includes("mixed") ||
    raw.includes("manual") ||
    raw.includes("stale") ||
    raw.includes("old") ||
    raw.includes("moderate")
  )
    return "yellow";
  if (raw.includes("mock") || raw.includes("missing") || raw.includes("unavailable")) return "gray";
  return "green";
}

export function inferSectionMode(section: Section | undefined | null): string {
  if (!section) return "mock";
  if (section.mode === "manual-live") return "live";
  if (section.mode === "manual-missing") return "unavailable";
  return section.mode ?? "mock";
}

// The ported analyzer labels are bilingual: `label_zh` is "<中文> <English>" where the
// trailing English equals `label`. For a single-language UI we strip that English suffix
// in zh mode so the Chinese route shows only Chinese (a key "de-AI" cleanup).
function stripEnglishSuffix(zh: string, en: string | undefined): string {
  if (en && zh.length > en.length && zh.endsWith(en)) {
    return zh.slice(0, -en.length).trim();
  }
  return zh;
}

export function sectionLabel(lang: Lang, section: Section | undefined | null): string | undefined {
  if (lang === "zh") {
    return section?.title_zh ? stripEnglishSuffix(section.title_zh, section.title) : section?.title;
  }
  return section?.title ?? section?.title_zh;
}

export function metricLabel(lang: Lang, metric: Metric | undefined | null): string | undefined {
  if (lang === "zh") {
    return metric?.label_zh ? stripEnglishSuffix(metric.label_zh, metric.label) : metric?.label;
  }
  return metric?.label ?? metric?.label_zh;
}

type SummaryCard = { id: string; value?: string; [key: string]: unknown };
type SummaryData = { cards?: SummaryCard[] };

export function buildExecutiveSummary(lang: Lang, summary: SummaryData | undefined | null): string[] {
  const cards = Object.fromEntries((summary?.cards ?? []).map((card) => [card.id, card]));
  const dealer = cards.dealer_inventory_pressure?.value ?? "Unavailable";
  const repo = cards.repo_financing_usage?.value ?? "Unavailable";
  const funding = cards.funding_rate_stress?.value ?? "Unavailable";
  const auction = cards.auction_risk?.value ?? "Unavailable";
  const policy = cards.policy_expectations_risk?.value ?? "Unavailable";
  if (lang === "zh") {
    return [
      `主要压力：Dealer Inventory 为 ${dealer}，Repo Financing 为 ${repo}。`,
      `资金状态：Funding Rate Stress 仍为 ${funding}，说明利率型资金压力尚未全面恶化。`,
      `供给与政策：Auction Risk 为 ${auction}，Policy Expectations Risk 为 ${policy}。`,
    ].filter(Boolean);
  }
  return [
    `Main pressure: Dealer Inventory ${dealer}; Repo Financing ${repo}.`,
    `Funding: Funding Rate Stress remains ${funding}, so rate-based funding pressure is not broad yet.`,
    `Supply / Policy: Auction Risk ${auction}; Policy Expectations Risk ${policy}.`,
  ].filter(Boolean);
}

export function buildWatchList(lang: Lang, _summary?: SummaryData | null): string[] {
  if (lang === "zh") {
    return [
      "关注下一次 Primary Dealer weekly release 中 Dealer Inventory 是否继续维持高分位。",
      "关注 Repo Financing 高位是否传导到 SOFR-EFFR 或 ON RRP / SRP。",
      "关注 upcoming auctions 的 Bid-to-cover、Primary dealer share 和 Indirect bidder share。",
    ];
  }
  return [
    "Watch the next Primary Dealer weekly release for Dealer Inventory.",
    "Watch whether Repo Financing pressure spills into SOFR-EFFR or ON RRP / SRP.",
    "Watch upcoming auctions for Bid-to-cover, Primary dealer share, and Indirect bidder share.",
  ];
}

export function keyMetricLimit(_sectionKey: string): number {
  // All current cases return 6; preserve thresholds for future expansion.
  return 6;
}

export function tablePreviewCount(title = ""): number {
  if (title.includes("Upcoming")) return 5;
  if (title.includes("Completed")) return 8;
  if (title.includes("Compact")) return 10;
  return 8;
}

export function chartExpected(sectionKey: string): boolean {
  return new Set([
    "dealer-inventory",
    "transactions",
    "repo-financing",
    "fails",
    "soma",
    "reference-rates",
    "facility-usage",
  ]).has(sectionKey);
}
