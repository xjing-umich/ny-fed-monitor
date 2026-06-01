import React, { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import MetricGrid from "./MetricGrid";
import DataTable from "./DataTable";
import type { Section } from "@/lib/types";
import { i18n } from "@/lib/i18n";
import {
  badgeTone,
  displayStatusValue,
  inferSectionMode,
  keyMetricLimit,
  sectionLabel,
  chartExpected,
} from "@/lib/dashboard";
import { buildChartSpec } from "@/lib/charts";

// SectionChart is client-only — import dynamically to avoid SSR issues
// We use a server-safe wrapper that conditionally renders a client boundary
import SectionChartClient from "./SectionChartClient";

type Lang = "zh" | "en";

const TONE_BADGE: Record<string, string> = {
  red:    "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
  orange: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300",
  green:  "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300",
  gray:   "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
};

function ModeBadge({ lang, value }: { lang: Lang; value: string }) {
  const tone = badgeTone(value);
  const cls = TONE_BADGE[tone] ?? TONE_BADGE.gray;
  return (
    <Badge className={`text-[10px] px-1.5 py-0 font-normal border ${cls}`}>
      {displayStatusValue(lang, value)}
    </Badge>
  );
}

function UnavailablePanel({ lang, sectionKey, mode }: { lang: Lang; sectionKey: string; mode: string }) {
  const t = i18n[lang];
  let title: string;
  let body: string;

  if (sectionKey === "policy-expectations") {
    title = lang === "zh"
      ? "Policy Expectations 数据暂未就绪"
      : "Policy Expectations data is not ready yet";
    body = lang === "zh"
      ? "该模块依赖手动下载的 SME Excel/CSV 文件。上传或替换本地文件后刷新页面即可显示。"
      : "This module depends on a manually downloaded SME Excel/CSV file. Replace the local file and refresh to display.";
  } else if (mode === "mock") {
    title = lang === "zh" ? "该模块尚未接入真实数据" : "This module is not connected to live data yet";
    body = lang === "zh"
      ? "当前页面保留该模块的位置与结构，待后续接入实时数据后再显示完整内容。"
      : "The section structure is in place, but the live data connection is still pending.";
  } else {
    title = lang === "zh" ? "该模块数据当前不可用" : "This section is currently unavailable";
    body = lang === "zh"
      ? "数据源当前未返回可用结果，或该模块仍需进一步接线。其他已接入模块仍可正常查看。"
      : "The source did not return usable data, or the section still needs additional integration work. Other connected modules remain available.";
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <p className="font-semibold text-sm text-card-foreground mb-1">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default function SectionPanel({
  lang,
  section,
  sectionKey,
}: {
  lang: Lang;
  section: Section | undefined;
  sectionKey: string;
}) {
  const t = i18n[lang];

  if (!section) {
    return (
      <div className="flex-1 min-w-0">
        <UnavailablePanel lang={lang} sectionKey={sectionKey} mode="unavailable" />
      </div>
    );
  }

  const mode = inferSectionMode(section);
  const metrics = (section.key_metrics ?? []).slice(0, keyMetricLimit(sectionKey));
  const tables = section.tables ?? [];
  const chartSpec = buildChartSpec(sectionKey, section, lang);
  const hasChart = Boolean(chartSpec);
  const expectsChart = chartExpected(sectionKey);
  const allUnavailable =
    metrics.length > 0 &&
    metrics.every((m) => String(m.value ?? "").includes("Unavailable"));
  const showInfoPanel =
    mode === "mock" ||
    mode === "unavailable" ||
    mode === "manual-missing" ||
    (allUnavailable && !tables.length && !hasChart);

  const summary = lang === "zh"
    ? (section.summary_zh ?? section.summary)
    : (section.summary ?? section.summary_zh);
  const interpretation = lang === "zh"
    ? (section.interpretation_zh ?? section.interpretation)
    : (section.interpretation ?? section.interpretation_zh);
  const whyItMatters = lang === "zh"
    ? (section.why_it_matters_zh ?? section.why_it_matters)
    : (section.why_it_matters ?? section.why_it_matters_zh);

  return (
    <div className="flex-1 min-w-0 space-y-4">
      {/* Section header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
            {sectionLabel(lang, section)}
          </p>
          <h2 className="text-xl font-bold text-card-foreground">
            {sectionLabel(lang, section)}
          </h2>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <ModeBadge lang={lang} value={mode} />
          {section.freshness_status && (
            <ModeBadge lang={lang} value={section.freshness_status} />
          )}
        </div>
      </div>

      {/* Summary text */}
      {summary && (
        <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {section.data_date && (
          <span><span className="font-medium">{t.dataDate}:</span> {section.data_date}</span>
        )}
        <span><span className="font-medium">{t.mode}:</span> {displayStatusValue(lang, mode)}</span>
      </div>

      {/* Main content card */}
      <Card className="border border-border shadow-sm">
        <CardContent className="p-4 space-y-5">
          {showInfoPanel ? (
            <UnavailablePanel lang={lang} sectionKey={sectionKey} mode={mode} />
          ) : (
            <>
              {/* Key metrics */}
              {metrics.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {t.keyMetrics}
                  </h3>
                  <MetricGrid lang={lang} metrics={metrics} />
                </div>
              )}

              {/* Chart */}
              {(hasChart || (!hasChart && expectsChart)) && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      {t.chart}
                    </h3>
                    {hasChart && chartSpec ? (
                      <SectionChartClient spec={chartSpec} />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">{t.chartUnavailable}</p>
                    )}
                  </div>
                </>
              )}

              {/* Interpretation */}
              {interpretation && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {t.interpretation}
                    </h3>
                    <p className="text-sm text-card-foreground leading-relaxed">{interpretation}</p>
                  </div>
                </>
              )}

              {/* Why it matters */}
              {whyItMatters && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {t.whyItMatters}
                    </h3>
                    <p className="text-sm text-card-foreground leading-relaxed">{whyItMatters}</p>
                  </div>
                </>
              )}

              {/* Warnings */}
              {section.warnings && section.warnings.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {t.warnings}
                    </h3>
                    <ul className="space-y-1">
                      {section.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Tables */}
              {tables.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-5">
                    {tables.map((table, i) => (
                      <DataTable
                        key={`${table.title}-${i}`}
                        table={table}
                        lang={lang}
                        showFullLabel={t.details}
                        emptyLabel={t.noData}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
