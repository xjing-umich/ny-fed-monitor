// web/src/components/investor/WeightBar.tsx
import React from "react";

// 组合权重横条(RSC, 纯 CSS): 宽度=权重%, 无装饰、无 JS。真数据即图形。
// weight 为小数(0.084=8.4%)。缺失/<=0 → 条为空, 百分数显 "—"。
export function WeightBar({
  weight,
  tone = "accent",
}: {
  weight: number | null;
  tone?: "accent" | "muted";
}): React.ReactElement {
  const has = weight != null && weight > 0;
  const pct = has ? Math.min(100, weight * 100) : 0;
  const color = tone === "accent" ? "var(--tt-accent)" : "var(--tt-muted)";
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span
        aria-hidden
        className="relative hidden h-1.5 w-16 overflow-hidden rounded-full bg-[var(--tt-border)] sm:block"
      >
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="font-mono text-xs tabular-nums text-[var(--tt-muted)]">
        {has ? `${pct.toFixed(1)}%` : "—"}
      </span>
    </span>
  );
}
