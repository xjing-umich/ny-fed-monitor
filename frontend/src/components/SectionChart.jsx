import React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAxisDate } from "../lib/charts";

function themeColors(theme) {
  return theme === "dark"
    ? { grid: "#243049", axis: "#6b7890", text: "#97a3b8" }
    : { grid: "#e6eaf1", axis: "#8a96a8", text: "#5b677c" };
}

function ChartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__date">{formatAxisDate(label)}</p>
      {payload.map((entry) => (
        <div className="chart-tooltip__row" key={entry.dataKey}>
          <span className="chart-tooltip__swatch" style={{ background: entry.color }} />
          <span>{entry.name}: </span>
          <strong>{valueFormatter(entry.value)}</strong>
        </div>
      ))}
    </div>
  );
}

export default function SectionChart({ spec, theme }) {
  if (!spec) return null;
  const c = themeColors(theme);
  const { data, series, valueFormatter } = spec;
  const showLegend = series.length > 1;

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            minTickGap={48}
            tick={{ fontSize: 11, fill: c.text }}
            stroke={c.axis}
            tickLine={false}
          />
          <YAxis
            tickFormatter={valueFormatter}
            tick={{ fontSize: 11, fill: c.text }}
            stroke={c.axis}
            tickLine={false}
            width={64}
          />
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} />
          {showLegend ? <Legend wrapperStyle={{ fontSize: 12, color: c.text }} /> : null}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
