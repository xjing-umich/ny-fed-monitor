"use client";

import React from "react";
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

function finiteValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

function linePath(
  data: Record<string, unknown>[],
  key: string,
  xForIndex: (index: number) => number,
  yForValue: (value: number) => number,
): string {
  let path = "";
  let open = false;

  data.forEach((row, index) => {
    const value = finiteValue(row[key]);
    if (value === null) {
      open = false;
      return;
    }
    const command = open ? "L" : "M";
    path += `${command}${xForIndex(index).toFixed(2)},${yForValue(value).toFixed(2)} `;
    open = true;
  });

  return path.trim();
}

export default function SectionChart({ spec }: { spec: ChartSpec }) {
  const { resolvedTheme } = useTheme();
  const t = themeTokens(resolvedTheme);
  const { data, series, format } = spec;
  const valueFormatter = getFormatter(format);
  const showLegend = series.length > 1;
  const width = 960;
  const height = 300;
  const margin = { top: 14, right: 18, bottom: 34, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  // Apply TT palette to series
  const themedSeries = series.map((s, i) => ({
    ...s,
    color: t.palette[i % t.palette.length],
  }));

  const values = data.flatMap((row) =>
    themedSeries
      .map((item) => finiteValue(row[item.key]))
      .filter((value): value is number => value !== null),
  );

  if (!data.length || !values.length) {
    return (
      <div style={{ minHeight: 220, display: "grid", placeItems: "center", color: t.text, fontSize: 13 }}>
        No chart data
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = min === max ? Math.max(Math.abs(max) * 0.05, 1) : (max - min) * 0.08;
  const yMin = min - padding;
  const yMax = max + padding;
  const yTicks = niceTicks(yMin, yMax, 5);
  const xTickIndexes = Array.from(new Set([
    0,
    Math.floor((data.length - 1) / 3),
    Math.floor(((data.length - 1) * 2) / 3),
    data.length - 1,
  ].filter((index) => index >= 0 && index < data.length)));
  const xForIndex = (index: number) => margin.left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
  const yForValue = (value: number) => margin.top + ((yMax - value) / (yMax - yMin || 1)) * plotHeight;

  return (
    <div style={{ width: "100%", minHeight: height }}>
      <svg
        role="img"
        aria-label="Time series chart"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", width: "100%", height }}
      >
        <rect x={0} y={0} width={width} height={height} fill="transparent" />
        {yTicks.map((tick) => {
          const y = yForValue(tick);
          return (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} stroke={t.grid} strokeWidth={1} />
              <text
                x={margin.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill={t.text}
                fontFamily="var(--font-geist-mono), ui-monospace, monospace"
              >
                {valueFormatter(tick)}
              </text>
            </g>
          );
        })}
        <line x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} stroke={t.axis} />
        {xTickIndexes.map((index) => (
          <text
            key={index}
            x={xForIndex(index)}
            y={height - 10}
            textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
            fontSize={11}
            fill={t.text}
            fontFamily="var(--font-geist-mono), ui-monospace, monospace"
          >
            {formatAxisDate(data[index]?.date)}
          </text>
        ))}
        {themedSeries.map((item) => (
          <path
            key={item.key}
            d={linePath(data, item.key, xForIndex, yForValue)}
            fill="none"
            stroke={item.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {themedSeries.map((item) => {
          const lastIndex = [...data].map((row, index) => ({ row, index })).reverse().find(({ row }) => finiteValue(row[item.key]) !== null)?.index;
          if (lastIndex === undefined) return null;
          const value = finiteValue(data[lastIndex]?.[item.key]);
          if (value === null) return null;
          return <circle key={`${item.key}-last`} cx={xForIndex(lastIndex)} cy={yForValue(value)} r={3} fill={item.color} />;
        })}
      </svg>
      {showLegend && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", marginTop: 8 }}>
          {themedSeries.map((item) => (
            <span
              key={item.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: t.text,
                fontSize: 11,
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
