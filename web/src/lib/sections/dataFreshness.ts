import type { Section } from "@/lib/types";

const SCHEDULE_ROWS = [
  { "Dataset": "Reference Rates", "Module": "SOFR, EFFR, OBFR, TGCR, BGCR", "Suggested frequency": "Daily", "Fresh if": "within 2 business days", "Stale if": "older than 2 business days", "Update method": "API refresh" },
  { "Dataset": "Auction Calendar and Results", "Module": "Auction Risk", "Suggested frequency": "Daily", "Fresh if": "within 2 business days", "Stale if": "older than 2 business days", "Update method": "API refresh" },
  { "Dataset": "ON RRP / SRP Facility Usage", "Module": "Facility Usage", "Suggested frequency": "Daily", "Fresh if": "within 2 business days", "Stale if": "older than 2 business days", "Update method": "API refresh" },
  { "Dataset": "Primary Dealer Positions", "Module": "Dealer Inventory", "Suggested frequency": "Weekly", "Fresh if": "within 8 calendar days", "Stale if": "older than 8 calendar days", "Update method": "API refresh" },
  { "Dataset": "Transactions", "Module": "Transactions / Liquidity", "Suggested frequency": "Weekly", "Fresh if": "within 8 calendar days", "Stale if": "older than 8 calendar days", "Update method": "API refresh" },
  { "Dataset": "Repo Financing", "Module": "Repo Financing", "Suggested frequency": "Weekly", "Fresh if": "within 8 calendar days", "Stale if": "older than 8 calendar days", "Update method": "API refresh" },
  { "Dataset": "Fails", "Module": "Fails / Specialness", "Suggested frequency": "Weekly", "Fresh if": "within 8 calendar days", "Stale if": "older than 8 calendar days", "Update method": "API refresh" },
  { "Dataset": "SOMA Holdings", "Module": "SOMA", "Suggested frequency": "Weekly", "Fresh if": "within 8 calendar days", "Stale if": "older than 8 calendar days", "Update method": "API refresh" },
  { "Dataset": "Market Share / Dealer Concentration", "Module": "Market Share", "Suggested frequency": "Quarterly", "Fresh if": "within 100 calendar days", "Stale if": "older than 100 calendar days", "Update method": "API refresh" },
  { "Dataset": "SME / Policy Expectations", "Module": "Policy Expectations", "Suggested frequency": "Manual", "Fresh if": "file exists and release date is parsed", "Stale if": "file missing or not updated", "Update method": "Replace local SME file" },
];

export function buildDataFreshnessSection(sections: Record<string, Section>): Section {
  const connectedCount = Object.values(sections).filter(
    (s) => s.mode === "live" || s.mode === "manual-live"
  ).length;

  const unavailableCount = Object.values(sections).filter(
    (s) => s.mode === "unavailable" || s.mode === "manual-missing"
  ).length;

  const today = new Date().toISOString().slice(0, 10);

  return {
    title: "Data Freshness & Update Schedule",
    title_zh: "数据新鲜度 Data Freshness",
    mode: "live",
    freshness_status: "Fresh",
    data_date: today,
    summary: "Overview of update frequency and freshness rules for each module.",
    summary_zh: "各模块的更新频率与新鲜度规则概览。",
    interpretation: "Clicking Refresh will update all data obtainable via API. SME policy expectations require replacing the local file manually.",
    interpretation_zh: "点击 Refresh 会更新所有可通过 API 获取的数据；SME 政策预期需先替换文件。",
    why_it_matters: "Freshness labels help distinguish current, stale, manually-updated, and unavailable data states.",
    why_it_matters_zh: "新鲜度标签有助于区分当前、过期、手动更新和不可用的数据状态。",
    key_metrics: [
      {
        label: "Connected Feeds",
        label_zh: "已连接数据源 Connected Feeds",
        value: String(connectedCount),
      },
      {
        label: "Unavailable Sections",
        label_zh: "不可用模块 Unavailable Sections",
        value: String(unavailableCount),
      },
    ],
    tables: [
      {
        title: "Update Schedule",
        title_zh: "更新频率 Update Schedule",
        columns: ["Dataset", "Module", "Suggested frequency", "Fresh if", "Stale if", "Update method"],
        rows: SCHEDULE_ROWS,
      },
    ],
  };
}
