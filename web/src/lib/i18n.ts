export const i18n: Record<"zh" | "en", Record<string, string>> = {
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

export type SidebarItem = {
  key: string;
  zh: string;
  en: string;
  group: string;
};

export type SidebarGroup = {
  key: string;
  zh: string;
  en: string;
};

export type QuickNavGroup = {
  key: string;
  zh: string;
  en: string;
  target: string;
};

export const sidebarItems: SidebarItem[] = [
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

export const sidebarGroups: SidebarGroup[] = [
  { key: "market", zh: "市场结构 Market Structure", en: "Market Structure" },
  { key: "funding", zh: "资金市场 Funding", en: "Funding" },
  { key: "supply", zh: "供给与资产负债表 Supply / Balance Sheet", en: "Supply / Balance Sheet" },
  { key: "policy", zh: "政策 Policy", en: "Policy" },
  { key: "system", zh: "系统 System", en: "System" },
];

export const quickNavGroups: QuickNavGroup[] = [
  { key: "market", zh: "市场结构 Market Structure", en: "Market Structure", target: "dealer-inventory" },
  { key: "funding", zh: "资金市场 Funding", en: "Funding", target: "repo-financing" },
  { key: "supply", zh: "供给与资产负债表 Supply / Balance Sheet", en: "Supply / Balance Sheet", target: "auction-risk" },
  { key: "policy", zh: "政策 Policy", en: "Policy", target: "policy-expectations" },
  { key: "system", zh: "系统 System", en: "System", target: "data-freshness" },
];
