import React from "react";
import { metricLabel } from "../lib/dashboard";

export default function MetricGrid({ lang, metrics, displayStatusValue }) {
  return (
    <div className="metric-grid-clean">
      {metrics.map((metric) => (
        <article className="metric-tile" key={metric.label}>
          <p className="metric-tile__label">{metricLabel(lang, metric)}</p>
          <strong className="metric-tile__value">{displayStatusValue(metric.value)}</strong>
          {metric.unit ? <span className="metric-tile__unit">{metric.unit}</span> : null}
        </article>
      ))}
    </div>
  );
}
