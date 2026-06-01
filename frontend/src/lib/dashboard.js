export const i18n = {
  zh: {
    title: "NY Fed 美债市场监控面板 Treasury Market Monitor",
    subtitle: "中文优先的 Treasury market dashboard，基于 NY Fed、Treasury auction、SME 与 analyzer pipeline 构建。",
    lastUpdated: "上次更新时间 Last Updated",
    refreshAll: "刷新 Refresh",
    refreshStatus: "刷新状态 Refresh Status",
    refreshExplanation: "Backend 负责刷新缓存数据与图表；frontend 不直接调用 NY Fed APIs。",
    running: "状态 Status",
    lastRefreshTime: "上次刷新 Last refreshed",
    lastResult: "结果 Result",
    dataCoverage: "数据覆盖 Data coverage",
    refreshDetails: "查看刷新详情 Refresh details",
    sections: "模块导航 Sections",
    summary: "执行摘要 Executive Summary",
    watchNext: "下一步重点观察 What to Watch Next",
    keyMetrics: "核心指标 Key Metrics",
    interpretation: "解读 Interpretation",
    whyItMatters: "为什么重要 Why It Matters",
    chart: "图表 Chart",
    chartUnavailable: "图表暂不可用 Chart unavailable",
    details: "查看完整数据表 Show full table",
    warnings: "提示 Warnings",
    noData: "暂无可显示数据 No data available",
    dataDate: "数据日期 Data Date",
    refreshedAt: "上次刷新 Last Refreshed",
    frequency: "更新频率 Update Frequency",
    freshness: "新鲜度 Freshness",
    mode: "模式 Mode",
    liveCounts: "Live",
    partialCounts: "Partial",
    mockCounts: "Mock",
    unavailableCounts: "Unavailable",
    live: "Live 实时数据",
    partial: "Partial 部分真实数据",
    mock: "Mock 模拟数据",
    unavailable: "Unavailable 不可用",
    subtitleFallback: "部分模块尚未接入 live data，因此整体判断仍为 partial-live。本系统不提供交易建议。",
    statusBackend: "后端状态 Backend",
    statusDataMode: "数据模式 Data Mode",
    statusRecommendations: "交易建议 Trading Calls",
    disabled: "未提供 Not Provided",
    dashboard: "核心看板 Dashboard",
    liveModules: "已接入实时数据模块",
  },
  en: {
    title: "NY Fed Treasury Market Monitor",
    subtitle: "A Treasury market dashboard built from the NY Fed, Treasury auction, SME, and analyzer pipeline.",
    lastUpdated: "Last Updated",
    refreshAll: "Refresh",
    refreshStatus: "Refresh Status",
    refreshExplanation: "The backend refreshes cached datasets and charts. The frontend does not call NY Fed APIs directly.",
    running: "Status",
    lastRefreshTime: "Last Refresh Time",
    lastResult: "Result",
    dataCoverage: "Data Coverage",
    refreshDetails: "Refresh details",
    sections: "Sections",
    summary: "Executive Summary",
    watchNext: "What to Watch Next",
    keyMetrics: "Key Metrics",
    interpretation: "Interpretation",
    whyItMatters: "Why It Matters",
    chart: "Chart",
    chartUnavailable: "Chart unavailable",
    details: "Show full table",
    warnings: "Warnings",
    noData: "No data available",
    dataDate: "Data Date",
    refreshedAt: "Last Refreshed",
    frequency: "Update Frequency",
    freshness: "Freshness",
    mode: "Mode",
    liveCounts: "Live",
    partialCounts: "Partial",
    mockCounts: "Mock",
    unavailableCounts: "Unavailable",
    live: "Live",
    partial: "Partial",
    mock: "Mock",
    unavailable: "Unavailable",
    subtitleFallback: "Some modules are still not connected to live data, so the overall view remains partial-live. No trading recommendations are provided.",
    statusBackend: "Backend",
    statusDataMode: "Data Mode",
    statusRecommendations: "Trading Calls",
    disabled: "Not Provided",
    dashboard: "Dashboard",
    liveModules: "Live modules",
  },
};

export const sidebarItems = [
  { key: "dealer-inventory", zh: "交易商库存 Dealer Inventory", en: "Dealer Inventory", group: "market" },
  { key: "transactions", zh: "成交与流动性 Transactions / Liquidity", en: "Transactions / Liquidity", group: "market" },
  { key: "market-share", zh: "交易商集中度 Market Share", en: "Market Share", group: "market" },
  { key: "repo-financing", zh: "回购融资 Repo Financing", en: "Repo Financing", group: "funding" },
  { key: "reference-rates", zh: "短端利率 Reference Rates", en: "Reference Rates", group: "funding" },
  { key: "facility-usage", zh: "资金工具 ON RRP / SRP", en: "ON RRP / SRP", group: "funding" },
  { key: "fails", zh: "结算失败 Fails / Specialness", en: "Fails / Specialness", group: "funding" },
  { key: "auction-risk", zh: "拍卖风险 Auction Risk", en: "Auction Risk", group: "supply" },
  { key: "soma", zh: "美联储持仓 SOMA", en: "SOMA", group: "supply" },
  { key: "policy-expectations", zh: "政策预期 Policy Expectations", en: "Policy Expectations", group: "policy" },
  { key: "data-freshness", zh: "数据新鲜度 Data Freshness", en: "Data Freshness", group: "system" },
  { key: "data-coverage", zh: "数据覆盖 Data Coverage", en: "Data Coverage", group: "system" },
  { key: "appendix", zh: "数据来源 Appendix", en: "Appendix", group: "system" },
];

export const sidebarGroups = [
  { key: "market", zh: "市场结构 Market Structure", en: "Market Structure" },
  { key: "funding", zh: "资金市场 Funding", en: "Funding" },
  { key: "supply", zh: "供给与资产负债表 Supply / Balance Sheet", en: "Supply / Balance Sheet" },
  { key: "policy", zh: "政策 Policy", en: "Policy" },
  { key: "system", zh: "系统 System", en: "System" },
];

export const quickNavGroups = [
  { key: "market", zh: "市场结构 Market Structure", en: "Market Structure", target: "dealer-inventory" },
  { key: "funding", zh: "资金市场 Funding", en: "Funding", target: "repo-financing" },
  { key: "supply", zh: "供给与资产负债表 Supply / Balance Sheet", en: "Supply / Balance Sheet", target: "auction-risk" },
  { key: "policy", zh: "政策 Policy", en: "Policy", target: "policy-expectations" },
  { key: "system", zh: "系统 System", en: "System", target: "data-freshness" },
];

export function displayStatusValue(lang, value) {
  if (lang !== "zh") {
    const mapping = {
      some_unavailable: "Some Unavailable",
      some_stale: "Some Stale",
      all_fresh: "All Fresh",
      manual_required: "Manual Required",
      "manual-live": "Live",
      "manual-missing": "Unavailable",
    };
    return mapping[value] ?? value ?? "Unavailable";
  }
    const mapping = {
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
  return mapping[value] ?? value ?? "Unavailable 不可用";
}

export function badgeTone(value) {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("extreme") || raw.includes("stress")) return "red";
  if (raw.includes("high") || raw.includes("elevated")) return "orange";
  if (raw.includes("watch") || raw.includes("mixed") || raw.includes("manual") || raw.includes("stale") || raw.includes("old") || raw.includes("moderate")) return "yellow";
  if (raw.includes("mock") || raw.includes("missing") || raw.includes("unavailable")) return "gray";
  return "green";
}

export function inferSectionMode(section) {
  if (!section) return "mock";
  if (section.mode === "manual-live") return "live";
  if (section.mode === "manual-missing") return "unavailable";
  return section.mode ?? "mock";
}

export function pickCard(summary, id, fallback) {
  return summary?.cards?.find((card) => card.id === id) ?? fallback;
}

export function sectionLabel(lang, section) {
  return lang === "zh" ? section?.title_zh ?? section?.title : section?.title ?? section?.title_zh;
}

export function metricLabel(lang, metric) {
  return lang === "zh" ? metric?.label_zh ?? metric?.label : metric?.label ?? metric?.label_zh;
}

export function buildExecutiveSummary(lang, summary) {
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

export function buildWatchList(lang, summary) {
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

export function topDashboardCards(summary) {
  const cards = Object.fromEntries((summary?.cards ?? []).map((card) => [card.id, card]));
  return [
    cards.dealer_inventory_pressure,
    cards.repo_financing_usage,
    cards.funding_rate_stress,
    cards.policy_expectations_risk,
    cards.liquidity_stress,
    cards.auction_risk,
  ].filter(Boolean);
}

export function shortCardValue(cardId, lang, value) {
  const text = String(value ?? "Unavailable");
  if (lang !== "zh") {
    if (cardId === "repo_financing_usage" && text === "Elevated / High usage") return "Elevated / High";
    return text;
  }
  const mapping = {
    Normal: "正常",
    Watch: "观察",
    High: "高",
    Extreme: "极端",
    "Elevated / High usage": "偏高",
    Elevated: "偏高",
  };
  return mapping[text] ?? text;
}

export function shortRefreshResult(lang, message) {
  const raw = String(message ?? "").trim();
  if (!raw) return lang === "zh" ? "空闲" : "Idle";
  const lower = raw.toLowerCase();
  if (lower.includes("completed") || lower.includes("success")) {
    return lang === "zh" ? "已完成" : "Refresh completed";
  }
  if (lower.includes("running") || lower.includes("refreshing")) {
    return lang === "zh" ? "刷新中" : "Refreshing";
  }
  if (lower.includes("error") || lower.includes("failed")) {
    return lang === "zh" ? "错误" : "Error";
  }
  return raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
}

export function keyMetricLimit(sectionKey) {
  if (sectionKey === "policy-expectations") return 6;
  if (sectionKey === "facility-usage") return 6;
  return 6;
}

export function tablePreviewCount(title = "") {
  if (title.includes("Upcoming")) return 5;
  if (title.includes("Completed")) return 8;
  if (title.includes("Compact")) return 10;
  return 8;
}

export function chartExpected(sectionKey) {
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

export function hasRenderableChart(section) {
  if (!section) return false;
  if (Array.isArray(section.chart_urls) && section.chart_urls.length) return true;
  return Boolean(section.chart_url);
}
