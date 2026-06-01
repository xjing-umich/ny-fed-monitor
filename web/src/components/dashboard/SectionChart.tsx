"use client";

import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "next-themes";
import type { ChartSpec } from "@/lib/charts";
import { formatAxisDate, getFormatter } from "@/lib/charts";

// Treasury Terminal chart palette
const TT_PALETTE_DARK = ["#6E8BFF", "#3DB8A0", "#D9A642", "#F0616D", "#8A93A6"];
const TT_PALETTE_LIGHT = ["#3E5BD9", "#0F8E7B", "#9A6700", "#CF222E", "#5A6172"];

function themeTokens(theme: string | undefined) {
  const dark = theme !== "light";
  return {
    bg:      dark ? "#11151F" : "#FFFFFF",
    border:  dark ? "#1C2230" : "#E6E9EF",
    grid:    dark ? "#1C2230" : "#E6E9EF",
    axis:    dark ? "#2A3140" : "#D4D9E2",
    text:    dark ? "#5A6172" : "#8A93A6",
    tooltip: dark ? "#0F131C" : "#F4F6F9",
    palette: dark ? TT_PALETTE_DARK : TT_PALETTE_LIGHT,
  };
}

function TooltipContent({
  active,
  payload,
  label,
  valueFormatter,
  t,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; color: string; name: string; value: number }>;
  label?: unknown;
  valueFormatter: (v: number) => string;
  t: ReturnType<typeof themeTokens>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: t.tooltip,
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <p
        style={{
          marginBottom: 4,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 11,
          color: t.text,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatAxisDate(label)}
      </p>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: entry.color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              fontVariantNumeric: "tabular-nums",
              color: "#E6E9EF",
              fontSize: 12,
            }}
          >
            {entry.name}: <strong>{valueFormatter(entry.value)}</strong>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SectionChart({ spec }: { spec: ChartSpec }) {
  const { resolvedTheme } = useTheme();
  const t = themeTokens(resolvedTheme);
  const { data, series, format } = spec;
  const valueFormatter = getFormatter(format);
  const showLegend = series.length > 1;

  // Apply TT palette to series
  const themedSeries = series.map((s, i) => ({
    ...s,
    color: t.palette[i % t.palette.length],
  }));

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid
            stroke={t.grid}
            strokeDasharray="none"
            vertical={false}
            strokeWidth={1}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            minTickGap={48}
            tick={{ fontSize: 11, fill: t.text }}
            stroke={t.axis}
            tickLine={false}
            axisLine={{ stroke: t.axis }}
          />
          <YAxis
            tickFormatter={valueFormatter}
            tick={{ fontSize: 11, fill: t.text }}
            stroke={t.axis}
            tickLine={false}
            axisLine={false}
            width={68}
          />
          <Tooltip
            content={
              <TooltipContent valueFormatter={valueFormatter} t={t} />
            }
          />
          {showLegend && (
            <Legend
              wrapperStyle={{
                fontSize: 11,
                color: t.text,
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              }}
            />
          )}
          {themedSeries.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: s.color }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
