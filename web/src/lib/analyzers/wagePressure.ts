import type { Section, Metric } from "@/lib/types";
import type { FredSeries } from "@/lib/sources/fred";

const SERIES_LABELS: Record<string, string> = {
  FRBATLWGT3MMAUMHWGO: "Wage Growth Tracker Overall",
  FRBATLWGT3MMAUMHWGJMJST: "Wage Growth Tracker Job Stayer",
  FRBATLWGT3MMAUMHWGJMJSW: "Wage Growth Tracker Job Switcher",
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

function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(digits)}%`;
}

function deltaText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} ppt`;
}

function wagePressureSignal(overall: number | null | undefined, stayer: number | null | undefined): string {
  const values = [overall, stayer].filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) return "Unavailable";
  const anchor = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (anchor >= 4.5) return "High";
  if (anchor >= 3.5) return "Elevated";
  if (anchor >= 2.75) return "Cooling";
  return "Normal";
}

function switcherPremium(switcher: number | null | undefined, stayer: number | null | undefined): number | null {
  if (switcher === null || switcher === undefined || stayer === null || stayer === undefined) return null;
  if (!Number.isFinite(switcher) || !Number.isFinite(stayer)) return null;
  return switcher - stayer;
}

export function computeWagePressure(series: FredSeries[]): Section {
  const byId = new Map(series.map((item) => [item.id, item]));
  const latestById = new Map(series.map((item) => [item.id, latest(item)]));
  const dataDate = [...latestById.values()]
    .map((item) => item?.date)
    .filter((date): date is string => Boolean(date))
    .sort()
    .reverse()[0] ?? null;

  const value = (id: string) => latestById.get(id)?.value ?? null;
  const priorValue = (id: string) => previous(byId.get(id) ?? { id, points: [] })?.value ?? null;
  const overall = value("FRBATLWGT3MMAUMHWGO");
  const stayer = value("FRBATLWGT3MMAUMHWGJMJST");
  const switcher = value("FRBATLWGT3MMAUMHWGJMJSW");
  const overallChange = overall !== null && priorValue("FRBATLWGT3MMAUMHWGO") !== null
    ? overall - (priorValue("FRBATLWGT3MMAUMHWGO") as number)
    : null;
  const premium = switcherPremium(switcher, stayer);
  const signal = wagePressureSignal(overall, stayer);

  const metrics: Metric[] = [
    { label: "Wage Pressure Signal", label_zh: "工资压力信号 Wage Pressure Signal", value: signal, unit: "" },
    { label: "Overall Wage Growth", label_zh: "整体工资增长 Overall Wage Growth", value: pct(overall, 1), unit: "" },
    { label: "Job Stayer Wage Growth", label_zh: "留岗者工资增长 Job Stayer", value: pct(stayer, 1), unit: "" },
    { label: "Job Switcher Wage Growth", label_zh: "跳槽者工资增长 Job Switcher", value: pct(switcher, 1), unit: "" },
    { label: "Monthly Change", label_zh: "月变化 Monthly Change", value: deltaText(overallChange), unit: "" },
    { label: "Switcher Premium", label_zh: "跳槽溢价 Switcher Premium", value: deltaText(premium), unit: "" },
  ];

  const rows = [...latestById.entries()].map(([id, point]) => ({
    series: id,
    label: SERIES_LABELS[id] ?? id,
    date: point?.date ?? null,
    value: point?.value ?? null,
    formatted_value: pct(point?.value, 1),
  }));

  return {
    title: "Wage Pressure",
    title_zh: "工资压力 Wage Pressure",
    mode: "live",
    freshness_status: dataDate ? "Fresh" : "Missing",
    data_date: dataDate,
    summary: `Wage Pressure Signal is ${signal}. Overall wage growth is ${pct(overall, 1)}, with job stayers at ${pct(stayer, 1)} and switchers at ${pct(switcher, 1)}.`,
    summary_zh: `Wage Pressure Signal 当前为 ${signal}。整体工资增长为 ${pct(overall, 1)}，留岗者为 ${pct(stayer, 1)}，跳槽者为 ${pct(switcher, 1)}。`,
    interpretation: "Wage Pressure tracks whether labor income growth is sticky enough to reinforce services inflation and a higher-for-longer policy path. It is monthly confirmation, not a live yield driver.",
    interpretation_zh: "工资压力模块用于判断劳动力收入增长是否仍有黏性、是否支撑服务通胀和 higher-for-longer 政策路径。它是月度确认层，不是实时收益率驱动。",
    why_it_matters: "Wage data strengthens the rates story only when it aligns with CPI/PCE, breakevens, and policy expectations; switcher wages alone can overstate broad pressure.",
    why_it_matters_zh: "工资数据只有与 CPI/PCE、breakeven 和政策预期同向时，才会增强利率叙事；单看跳槽者工资容易夸大全市场压力。",
    key_metrics: metrics,
    tables: [
      {
        title: "Latest Atlanta Fed Wage Growth Tracker Signals",
        title_zh: "最新 Atlanta Fed 工资增长信号 Latest Wage Growth Tracker Signals",
        rows,
      },
    ],
    warnings: [
      "The Atlanta Fed Wage Growth Tracker is monthly and smoothed, so it should not explain intraday Treasury moves.",
      "Switcher wage growth can reflect labor mix or switching premia; broad wage pressure needs confirmation from overall and stayer wages.",
    ],
    warnings_zh: [
      "Atlanta Fed Wage Growth Tracker 是月度、平滑后的数据，不应用来解释盘中美债波动。",
      "跳槽者工资增长可能反映 labor mix 或跳槽溢价；全市场工资压力需要整体工资和留岗者工资共同确认。",
    ],
    normalized_data: rows,
  };
}
