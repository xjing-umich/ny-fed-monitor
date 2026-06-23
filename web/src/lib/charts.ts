import type { Section } from "@/lib/types";

export const CHART_PALETTE = ["#4f46e5", "#0d9488", "#d97706", "#db2777", "#2563eb", "#7c3aed"];

// `format` is a serializable token (not a function) so a ChartSpec can be passed
// from a Server Component to a Client Component. The client reconstructs the
// formatter via getFormatter().
export type ChartFormat = "billions" | "trillions" | "percent";

export type ChartSpec = {
  data: Record<string, unknown>[];
  series: { key: string; label: string; color: string }[];
  format: ChartFormat;
};

function formatBillions(value: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  return `$${value.toFixed(1)}B`;
}

function formatTrillions(value: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toFixed(2)}T`;
}

function formatPercent(value: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

export function getFormatter(format: ChartFormat): (v: number) => string {
  switch (format) {
    case "trillions": return formatTrillions;
    case "percent": return formatPercent;
    case "billions":
    default: return formatBillions;
  }
}

function sortByDate(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function singleSeries(
  section: Section | null | undefined,
  label: string,
  color: string,
  divisor: number,
  format: ChartFormat,
): ChartSpec | null {
  const nd = (section?.normalized_data ?? []).filter(
    (r) => r?.date && r?.value != null,
  ) as Record<string, unknown>[];
  if (nd.length < 3) return null;
  const data = sortByDate(nd).map((r) => ({ date: r.date, [label]: (r.value as number) / divisor }));
  return { data, series: [{ key: label, label, color }], format };
}

export function pivotSeries(
  section: Section | null | undefined,
  field: string,
  valueField: string,
  divisor: number,
  format: ChartFormat,
  order?: string[],
): ChartSpec | null {
  const nd = (section?.normalized_data ?? []).filter(
    (r) => r?.date && r?.[valueField] != null && r?.[field],
  ) as Record<string, unknown>[];
  if (nd.length < 3) return null;

  const byDate = new Map<unknown, Record<string, unknown>>();
  const names = new Set<string>();

  for (const r of nd) {
    const name = String(r[field]);
    if (order && !order.includes(name)) continue;
    names.add(name);
    const bucket = byDate.get(r.date) ?? { date: r.date };
    bucket[name] = ((bucket[name] as number) ?? 0) + (r[valueField] as number) / divisor;
    byDate.set(r.date, bucket);
  }

  if (!names.size) return null;
  const ordered = order ? order.filter((n) => names.has(n)) : [...names];
  const series = ordered.map((name, i) => ({
    key: name,
    label: name,
    color: CHART_PALETTE[i % CHART_PALETTE.length],
  }));
  const data = sortByDate([...byDate.values()]);
  return { data, series, format };
}

export function buildChartSpec(
  sectionKey: string,
  section: Section | null | undefined,
  lang: string,
): ChartSpec | null {
  if (!section) return null;
  const valueLabel = lang === "zh" ? "规模" : "Level";

  switch (sectionKey) {
    case "dealer-inventory":
    case "transactions":
    case "repo-financing":
      return singleSeries(section, valueLabel, CHART_PALETTE[0], 1000, "billions");
    case "fails":
      return singleSeries(
        section,
        lang === "zh" ? "Fails 合计" : "Fails",
        CHART_PALETTE[3],
        1000,
        "billions",
      );
    case "reference-rates":
      return pivotSeries(section, "rate_name", "rate_percent", 1, "percent", [
        "SOFR",
        "EFFR",
        "OBFR",
        "TGCR",
        "BGCR",
      ]);
    case "soma":
      return pivotSeries(section, "category", "par_value", 1e12, "trillions", ["Treasury", "MBS"]);
    case "facility-usage":
      return pivotSeries(section, "facility", "accepted_amount", 1e9, "billions", ["ON RRP", "Repo / SRP"]);
    default:
      return null;
  }
}

export function hasChartData(sectionKey: string, section: Section | null | undefined): boolean {
  return buildChartSpec(sectionKey, section, "en") != null;
}

export function formatAxisDate(value: unknown): string {
  const s = String(value);
  // ISO date -> YYYY/MM
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(0, 4)}/${s.slice(5, 7)}`;
  return s;
}
