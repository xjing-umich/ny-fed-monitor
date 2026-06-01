/**
 * marketShare.ts — Pure compute for Market Share and Dealer Concentration section.
 * Ported from backend/app/analyzers/market_share.py build_market_share_section.
 * NO network calls.
 */

import type { Section, Metric } from "@/lib/types";

export type MarketShareRow = {
  frequency: "quarterly" | "ytd";
  period_or_release_date?: string | null;
  security_type?: string | null;
  security?: string | null;
  sector?: string | null;
  trade_channel?: string | null;
  first_quintile_market_share?: number | null;
  second_quintile_market_share?: number | null;
  third_quintile_market_share?: number | null;
  fourth_quintile_market_share?: number | null;
  fifth_quintile_market_share?: number | null;
  daily_avg_volume_millions?: number | null;
};

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  // Python: if value <= 1, multiply by 100 (i.e. 0-1 range → %)
  let v = value;
  if (v <= 1) v *= 100;
  return `${v.toFixed(1)}%`;
}

function formatVolumeMillions(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  const dollars = value * 1_000_000;
  if (dollars >= 1_000_000_000) return `$${(dollars / 1_000_000_000).toFixed(1)} billion`;
  return `$${(dollars / 1_000_000).toFixed(1)} million`;
}

function rowLabel(row: MarketShareRow): string {
  const share = row.first_quintile_market_share;
  if (share === null || share === undefined) return "Unavailable";
  if (share >= 85) return "Extreme";
  if (share >= 65) return "High";
  if (share >= 50) return "Moderate";
  return "Normal";
}

function sparseNote(row: MarketShareRow): string {
  const dailyAvg = row.daily_avg_volume_millions;
  const securityText = `${row.security ?? ""} ${row.sector ?? ""}`.toUpperCase();
  const notes: string[] = [];
  if (dailyAvg === null || dailyAvg === undefined || dailyAvg < 10) {
    notes.push("Sparse / small");
  }
  if (["OTHER", "CMBS", "ABS"].some((t) => securityText.includes(t))) {
    notes.push("Non-core category");
  }
  return notes.join("; ");
}

function tableRows(records: MarketShareRow[], frequency: string): Record<string, unknown>[] {
  const rows = records
    .filter((r) => r.frequency === frequency && r.first_quintile_market_share !== null)
    .sort((a, b) => (b.first_quintile_market_share ?? -1) - (a.first_quintile_market_share ?? -1));
  return rows.slice(0, 10).map((r) => ({
    "Security / Sector": r.security ?? r.sector ?? "Unavailable",
    "Trade Channel": r.trade_channel ?? "Unavailable",
    "First Quintile Share": formatPercent(r.first_quintile_market_share),
    "Daily Avg Volume": formatVolumeMillions(r.daily_avg_volume_millions),
    "Concentration Label": rowLabel(r),
    "Sparse Category Note": sparseNote(r),
  }));
}

/**
 * Pure compute for Market Share section.
 * records: combined quarterly + ytd normalized rows.
 */
export function computeMarketShare(records: MarketShareRow[]): Section {
  try {
    const usable = records.filter((r) => r.first_quintile_market_share !== null);

    if (!usable.length) {
      return {
        title: "Market Share and Dealer Concentration",
        title_zh: "交易商集中度 Market Share",
        mode: "unavailable",
        freshness_status: "Missing",
        data_date: null,
        key_metrics: [
          { label: "Max First-Quintile Share", label_zh: "最高第一五分位份额 Max First-Quintile Share", value: "Unavailable", unit: "" },
          { label: "Sector", label_zh: "最高集中度板块 Sector", value: "Unavailable", unit: "" },
          { label: "Trade Channel", label_zh: "交易渠道 Trade Channel", value: "Unavailable", unit: "" },
          { label: "Daily Avg Volume", label_zh: "日均成交量 Daily Avg Volume", value: "Unavailable", unit: "" },
          { label: "Concentration Label", label_zh: "集中度标签 Concentration Label", value: "Unavailable", unit: "" },
          { label: "Sparse Category Warning", label_zh: "稀疏类别提示 Sparse Category Warning", value: "Unavailable", unit: "" },
          { label: "Data Frequency Available", label_zh: "可用频率 Data Frequency Available", value: "Unavailable", unit: "" },
        ],
        tables: [],
        warnings: ["No usable market share rows available."],
      };
    }

    const maxRow = usable.reduce((best, r) =>
      (r.first_quintile_market_share ?? -1) > (best.first_quintile_market_share ?? -1) ? r : best
    );
    const maxShare = maxRow.first_quintile_market_share;
    const dailyAvg = maxRow.daily_avg_volume_millions;
    const securityText = `${maxRow.security ?? ""} ${maxRow.sector ?? ""}`.toUpperCase();

    let concentrationLabel: string;
    if (maxShare === null || maxShare === undefined) {
      concentrationLabel = "Unavailable";
    } else if (maxShare >= 85) {
      concentrationLabel = "Extreme concentration";
    } else if (maxShare >= 65) {
      concentrationLabel = "High concentration";
    } else if (maxShare >= 50) {
      concentrationLabel = "Moderate concentration";
    } else {
      concentrationLabel = "Normal concentration";
    }

    const sparseNotes: string[] = [];
    if (dailyAvg === null || dailyAvg === undefined || dailyAvg < 10) {
      sparseNotes.push("High concentration may come from a small or sparse category.");
    }
    if (["OTHER", "CMBS", "ABS"].some((t) => securityText.includes(t))) {
      sparseNotes.push("This should not be interpreted as broad Treasury market concentration.");
    }

    const latestDate =
      usable
        .map((r) => r.period_or_release_date)
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? null;

    const availableFrequencies: string[] = [];
    if (usable.some((r) => r.frequency === "quarterly")) availableFrequencies.push("Quarterly");
    if (usable.some((r) => r.frequency === "ytd")) availableFrequencies.push("YTD");

    const sparseWarning = sparseNotes.length > 0 ? sparseNotes.join(" | ") : "No sparse category warning";

    const key_metrics: Metric[] = [
      { label: "Max First-Quintile Share", label_zh: "最高第一五分位份额 Max First-Quintile Share", value: formatPercent(maxShare), unit: "" },
      { label: "Sector", label_zh: "最高集中度板块 Sector", value: maxRow.security ?? "Unavailable", unit: "" },
      { label: "Trade Channel", label_zh: "交易渠道 Trade Channel", value: maxRow.trade_channel ?? "Unavailable", unit: "" },
      { label: "Daily Avg Volume", label_zh: "日均成交量 Daily Avg Volume", value: formatVolumeMillions(dailyAvg), unit: "" },
      { label: "Concentration Label", label_zh: "集中度标签 Concentration Label", value: concentrationLabel, unit: "" },
      { label: "Sparse Category Warning", label_zh: "稀疏类别提示 Sparse Category Warning", value: sparseWarning, unit: "" },
      { label: "Data Frequency Available", label_zh: "可用频率 Data Frequency Available", value: availableFrequencies.join(" / ") || "Unavailable", unit: "" },
    ];

    return {
      title: "Market Share and Dealer Concentration",
      title_zh: "交易商集中度 Market Share",
      mode: "live",
      freshness_status: latestDate ? "Fresh" : "Missing",
      data_date: latestDate,
      summary: `Highest first-quintile share is ${formatPercent(maxShare)} in ${maxRow.security ?? "Unavailable"}.`,
      summary_zh: `最高第一五分位份额为 ${formatPercent(maxShare)}，对应板块 / 券种为 ${maxRow.security ?? "Unavailable"}。`,
      key_metrics,
      tables: [
        {
          title: "Quarterly Market Share Summary",
          title_zh: "Quarterly Market Share Summary",
          columns: ["Security / Sector", "Trade Channel", "First Quintile Share", "Daily Avg Volume", "Concentration Label", "Sparse Category Note"],
          rows: tableRows(records, "quarterly"),
        },
        {
          title: "YTD Market Share Summary",
          title_zh: "YTD Market Share Summary",
          columns: ["Security / Sector", "Trade Channel", "First Quintile Share", "Daily Avg Volume", "Concentration Label", "Sparse Category Note"],
          rows: tableRows(records, "ytd"),
        },
      ],
      warnings: sparseNotes,
      normalized_data: records as Record<string, unknown>[],
    };
  } catch (e) {
    return {
      title: "Market Share and Dealer Concentration",
      title_zh: "交易商集中度 Market Share",
      mode: "unavailable",
      freshness_status: "Missing",
      data_date: null,
      key_metrics: [],
      warnings: [String(e)],
    };
  }
}
