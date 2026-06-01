/**
 * facilityUsage.ts — Pure compute for Money Market Facilities section.
 * Ported from backend/app/analyzers/facility_usage.py build_facility_usage_section.
 * NO network calls.
 */

import type { Section, Metric } from "@/lib/types";

export type FacilityRow = {
  date: string | null;
  facility: string;
  operation_type?: string;
  accepted_amount: number | null;
  submitted_amount?: number | null;
  rate?: number | null;
  counterparty_count?: number | null;
  security_type?: string | null;
  maturity_date?: string | null;
  description?: string | null;
  is_small_value_exercise: boolean;
  raw?: unknown;
};

export type ReferenceRatesSection = {
  key_metrics?: Array<{ label: string; value: string }>;
};

/** _format_dollars in facility_usage.py */
function formatDollars(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs === 0) return `${sign}$0`;
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)} trillion`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)} billion`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)} million`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** _format_change in facility_usage.py */
function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Unavailable";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatDollars(value)}`;
}

/** _series in facility_usage.py */
function seriesForFacility(
  rows: FacilityRow[],
  facilityName: string,
  includeSmallValue = false
): FacilityRow[] {
  return rows
    .filter(
      (r) =>
        r.facility === facilityName &&
        r.date &&
        r.accepted_amount !== null &&
        (includeSmallValue || !r.is_small_value_exercise)
    )
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

/** _closest_value_change in facility_usage.py */
function closestValueChange(
  series: FacilityRow[],
  days: number
): { change: number | null; warning?: string } {
  if (series.length < 2) return { change: null, warning: "Limited sample" };
  const latest = series[series.length - 1];
  const latestDate = new Date(latest.date! + "T00:00:00Z");
  const targetDate = new Date(latestDate.getTime() - days * 24 * 60 * 60 * 1000);

  let best: FacilityRow | null = null;
  let bestDist = Infinity;
  for (const row of series.slice(0, -1)) {
    const rd = new Date(row.date! + "T00:00:00Z");
    if (isNaN(rd.getTime())) continue;
    const dist = Math.abs(rd.getTime() - targetDate.getTime());
    if (dist < bestDist) {
      bestDist = dist;
      best = row;
    }
  }
  if (!best) return { change: null, warning: "Unavailable" };
  return { change: (latest.accepted_amount ?? 0) - (best.accepted_amount ?? 0) };
}

/** _on_rrp_cash_buffer_label in facility_usage.py */
function onRrpCashBufferLabel(series: FacilityRow[]): string {
  if (series.length < 5) return "Limited sample";
  const values = series
    .filter((r) => r.accepted_amount !== null)
    .map((r) => r.accepted_amount as number)
    .sort((a, b) => a - b);
  if (!values.length) return "Unavailable";
  const latest = series[series.length - 1].accepted_amount ?? 0;
  const below = values.filter((v) => v <= latest).length;
  const percentile = (below / values.length) * 100;
  if (percentile > 75) return "High";
  if (percentile >= 25) return "Moderate";
  return "Low-Watch";
}

/** _repo_active_label in facility_usage.py */
function repoActiveLabel(series: FacilityRow[]): string {
  if (!series.length) return "Inactive";
  const latest = series[series.length - 1];
  const amount = latest.accepted_amount;
  if (amount === null || amount === 0) return "Inactive";
  if (latest.is_small_value_exercise) return "Small value exercise only";
  return "Active";
}

/** _sample_window_text in facility_usage.py */
function sampleWindowText(rows: FacilityRow[]): string {
  const dates = [...new Set(rows.map((r) => r.date).filter(Boolean) as string[])].sort();
  if (!dates.length) return "Unavailable";
  if (dates.length === 1) return dates[0];
  return `${dates[0]} to ${dates[dates.length - 1]}`;
}

/** _sofr_effr_bps from reference_rates section */
function sofrEffrBps(referenceSection: ReferenceRatesSection): number | null {
  const metric = (referenceSection.key_metrics ?? []).find(
    (m) => m.label === "SOFR-EFFR"
  );
  if (!metric) return null;
  const raw = String(metric.value ?? "").replace("bps", "").trim();
  const val = parseFloat(raw);
  return isNaN(val) ? null : val;
}

/**
 * Pure compute for Facility Usage section.
 * rows: normalized_data from facility-usage fixture (FacilityRow[]).
 * referenceSection: the reference-rates Section (for SOFR-EFFR bps lookup).
 */
export function computeFacilityUsage(
  rows: FacilityRow[],
  referenceSection: ReferenceRatesSection
): Section {
  if (!rows.length) {
    return {
      title: "Money Market Facilities: ON RRP and SRP",
      title_zh: "资金工具 ON RRP / SRP",
      mode: "unavailable",
      freshness_status: "Unavailable",
      data_date: null,
      key_metrics: [
        { label: "ON RRP Latest Usage", label_zh: "ON RRP 最新使用量 ON RRP Latest Usage", value: "Unavailable", unit: "" },
        { label: "ON RRP Recent Change", label_zh: "ON RRP 近期变化 ON RRP Recent Change", value: "Unavailable", unit: "" },
        { label: "ON RRP Cash Buffer Label", label_zh: "现金缓冲标签 Cash Buffer Label", value: "Unavailable", unit: "" },
        { label: "Repo / SRP Latest Usage", label_zh: "Repo / SRP 最新使用量 Repo / SRP Latest Usage", value: "Unavailable", unit: "" },
        { label: "Repo / SRP Active Label", label_zh: "Repo / SRP 状态 Repo / SRP Active Label", value: "Unavailable", unit: "" },
        { label: "Facility Usage Signal", label_zh: "资金工具信号 Facility Usage Signal", value: "Unavailable", unit: "" },
        { label: "Sample Window", label_zh: "样本窗口 Sample Window", value: "Unavailable", unit: "" },
      ],
      tables: [],
      warnings: ["Facility usage data unavailable."],
    };
  }

  const onRrpSeries = seriesForFacility(rows, "ON RRP");
  const repoSeries = seriesForFacility(rows, "Repo / SRP", true);

  const onRrpLatest = onRrpSeries.length ? onRrpSeries[onRrpSeries.length - 1].accepted_amount : null;
  const repoLatest = repoSeries.length ? repoSeries[repoSeries.length - 1].accepted_amount : null;

  const { change: onRrp1w, warning: w1w } = closestValueChange(onRrpSeries, 7);
  const { change: onRrp2w, warning: w2w } = closestValueChange(onRrpSeries, 14);

  const warnings: string[] = [];
  if (w1w && w1w !== "Limited sample") warnings.push(`ON RRP 1-week change: ${w1w}`);
  if (w2w && w2w !== "Limited sample") warnings.push(`ON RRP 2-week change: ${w2w}`);

  const onRrpCashBuffer = onRrpCashBufferLabel(onRrpSeries);
  const repoLabel = repoActiveLabel(repoSeries);
  const sofr_effr_bps = sofrEffrBps(referenceSection);

  let facilitySignal = "Normal";
  if (onRrpSeries.length < 3 && repoSeries.length < 3) {
    facilitySignal = "Limited sample";
  } else if (repoLabel === "Active" && sofr_effr_bps !== null && sofr_effr_bps > 10) {
    facilitySignal = "Elevated";
  } else if (
    onRrpCashBuffer === "Low-Watch" ||
    repoLabel === "Active" ||
    repoLabel === "Small value exercise only"
  ) {
    facilitySignal = "Watch";
  } else if (onRrpCashBuffer === "Limited sample") {
    facilitySignal = "Limited sample";
  }

  const dateCandidates = [onRrpSeries, repoSeries]
    .filter((s) => s.length > 0)
    .map((s) => s[s.length - 1].date!);
  const dataDate = dateCandidates.length ? dateCandidates.sort().reverse()[0] : null;

  const sampleWindow = sampleWindowText(rows);

  // Recent change: prefer 1w, fallback to 2w
  const recentChange = onRrp1w !== null ? onRrp1w : onRrp2w;

  const key_metrics: Metric[] = [
    { label: "ON RRP Latest Usage", label_zh: "ON RRP 最新使用量 ON RRP Latest Usage", value: formatDollars(onRrpLatest), unit: "" },
    { label: "ON RRP Recent Change", label_zh: "ON RRP 近期变化 ON RRP Recent Change", value: formatChange(recentChange), unit: "" },
    { label: "ON RRP Cash Buffer Label", label_zh: "现金缓冲标签 Cash Buffer Label", value: onRrpCashBuffer, unit: "" },
    { label: "Repo / SRP Latest Usage", label_zh: "Repo / SRP 最新使用量 Repo / SRP Latest Usage", value: formatDollars(repoLatest), unit: "" },
    { label: "Repo / SRP Active Label", label_zh: "Repo / SRP 状态 Repo / SRP Active Label", value: repoLabel, unit: "" },
    { label: "Facility Usage Signal", label_zh: "资金工具信号 Facility Usage Signal", value: facilitySignal, unit: "" },
    { label: "Sample Window", label_zh: "样本窗口 Sample Window", value: sampleWindow, unit: "" },
  ];

  return {
    title: "Money Market Facilities: ON RRP and SRP",
    title_zh: "资金工具 ON RRP / SRP",
    mode: "live",
    freshness_status: dataDate ? "Fresh" : "Missing",
    data_date: dataDate,
    summary: `Facility Usage Signal is ${facilitySignal}. ON RRP latest usage is ${formatDollars(onRrpLatest)}.`,
    summary_zh: `Facility Usage Signal 当前为 ${facilitySignal}。ON RRP 最新使用量为 ${formatDollars(onRrpLatest)}。`,
    key_metrics,
    warnings,
    normalized_data: rows as Record<string, unknown>[],
  };
}
