import type { Section, Metric } from "@/lib/types";
import type { FredSeries } from "@/lib/sources/fred";

const SERIES_LABELS: Record<string, string> = {
  GDPNOW: "GDPNow",
  NFCI: "Chicago NFCI",
  ANFCI: "Chicago Adjusted NFCI",
  CFNAI: "Chicago CFNAI",
  UNRATE: "Unemployment Rate",
  PAYEMS: "Nonfarm Payrolls",
  CPIAUCSL: "CPI YoY",
  PCEPI: "PCE YoY",
};

const SERIES_LABELS_ZH: Record<string, string> = {
  GDPNOW: "GDPNow GDPNow",
  NFCI: "Chicago NFCI",
  ANFCI: "Chicago Adjusted NFCI",
  CFNAI: "Chicago CFNAI",
  UNRATE: "失业率 Unemployment Rate",
  PAYEMS: "非农就业 Nonfarm Payrolls",
  CPIAUCSL: "CPI YoY CPI YoY",
  PCEPI: "PCE YoY PCE YoY",
};

function validPoints(series: FredSeries): Array<{ date: string; value: number }> {
  return series.points.filter((point): point is { date: string; value: number } => (
    Boolean(point.date) && point.value !== null && Number.isFinite(point.value)
  ));
}

function latest(series: FredSeries): { date: string; value: number } | null {
  const points = validPoints(series);
  return points[points.length - 1] ?? null;
}

function previous(series: FredSeries, periods = 1): { date: string; value: number } | null {
  const points = validPoints(series);
  return points[points.length - 1 - periods] ?? null;
}

function yearAgo(series: FredSeries): { date: string; value: number } | null {
  const points = validPoints(series);
  const last = points[points.length - 1];
  if (!last) return null;
  const target = new Date(last.date);
  target.setFullYear(target.getFullYear() - 1);
  const targetText = target.toISOString().slice(0, 10);
  return [...points].reverse().find((point) => point.date <= targetText) ?? null;
}

function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(digits)}%`;
}

function numberText(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return value.toFixed(digits);
}

function roundedNumber(value: number | null | undefined, digits = 2): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function yoy(series: FredSeries): number | null {
  const last = latest(series);
  const base = yearAgo(series);
  if (!last || !base || base.value === 0) return null;
  return ((last.value / base.value) - 1) * 100;
}

function monthChange(series: FredSeries): number | null {
  const last = latest(series);
  const prior = previous(series, 1);
  if (!last || !prior) return null;
  return last.value - prior.value;
}

function financialConditions(nfci: number | null | undefined): string {
  if (nfci === null || nfci === undefined || !Number.isFinite(nfci)) return "Unavailable";
  if (nfci > 0.5) return "Tight";
  if (nfci > 0) return "Slightly tight";
  if (nfci < -0.5) return "Loose";
  return "Near average";
}

function activitySignal(cfnai: number | null | undefined): string {
  if (cfnai === null || cfnai === undefined || !Number.isFinite(cfnai)) return "Unavailable";
  if (cfnai >= 0.7) return "Strong";
  if (cfnai >= -0.7) return "Near trend";
  return "Weak";
}

function inflationSignal(cpiYoy: number | null, pceYoy: number | null): string {
  const values = [cpiYoy, pceYoy].filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) return "Unavailable";
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (avg >= 3.5) return "High";
  if (avg >= 2.5) return "Elevated";
  return "Normal";
}

function macroConditionsSignal(financial: string, activity: string, inflation: string): string {
  if (financial === "Tight" || inflation === "High") return "High";
  if (financial === "Slightly tight" || activity === "Weak" || inflation === "Elevated") return "Watch";
  if ([financial, activity, inflation].includes("Unavailable")) return "Partial";
  return "Normal";
}

export function computeMacroConditions(series: FredSeries[]): Section {
  const byId = new Map(series.map((item) => [item.id, item]));
  const latestById = new Map(series.map((item) => [item.id, latest(item)]));
  const dataDate = [...latestById.values()]
    .map((item) => item?.date)
    .filter((date): date is string => Boolean(date))
    .sort()
    .reverse()[0] ?? null;

  const value = (id: string) => latestById.get(id)?.value ?? null;
  const cpiYoy = yoy(byId.get("CPIAUCSL") ?? { id: "CPIAUCSL", points: [] });
  const pceYoy = yoy(byId.get("PCEPI") ?? { id: "PCEPI", points: [] });
  const payrollChange = monthChange(byId.get("PAYEMS") ?? { id: "PAYEMS", points: [] });
  const financial = financialConditions(value("NFCI"));
  const activity = activitySignal(value("CFNAI"));
  const inflation = inflationSignal(cpiYoy, pceYoy);
  const signal = macroConditionsSignal(financial, activity, inflation);

  const metrics: Metric[] = [
    { label: "Macro Conditions Signal", label_zh: "宏观确认信号 Macro Conditions Signal", value: signal, unit: "" },
    { label: "GDPNow", label_zh: "GDPNow GDPNow", value: pct(value("GDPNOW"), 1), unit: "" },
    { label: "Financial Conditions Signal", label_zh: "金融条件信号 Financial Conditions Signal", value: financial, unit: "" },
    { label: "Activity Signal", label_zh: "活动信号 Activity Signal", value: activity, unit: "" },
    { label: "Inflation Signal", label_zh: "通胀信号 Inflation Signal", value: inflation, unit: "" },
    { label: "Chicago NFCI", label_zh: "Chicago NFCI", value: numberText(value("NFCI"), 2), unit: "" },
    { label: "Chicago ANFCI", label_zh: "Chicago ANFCI", value: numberText(value("ANFCI"), 2), unit: "" },
    { label: "Chicago CFNAI", label_zh: "Chicago CFNAI", value: numberText(value("CFNAI"), 2), unit: "" },
    { label: "Unemployment Rate", label_zh: "失业率 Unemployment Rate", value: pct(value("UNRATE"), 1), unit: "" },
    { label: "Payrolls Monthly Change", label_zh: "非农月变化 Payrolls Monthly Change", value: payrollChange === null ? "Unavailable" : `${payrollChange.toFixed(0)}k`, unit: "" },
    { label: "CPI YoY", label_zh: "CPI YoY", value: pct(cpiYoy, 1), unit: "" },
    { label: "PCE YoY", label_zh: "PCE YoY", value: pct(pceYoy, 1), unit: "" },
  ];

  const rows = [...latestById.entries()].map(([id, point]) => ({
    series: id,
    label: SERIES_LABELS[id] ?? id,
    date: point?.date ?? null,
    value: id === "CPIAUCSL" ? roundedNumber(cpiYoy) : id === "PCEPI" ? roundedNumber(pceYoy) : point?.value ?? null,
    formatted_value: id === "CPIAUCSL"
      ? pct(cpiYoy, 1)
      : id === "PCEPI"
        ? pct(pceYoy, 1)
        : id === "PAYEMS"
      ? numberText(point?.value, 0)
      : ["NFCI", "ANFCI", "CFNAI"].includes(id)
        ? numberText(point?.value, 2)
        : pct(point?.value, 1),
  }));

  return {
    title: "Macro Conditions",
    title_zh: "宏观确认 Macro Conditions",
    mode: "live",
    freshness_status: dataDate ? "Fresh" : "Missing",
    data_date: dataDate,
    summary: `Macro Conditions Signal is ${signal}. GDPNow is ${pct(value("GDPNOW"), 1)}, financial conditions are ${financial}, and inflation is ${inflation}.`,
    summary_zh: `Macro Conditions Signal 当前为 ${signal}。GDPNow 为 ${pct(value("GDPNOW"), 1)}，金融条件为 ${financial}，通胀为 ${inflation}。`,
    interpretation: "Macro Conditions checks whether growth, labor, inflation, and financial conditions confirm or contradict market pricing. It is a confirmation layer rather than a live market driver.",
    interpretation_zh: "宏观确认模块用于判断增长、就业、通胀和金融条件是否确认或反驳市场定价。它是确认层，不是实时市场驱动。",
    why_it_matters: "Treasury pricing has higher confidence when daily market pricing is supported by macro releases and financial-condition context, with frequency differences kept explicit.",
    why_it_matters_zh: "当日频市场定价能被宏观发布和金融条件背景支持，并且明确处理频率差异时，美债定价叙事的置信度更高。",
    key_metrics: metrics,
    tables: [
      {
        title: "Latest Macro Conditions Signals",
        title_zh: "最新宏观确认信号 Latest Macro Conditions Signals",
        rows,
      },
    ],
    warnings: [
      "GDPNow is a nowcast, not realized GDP.",
      "NFCI/ANFCI are weekly financial-condition context and can overlap with equities, credit, and dollar inputs.",
      "Mixed-frequency data should not be forced into a same-day market conclusion.",
    ],
    warnings_zh: [
      "GDPNow 是增长 nowcast，不是已公布 GDP。",
      "NFCI/ANFCI 是周度金融条件背景，并且可能与股票、信用、美元等底层资产重叠。",
      "不同频率的数据不能强行拼成同一天的市场结论。",
    ],
    normalized_data: rows,
  };
}
