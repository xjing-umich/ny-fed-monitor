import React from "react";

// 纯内联 SVG sparkline（服务端组件友好，零 hydration）：
// X=序号(升序)，Y=按序列自己的 [min,max] 归一化。全平序列 → 一条水平线。
// 仅画形状、aria-hidden —— 语义/数字由调用方的真文字承载（GEO/爬虫抓真数）。
export function Sparkline({
  series,
  color,
  width = 120,
  height = 28,
}: {
  series: readonly number[];
  color: string;
  width?: number;
  height?: number;
}): React.ReactElement {
  const PAD = 2;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1; // 全平序列 → 画一条水平线
  const step = series.length > 1 ? (width - PAD * 2) / (series.length - 1) : 0;
  const points = series
    .map((v, i) => {
      const x = PAD + i * step;
      const y = height - PAD - ((v - min) / span) * (height - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
