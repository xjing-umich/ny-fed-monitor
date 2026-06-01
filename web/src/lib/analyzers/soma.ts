/**
 * soma.ts — Pure compute for SOMA section.
 * Ported from backend/app/analyzers/soma.py compute_soma_indicators + build_soma_section.
 * NO network calls.
 */

import type { Section, Metric } from "@/lib/types";
import { closestRecord, freshnessStatus } from "@/lib/analyzers/common";

export type SomaRow = {
  date: string;
  category: "Treasury" | "MBS" | "Total";
  par_value: number | null;
  source?: string;
  raw_total?: number | null;
};

/** _format_dollars_to_readable in soma.py (takes raw dollar value, not millions) */
function formatDollars(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "Unavailable";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(decimals)} trillion`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(decimals)} billion`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(decimals)} million`;
  return `${sign}$${abs.toFixed(decimals)}`;
}

/** _format_change in soma.py */
function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatDollars(value)}`;
}

/** _series_by_category */
function seriesByCategory(rows: SomaRow[], category: string): SomaRow[] {
  return rows
    .filter((r) => r.category === category && r.date && r.par_value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** _change_from_weeks for soma (uses par_value, not value) */
function changeFromWeeksSoma(
  series: SomaRow[],
  weeks: number
): { change: number | null; warning?: string } {
  if (!series.length) return { change: null, warning: "No observations available." };
  const latest = series[series.length - 1];
  const latestDate = new Date(latest.date + "T00:00:00Z");
  if (isNaN(latestDate.getTime())) return { change: null, warning: "Latest date is invalid." };
  const targetMs = latestDate.getTime() - weeks * 7 * 24 * 60 * 60 * 1000;
  const targetDate = new Date(targetMs);

  // Use series[:-1] for searching (mirrors Python)
  const searchIn = series.length > 1 ? series.slice(0, -1) : series;
  // Find closest by date
  let best: SomaRow | null = null;
  let bestDist = Infinity;
  for (const row of searchIn) {
    const rd = new Date(row.date + "T00:00:00Z");
    if (isNaN(rd.getTime())) continue;
    const dist = Math.abs(rd.getTime() - targetDate.getTime());
    if (dist < bestDist) {
      bestDist = dist;
      best = row;
    }
  }
  if (!best || best.par_value === null || latest.par_value === null) {
    return { change: null, warning: `No nearby observation found for ${weeks}-week change.` };
  }
  return { change: latest.par_value - best.par_value };
}

/**
 * Pure compute for SOMA section.
 * rows: array from normalized_data (SomaRow[]) — includes Treasury/MBS/Total categories.
 */
export function computeSoma(rows: SomaRow[]): Section {
  const treasury = seriesByCategory(rows, "Treasury");
  const mbs = seriesByCategory(rows, "MBS");
  const total = seriesByCategory(rows, "Total");

  const warnings: string[] = [];

  const latestTotal = total[total.length - 1] ?? null;
  const latestTreasury = treasury[treasury.length - 1] ?? null;
  const latestMbs = mbs[mbs.length - 1] ?? null;
  const dataDate = latestTotal?.date ?? null;

  const { change: total1w, warning: w1 } = changeFromWeeksSoma(total, 1);
  const { change: total4w, warning: w4 } = changeFromWeeksSoma(total, 4);
  const { change: total13w, warning: w13 } = changeFromWeeksSoma(total, 13);
  const { change: treasury4w, warning: wt4 } = changeFromWeeksSoma(treasury, 4);
  const { change: mbs4w, warning: wm4 } = changeFromWeeksSoma(mbs, 4);

  if (w1) warnings.push(w1);
  if (w4) warnings.push(w4);
  if (w13) warnings.push(w13);
  if (wt4) warnings.push(wt4);
  if (wm4) warnings.push(wm4);

  const latestTreasuryHoldings = latestTreasury?.par_value ?? null;
  const latestMbsHoldings = latestMbs?.par_value ?? null;

  const key_metrics: Metric[] = [
    {
      label: "Latest Treasury Holdings",
      label_zh: "最新 Treasury 持仓 Latest Treasury Holdings",
      value: formatDollars(latestTreasuryHoldings),
      unit: "",
    },
    {
      label: "Latest MBS Holdings",
      label_zh: "最新 MBS 持仓 Latest MBS Holdings",
      value: formatDollars(latestMbsHoldings),
      unit: "",
    },
    {
      label: "Total SOMA 1-week Change",
      label_zh: "SOMA 1周变化 Total SOMA 1-week Change",
      value: formatChange(total1w),
      unit: "",
    },
    {
      label: "Total SOMA 4-week Change",
      label_zh: "SOMA 4周变化 Total SOMA 4-week Change",
      value: formatChange(total4w),
      unit: "",
    },
    {
      label: "Total SOMA 13-week Change",
      label_zh: "SOMA 13周变化 Total SOMA 13-week Change",
      value: formatChange(total13w),
      unit: "",
    },
    {
      label: "Treasury 4-week Change",
      label_zh: "Treasury 4周变化 Treasury 4-week Change",
      value: formatChange(treasury4w),
      unit: "",
    },
    {
      label: "MBS 4-week Change",
      label_zh: "MBS 4周变化 MBS 4-week Change",
      value: formatChange(mbs4w),
      unit: "",
    },
  ];

  return {
    title: "SOMA and Balance Sheet Pressure",
    title_zh: "美联储持仓 SOMA",
    mode: "live",
    freshness_status: freshnessStatus(dataDate),
    data_date: dataDate,
    summary: `Latest Treasury holdings are ${formatDollars(latestTreasuryHoldings)} and latest MBS holdings are ${formatDollars(latestMbsHoldings)}.`,
    summary_zh: `最新 Treasury 持仓为 ${formatDollars(latestTreasuryHoldings)}，最新 MBS 持仓为 ${formatDollars(latestMbsHoldings)}。`,
    key_metrics,
    warnings,
    normalized_data: rows as Record<string, unknown>[],
  };
}
