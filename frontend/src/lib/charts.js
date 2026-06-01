// Transforms each section's `normalized_data` payload into a recharts-friendly spec.
// Returns null when a section has no chartable series.

export const CHART_PALETTE = ["#4f46e5", "#0d9488", "#d97706", "#db2777", "#2563eb", "#7c3aed"];

function formatBillions(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  return `$${value.toFixed(1)}B`;
}

function formatTrillions(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toFixed(2)}T`;
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function sortByDate(rows) {
  return [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function singleSeries(section, label, color, divisor, formatter) {
  const nd = (section?.normalized_data ?? []).filter((r) => r?.date && r?.value != null);
  if (nd.length < 3) return null;
  const data = sortByDate(nd).map((r) => ({ date: r.date, [label]: r.value / divisor }));
  return { data, series: [{ key: label, label, color }], valueFormatter: formatter };
}

function pivotSeries(section, field, valueField, divisor, formatter, order) {
  const nd = (section?.normalized_data ?? []).filter((r) => r?.date && r?.[valueField] != null && r?.[field]);
  if (nd.length < 3) return null;
  const byDate = new Map();
  const names = new Set();
  for (const r of nd) {
    const name = String(r[field]);
    if (order && !order.includes(name)) continue;
    names.add(name);
    const bucket = byDate.get(r.date) ?? { date: r.date };
    bucket[name] = (bucket[name] ?? 0) + r[valueField] / divisor;
    byDate.set(r.date, bucket);
  }
  if (!names.size) return null;
  const ordered = order ? order.filter((n) => names.has(n)) : [...names];
  const series = ordered.map((name, i) => ({ key: name, label: name, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  const data = sortByDate([...byDate.values()]);
  return { data, series, valueFormatter: formatter };
}

export function buildChartSpec(sectionKey, section, lang) {
  if (!section) return null;
  const valueLabel = lang === "zh" ? "规模" : "Level";

  switch (sectionKey) {
    case "dealer-inventory":
    case "transactions":
    case "repo-financing":
      return singleSeries(section, valueLabel, CHART_PALETTE[0], 1000, formatBillions);
    case "fails":
      return singleSeries(section, lang === "zh" ? "Fails 合计" : "Fails", CHART_PALETTE[3], 1000, formatBillions);
    case "reference-rates":
      return pivotSeries(section, "rate_name", "rate_percent", 1, formatPercent, ["SOFR", "EFFR", "OBFR", "TGCR", "BGCR"]);
    case "soma":
      return pivotSeries(section, "category", "par_value", 1e12, formatTrillions, ["Treasury", "MBS"]);
    case "facility-usage":
      return pivotSeries(section, "facility", "accepted_amount", 1e9, formatBillions, ["ON RRP", "Repo / SRP"]);
    default:
      return null;
  }
}

export function hasChartData(sectionKey, section) {
  return buildChartSpec(sectionKey, section, "en") != null;
}

export function formatAxisDate(value) {
  const s = String(value);
  // ISO date -> YYYY/MM
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(0, 4)}/${s.slice(5, 7)}`;
  return s;
}
