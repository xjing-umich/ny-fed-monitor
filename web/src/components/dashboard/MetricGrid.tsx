import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { Metric } from "@/lib/types";
import { metricLabel } from "@/lib/dashboard";
import { trendDirection } from "@/lib/format";

type Lang = "zh" | "en";

function TrendArrow({ value }: { value: string | undefined }) {
  const dir = trendDirection(value);
  if (dir === "up") return <span className="ml-1 text-emerald-500 font-bold">▲</span>;
  if (dir === "down") return <span className="ml-1 text-red-500 font-bold">▼</span>;
  return null;
}

export default function MetricGrid({
  lang,
  metrics,
}: {
  lang: Lang;
  metrics: Metric[];
}) {
  if (!metrics.length) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {metrics.map((metric) => (
        <Card key={metric.label} className="border border-border shadow-sm">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1 leading-snug">
              {metricLabel(lang, metric)}
            </p>
            <p className="tnum text-sm font-semibold text-card-foreground">
              {metric.value}
              <TrendArrow value={metric.value} />
            </p>
            {metric.unit && (
              <span className="text-xs text-muted-foreground">{metric.unit}</span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
