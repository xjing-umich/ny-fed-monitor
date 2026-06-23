import type { Section, Metric } from "@/lib/types";
import type { FredSeries } from "@/lib/sources/fred";

const SERIES_LABELS: Record<string, string> = {
  DGS2: "2Y Treasury Yield",
  DGS10: "10Y Treasury Yield",
  DGS30: "30Y Treasury Yield",
  T10Y2Y: "10Y-2Y Curve",
  DFII10: "10Y Real Yield",
  T10YIE: "10Y Breakeven",
};

const SERIES_LABELS_ZH: Record<string, string> = {
  DGS2: "2Y 美债收益率 2Y Treasury Yield",
  DGS10: "10Y 美债收益率 10Y Treasury Yield",
  DGS30: "30Y 美债收益率 30Y Treasury Yield",
  T10Y2Y: "10Y-2Y 曲线 10Y-2Y Curve",
  DFII10: "10Y 实际收益率 10Y Real Yield",
  T10YIE: "10Y Breakeven 10Y Breakeven",
};

function latest(series: FredSeries): { date: string; value: number } | null {
  for (let i = series.points.length - 1; i >= 0; i--) {
    const point = series.points[i];
    if (point?.date && point.value !== null) return { date: point.date, value: point.value };
  }
  return null;
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(2)}%`;
}

function curveLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  if (value < -0.5) return "Deep inversion";
  if (value < 0) return "Inverted";
  if (value < 0.5) return "Flat";
  return "Positive slope";
}

function realYieldPressure(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  if (value >= 2.25) return "High";
  if (value >= 1.75) return "Elevated";
  return "Normal";
}

function breakevenPressure(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  if (value >= 2.75) return "High";
  if (value >= 2.4) return "Elevated";
  if (value < 1.8) return "Low";
  return "Normal";
}

function macroPricingSignal(curve: string, realYield: string, breakeven: string): string {
  if ([realYield, breakeven].includes("High")) return "High";
  if ([realYield, breakeven].includes("Elevated") || curve === "Deep inversion") return "Watch";
  if ([realYield, breakeven, curve].includes("Unavailable")) return "Partial";
  return "Normal";
}

export function computeMacroPricing(series: FredSeries[]): Section {
  const byId = new Map(series.map((item) => [item.id, latest(item)]));
  const dataDate = [...byId.values()]
    .map((item) => item?.date)
    .filter((date): date is string => Boolean(date))
    .sort()
    .reverse()[0] ?? null;

  const value = (id: string) => byId.get(id)?.value ?? null;
  const curve = curveLabel(value("T10Y2Y"));
  const realYield = realYieldPressure(value("DFII10"));
  const breakeven = breakevenPressure(value("T10YIE"));
  const signal = macroPricingSignal(curve, realYield, breakeven);

  const keyMetrics: Metric[] = [
    ...["DGS2", "DGS10", "DGS30", "T10Y2Y", "DFII10", "T10YIE"].map((id) => ({
      label: SERIES_LABELS[id],
      label_zh: SERIES_LABELS_ZH[id],
      value: formatPct(value(id)),
      unit: "",
    })),
    { label: "Curve Regime", label_zh: "曲线状态 Curve Regime", value: curve, unit: "" },
    { label: "Real Yield Pressure", label_zh: "实际利率压力 Real Yield Pressure", value: realYield, unit: "" },
    { label: "Breakeven Pressure", label_zh: "Breakeven 压力 Breakeven Pressure", value: breakeven, unit: "" },
    { label: "Macro Pricing Signal", label_zh: "宏观定价信号 Macro Pricing Signal", value: signal, unit: "" },
  ];

  const rows = [...byId.entries()].map(([id, point]) => ({
    series: id,
    label: SERIES_LABELS[id] ?? id,
    date: point?.date ?? null,
    value: point?.value ?? null,
    formatted_value: formatPct(point?.value),
  }));

  return {
    title: "Macro Pricing",
    title_zh: "宏观定价 Macro Pricing",
    mode: "live",
    freshness_status: dataDate ? "Fresh" : "Missing",
    data_date: dataDate,
    summary: `Macro Pricing Signal is ${signal}. 10Y is ${formatPct(value("DGS10"))}; 10Y real yield is ${formatPct(value("DFII10"))}; 10Y breakeven is ${formatPct(value("T10YIE"))}.`,
    summary_zh: `Macro Pricing Signal 当前为 ${signal}。10Y 为 ${formatPct(value("DGS10"))}，10Y real yield 为 ${formatPct(value("DFII10"))}，10Y breakeven 为 ${formatPct(value("T10YIE"))}。`,
    interpretation: "Macro Pricing decomposes nominal Treasury pressure into curve shape, real-yield pressure, and inflation compensation. It is a pricing decomposition, not a complete driver label by itself.",
    interpretation_zh: "宏观定价模块把名义美债收益率压力拆成曲线形态、实际利率压力和通胀补偿。它是定价拆解，不是单独的完整驱动归因。",
    why_it_matters: "A long-end move is more convincing when real yields, breakevens, supply pressure, and macro conditions confirm one another on the same horizon.",
    why_it_matters_zh: "只有实际利率、breakeven、供给压力和宏观确认层在相近时间维度互相确认时，长端变化的解释力才更强。",
    key_metrics: keyMetrics,
    tables: [
      {
        title: "Latest FRED Market Pricing Signals",
        title_zh: "最新 FRED 市场定价信号 Latest FRED Market Pricing Signals",
        rows,
      },
    ],
    warnings: [
      "FRED daily series are published/closing data, not intraday market prices.",
      "Do not label every yield rise as inflation or every yield fall as risk-off without same-horizon and cross-asset confirmation.",
    ],
    warnings_zh: [
      "FRED 日频序列是发布/收盘数据，不是盘中实时行情。",
      "没有同一时间维度和跨资产确认时，不要把所有收益率上行都归因于通胀，也不要把所有收益率下行都归因于 risk-off。",
    ],
    normalized_data: rows,
  };
}
