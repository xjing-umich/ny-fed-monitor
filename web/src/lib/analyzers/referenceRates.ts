/**
 * referenceRates.ts — Pure compute for Reference Rates section.
 * Ported from backend/app/analyzers/reference_rates.py build_reference_rates_section.
 * NO network calls.
 */

import type { Section, Metric } from "@/lib/types";

export type ReferenceRateRow = {
  date: string;
  rate_name: string;
  rate_percent: number | null;
  volume?: number | null;
};

/** _format_bps in reference_rates.py */
function formatBps(spreadPercent: number | null): string {
  if (spreadPercent === null || spreadPercent === undefined) return "Unavailable";
  return `${(spreadPercent * 100) >= 0 ? "+" : ""}${(spreadPercent * 100).toFixed(1)} bps`;
}

/** _funding_rate_stress in reference_rates.py */
function fundingRateStress(sofrEffrPercent: number | null): string {
  if (sofrEffrPercent === null || sofrEffrPercent === undefined) return "Unavailable";
  const spreadBps = sofrEffrPercent * 100;
  if (spreadBps > 20) return "High";
  if (spreadBps > 10) return "Elevated";
  return "Normal";
}

/**
 * Pure compute for Reference Rates section.
 * rows: array of {date, rate_name, rate_percent, volume?} — the normalized_data.
 */
export function computeReferenceRates(rows: ReferenceRateRow[]): Section {
  // Build latest_by_rate: last record per rate_name
  const latestByRate: Record<string, ReferenceRateRow> = {};
  for (const row of rows) {
    const rateName = row.rate_name;
    const current = latestByRate[rateName];
    if (!current || (row.date ?? "") > (current.date ?? "")) {
      latestByRate[rateName] = row;
    }
  }

  const dataDate =
    Object.values(latestByRate)
      .map((r) => r.date)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

  const sofr = latestByRate["SOFR"]?.rate_percent ?? null;
  const effr = latestByRate["EFFR"]?.rate_percent ?? null;
  const obfr = latestByRate["OBFR"]?.rate_percent ?? null;
  const tgcr = latestByRate["TGCR"]?.rate_percent ?? null;
  const bgcr = latestByRate["BGCR"]?.rate_percent ?? null;

  const sofrEffr =
    sofr !== null && effr !== null ? sofr - effr : null;
  const obfrEffr =
    obfr !== null && effr !== null ? obfr - effr : null;
  const tgcrSofr =
    tgcr !== null && sofr !== null ? tgcr - sofr : null;
  const bgcrSofr =
    bgcr !== null && sofr !== null ? bgcr - sofr : null;
  const stress = fundingRateStress(sofrEffr);

  const key_metrics: Metric[] = [
    { label: "SOFR-EFFR", label_zh: "SOFR-EFFR", value: formatBps(sofrEffr), unit: "" },
    { label: "OBFR-EFFR", label_zh: "OBFR-EFFR", value: formatBps(obfrEffr), unit: "" },
    { label: "TGCR-SOFR", label_zh: "TGCR-SOFR", value: formatBps(tgcrSofr), unit: "" },
    { label: "BGCR-SOFR", label_zh: "BGCR-SOFR", value: formatBps(bgcrSofr), unit: "" },
    {
      label: "Funding Rate Stress",
      label_zh: "融资利率压力 Funding Rate Stress",
      value: stress,
      unit: "",
    },
  ];

  return {
    title: "Reference Rates and Funding Conditions",
    title_zh: "短端利率 Reference Rates",
    mode: "live",
    freshness_status: dataDate ? "Fresh" : "Missing",
    data_date: dataDate,
    summary: `Funding Rate Stress is ${stress}. Latest SOFR-EFFR spread is ${formatBps(sofrEffr)}.`,
    summary_zh: `Funding Rate Stress 当前为 ${stress}。最新 SOFR-EFFR 利差为 ${formatBps(sofrEffr)}。`,
    key_metrics,
    warnings: [],
    normalized_data: rows as Record<string, unknown>[],
  };
}
