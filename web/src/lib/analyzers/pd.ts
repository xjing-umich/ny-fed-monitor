/**
 * pd.ts — Pure compute functions for single-series PD sections and Fails.
 * Ported from backend/app/analyzers/dealer_inventory.py, transactions.py,
 * repo_financing.py, and pd_common.py (build_single_series_section, build_fails_section).
 *
 * NO network calls — takes already-normalized rows.
 */

import type { Section, Metric } from "@/lib/types";
import {
  changeFromWeeks,
  rollingZScore,
  historicalPercentile,
  freshnessStatus,
  finalizeLiveMode,
  formatMillions,
  formatChange,
  type SeriesRow,
} from "@/lib/analyzers/common";

// ─── Series-key config (mirrors SERIES_DEFINITIONS in pd_common.py) ──────────

type SeriesDef = {
  title: string;
  title_zh: string;
  metric_label: string;
  metric_label_zh: string;
};

const SERIES_DEFS: Record<string, SeriesDef> = {
  "dealer-inventory": {
    title: "Dealer Inventory",
    title_zh: "交易商库存 Dealer Inventory",
    metric_label: "Pressure Label",
    metric_label_zh: "库存压力 Pressure Label",
  },
  transactions: {
    title: "Transactions and Liquidity",
    title_zh: "成交与流动性 Transactions / Liquidity",
    metric_label: "Activity Direction",
    metric_label_zh: "成交方向 Activity Direction",
  },
  "repo-financing": {
    title: "Repo Financing",
    title_zh: "回购融资 Repo Financing",
    metric_label: "Usage Label",
    metric_label_zh: "使用标签 Usage Label",
  },
};

// ─── Label functions ──────────────────────────────────────────────────────────

/** dealer_inventory.py _pressure_label */
function pressureLabel(percentile: string): string {
  if (percentile === "Unavailable" || percentile === "Limited sample") {
    return percentile;
  }
  try {
    const value = parseFloat(percentile.replace("%", ""));
    if (isNaN(value)) return "Unavailable";
    if (value < 50) return "Low / Normal";
    if (value < 75) return "Moderate";
    if (value < 90) return "Elevated";
    return "Extreme";
  } catch {
    return "Unavailable";
  }
}

/** transactions.py _activity_label */
function activityLabel(
  oneWeekChange: number | null,
  percentile: string
): string {
  if (oneWeekChange === null) return "Unavailable";
  if (oneWeekChange < 0) {
    if (percentile !== "Unavailable" && percentile !== "Limited sample") {
      try {
        const pct = parseFloat(percentile.replace("%", ""));
        if (!isNaN(pct) && pct >= 75) {
          return "High activity despite weekly decline";
        }
      } catch {
        // fall through
      }
    }
    return "Watch / Mild";
  }
  return "Stable / improving";
}

/** repo_financing.py _usage_label */
function usageLabel(percentile: string): string {
  if (percentile === "Unavailable" || percentile === "Limited sample") {
    return percentile;
  }
  try {
    const value = parseFloat(percentile.replace("%", ""));
    if (isNaN(value)) return "Unavailable";
    if (value < 50) return "Normal";
    if (value < 75) return "Moderate";
    if (value < 90) return "Elevated";
    return "Elevated / High usage";
  } catch {
    return "Unavailable";
  }
}

// ─── Generic label dispatcher ─────────────────────────────────────────────────

function computeLabel(
  key: string,
  percentile: string,
  oneWeekChange: number | null
): string {
  switch (key) {
    case "dealer-inventory":
      return pressureLabel(percentile);
    case "transactions":
      return activityLabel(oneWeekChange, percentile);
    case "repo-financing":
      return usageLabel(percentile);
    default:
      return "Unavailable";
  }
}

// ─── computeSingleSeries ─────────────────────────────────────────────────────

/**
 * Pure compute function mirroring build_single_series_section in pd_common.py.
 * rows must already be sorted by date (ascending), no nulls.
 */
export function computeSingleSeries(rows: SeriesRow[], key: string): Section {
  const def = SERIES_DEFS[key];
  if (!def) throw new Error(`Unknown series key: ${key}`);

  if (!rows.length) {
    return finalizeLiveMode({
      title: def.title,
      title_zh: def.title_zh,
      mode: "live",
      freshness_status: "Missing",
      data_date: null,
      key_metrics: [],
      warnings: ["No data available."],
      normalized_data: [],
    });
  }

  const series = rows.filter((r) => r.value !== null && r.date);

  const latest = series[series.length - 1] ?? null;

  const { change: oneWeek, warning: w1 } = changeFromWeeks(series, 1);
  const { change: fourWeek, warning: w4 } = changeFromWeeks(series, 4);
  const { change: thirteenWeek, warning: w13 } = changeFromWeeks(series, 13);

  const warnings: string[] = [];
  if (w1) warnings.push(w1);
  if (w4) warnings.push(w4);
  if (w13) warnings.push(w13);

  const percentile = historicalPercentile(series);
  const zscore = rollingZScore(series);
  const labelValue = computeLabel(key, percentile, oneWeek);

  const dataDate = latest?.date ?? null;

  const key_metrics: Metric[] = [
    {
      label: "Latest Level",
      label_zh: "最新水平 Latest Level",
      value: formatMillions(latest?.value ?? null),
      unit: "",
    },
    {
      label: "1-week Change",
      label_zh: "1周变化 1-week Change",
      value: formatChange(oneWeek),
      unit: "",
    },
    {
      label: "4-week Change",
      label_zh: "4周变化 4-week Change",
      value: formatChange(fourWeek),
      unit: "",
    },
    {
      label: "13-week Change",
      label_zh: "13周变化 13-week Change",
      value: formatChange(thirteenWeek),
      unit: "",
    },
    {
      label: "Historical Percentile",
      label_zh: "历史分位 Historical Percentile",
      value: percentile,
      unit: "",
    },
    {
      label: "Rolling z-score",
      label_zh: "滚动 z-score Rolling z-score",
      value: zscore === null ? "Unavailable" : zscore.toFixed(2),
      unit: "",
    },
    {
      label: "Observations Used",
      label_zh: "样本数量 Observations Used",
      value: String(series.length),
      unit: "",
    },
    {
      label: def.metric_label,
      label_zh: def.metric_label_zh,
      value: labelValue,
      unit: "",
    },
  ];

  return finalizeLiveMode({
    title: def.title,
    title_zh: def.title_zh,
    mode: "live",
    freshness_status: freshnessStatus(dataDate),
    data_date: dataDate,
    summary: `Latest level is ${formatMillions(latest?.value ?? null)}; ${def.metric_label} is ${labelValue}.`,
    summary_zh: `最新水平为 ${formatMillions(latest?.value ?? null)}；${def.metric_label_zh} 为 ${labelValue}。`,
    key_metrics,
    warnings,
    normalized_data: series as Record<string, unknown>[],
  });
}

// ─── computeFails ─────────────────────────────────────────────────────────────

/**
 * Pure compute for the Fails section.
 * normalized_data in the fails fixture is already the combined {date, value} series
 * (deliver + receive summed). The fixture also has deliver/receive breakdown in
 * series_used. We accept those separately so we can reproduce the per-series metrics.
 *
 * For parity test: the fixture normalized_data IS the combined series.
 * We derive deliver/receive from series_used (or accept explicit arguments).
 */
export function computeFails(
  combinedRows: SeriesRow[],
  deliverLatestValue?: number | null,
  receiveLatestValue?: number | null
): Section {
  if (!combinedRows.length) {
    return finalizeLiveMode({
      title: "Fails and Specialness",
      title_zh: "结算失败 Fails / Specialness",
      mode: "live",
      freshness_status: "Missing",
      data_date: null,
      key_metrics: [],
      warnings: ["No data available."],
      normalized_data: [],
    });
  }

  const combined = combinedRows.filter((r) => r.value !== null && r.date);
  const latest = combined[combined.length - 1] ?? null;

  const { change: oneWeek, warning: w1 } = changeFromWeeks(combined, 1);
  const { change: fourWeek, warning: w4 } = changeFromWeeks(combined, 4);
  const { change: thirteenWeek, warning: w13 } = changeFromWeeks(combined, 13);

  const warnings: string[] = [];
  if (w1) warnings.push(w1);
  if (w4) warnings.push(w4);
  if (w13) warnings.push(w13);

  const percentile = historicalPercentile(combined);
  const zscore = rollingZScore(combined);
  const direction =
    oneWeek !== null && oneWeek > 0 ? "rising" : "stable / falling";

  const dataDate = latest?.date ?? null;

  const key_metrics: Metric[] = [
    {
      label: "Latest Fails Measure",
      label_zh: "最新 fails 指标 Latest Fails Measure",
      value: formatMillions(latest?.value ?? null),
      unit: "",
    },
    {
      label: "Fails to Deliver",
      label_zh: "Fails to Deliver",
      value: formatMillions(deliverLatestValue ?? null),
      unit: "",
    },
    {
      label: "Fails to Receive",
      label_zh: "Fails to Receive",
      value: formatMillions(receiveLatestValue ?? null),
      unit: "",
    },
    {
      label: "1-week Change",
      label_zh: "1周变化 1-week Change",
      value: formatChange(oneWeek),
      unit: "",
    },
    {
      label: "4-week Change",
      label_zh: "4周变化 4-week Change",
      value: formatChange(fourWeek),
      unit: "",
    },
    {
      label: "13-week Change",
      label_zh: "13周变化 13-week Change",
      value: formatChange(thirteenWeek),
      unit: "",
    },
    {
      label: "Historical Percentile",
      label_zh: "历史分位 Historical Percentile",
      value: percentile,
      unit: "",
    },
    {
      label: "Rolling z-score",
      label_zh: "滚动 z-score Rolling z-score",
      value: zscore === null ? "Unavailable" : zscore.toFixed(2),
      unit: "",
    },
    {
      label: "Observations Used",
      label_zh: "样本数量 Observations Used",
      value: String(combined.length),
      unit: "",
    },
    {
      label: "Fails Direction",
      label_zh: "Fails 方向 Fails Direction",
      value: direction,
      unit: "",
    },
  ];

  return finalizeLiveMode({
    title: "Fails and Specialness",
    title_zh: "结算失败 Fails / Specialness",
    mode: "live",
    freshness_status: freshnessStatus(dataDate),
    data_date: dataDate,
    summary: `Latest combined fails measure is ${formatMillions(latest?.value ?? null)} and direction is ${direction}.`,
    summary_zh: `最新合并 fails 指标为 ${formatMillions(latest?.value ?? null)}，方向为 ${direction}。`,
    key_metrics,
    warnings,
    normalized_data: combined as Record<string, unknown>[],
  });
}
