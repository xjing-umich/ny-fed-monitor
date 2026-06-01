import React from "react";
import Badge from "./Badge";
import MetricGrid from "./MetricGrid";
import DataTable from "./DataTable";
import SectionChart from "./SectionChart";
import { buildChartSpec } from "../lib/charts";
import {
  chartExpected,
  inferSectionMode,
  keyMetricLimit,
  sectionLabel,
  tablePreviewCount,
} from "../lib/dashboard";

function SectionSkeleton({ lang, t }) {
  return (
    <section className="section-shell">
      <div className="section-shell__header">
        <div>
          <p className="section-kicker">{lang === "zh" ? "模块加载中 Section Loading" : "Section Loading"}</p>
          <h2>{lang === "zh" ? "正在加载数据内容" : "Loading section"}</h2>
        </div>
      </div>
      <div className="section-card section-card--placeholder">
        <div className="loading-panel">
          <p className="loading-panel__title">
            {lang === "zh" ? "正在准备该模块的摘要、指标和图表…" : "Preparing the section summary, metrics, and charts..."}
          </p>
          <div className="loading-lines">
            <span className="loading-line loading-line--wide" />
            <span className="loading-line" />
            <span className="loading-line loading-line--short" />
          </div>
          <div className="metric-grid-clean">
            {[0, 1, 2].map((item) => (
              <article className="metric-tile metric-tile--skeleton" key={item}>
                <span className="loading-line loading-line--label" />
                <span className="loading-line loading-line--value" />
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function unavailableCopy(lang, sectionKey, mode) {
  if (sectionKey === "policy-expectations") {
    return {
      title:
        lang === "zh"
          ? "Policy Expectations 数据暂未就绪"
          : "Policy Expectations data is not ready yet",
      body:
        lang === "zh"
          ? "该模块依赖手动下载的 SME Excel/CSV 文件。上传或替换本地文件后刷新页面，即可显示调查型政策预期。"
          : "This module depends on a manually downloaded SME Excel/CSV file. Replace the local file and refresh to display survey-based policy expectations.",
    };
  }

  if (mode === "mock") {
    return {
      title:
        lang === "zh"
          ? "该模块尚未接入真实数据"
          : "This module is not connected to live data yet",
      body:
        lang === "zh"
          ? "当前页面保留该模块的位置与结构，待后续接入实时数据后再显示完整内容。"
          : "The section structure is in place, but the live data connection is still pending.",
    };
  }

  return {
    title:
      lang === "zh"
        ? "该模块数据当前不可用"
        : "This section is currently unavailable",
    body:
      lang === "zh"
        ? "数据源当前未返回可用结果，或该模块仍需进一步接线。你仍可以查看其他已接入模块。"
        : "The source did not return usable data, or the section still needs additional integration work. Other connected modules remain available.",
  };
}

export default function SectionPanel({ lang, t, section, sectionKey, loading, displayStatusValue, theme }) {
  if (loading) {
    return <SectionSkeleton lang={lang} t={t} />;
  }

  if (!section) {
    const fallback = unavailableCopy(lang, sectionKey, "unavailable");
    return (
      <section className="section-shell">
        <div className="section-shell__header">
          <div>
            <p className="section-kicker">{lang === "zh" ? "模块状态 Section Status" : "Section Status"}</p>
            <h2>{fallback.title}</h2>
          </div>
        </div>
        <div className="section-card">
          <div className="info-panel">
            <p className="info-panel__title">{fallback.title}</p>
            <p className="section-body">{fallback.body}</p>
          </div>
        </div>
      </section>
    );
  }

  const mode = inferSectionMode(section);
  const metrics = (section?.key_metrics ?? []).slice(0, keyMetricLimit(section?.key));
  const tables = section?.tables ?? [];
  const chartSpec = buildChartSpec(section?.key ?? sectionKey, section, lang);
  const shouldRenderChart = Boolean(chartSpec);
  const expectsChart = chartExpected(section?.key ?? sectionKey);
  const showChartWarning = !shouldRenderChart && expectsChart && section?.status === "available";
  const allMetricsUnavailable =
    metrics.length > 0 && metrics.every((metric) => String(metric?.value ?? "").includes("Unavailable"));
  const showInfoPanel =
    mode === "mock" ||
    mode === "unavailable" ||
    mode === "manual-missing" ||
    (allMetricsUnavailable && !tables.length && !shouldRenderChart);
  const friendlyUnavailable = unavailableCopy(lang, section?.key ?? sectionKey, mode);

  return (
    <section className="section-shell">
      <div className="section-shell__header">
        <div>
          <p className="section-kicker">{sectionLabel(lang, section)}</p>
          <h2>{sectionLabel(lang, section)}</h2>
        </div>
        <div className="section-shell__badges">
          <Badge value={mode}>{displayStatusValue(mode)}</Badge>
          <Badge value={section?.freshness_status}>{displayStatusValue(section?.freshness_status ?? "Unavailable")}</Badge>
        </div>
      </div>

      <p className="section-shell__summary">
        {lang === "zh" ? section?.summary_zh ?? section?.summary : section?.summary ?? section?.summary_zh}
      </p>

      <div className="section-shell__meta">
        <span><strong>{t.dataDate}:</strong> {section?.data_date ?? "--"}</span>
        <span><strong>{t.refreshedAt}:</strong> {section?.last_refreshed_at ?? "--"}</span>
        <span><strong>{t.frequency}:</strong> {section?.expected_update_frequency ?? "--"}</span>
        <span><strong>{t.mode}:</strong> {displayStatusValue(mode)}</span>
      </div>

      <div className="section-card">
        {showInfoPanel ? (
          <div className="info-panel">
            <p className="info-panel__title">{friendlyUnavailable.title}</p>
            <p className="section-body">{friendlyUnavailable.body}</p>
          </div>
        ) : (
          <>
            <div className="section-card__block">
              <h3>{t.keyMetrics}</h3>
              <MetricGrid lang={lang} metrics={metrics} displayStatusValue={displayStatusValue} />
            </div>

            {shouldRenderChart || showChartWarning ? (
              <div className="section-card__block">
                <h3>{t.chart}</h3>
                {shouldRenderChart ? (
                  <div className="chart-panel">
                    <SectionChart spec={chartSpec} theme={theme} />
                  </div>
                ) : (
                  <p className="chart-note">{t.chartUnavailable}</p>
                )}
              </div>
            ) : null}

            {(section?.interpretation || section?.interpretation_zh) ? (
              <div className="section-card__block">
                <h3>{t.interpretation}</h3>
                <p className="section-body">
                  {lang === "zh" ? section?.interpretation_zh ?? section?.interpretation : section?.interpretation ?? section?.interpretation_zh}
                </p>
              </div>
            ) : null}

            {(section?.why_it_matters || section?.why_it_matters_zh) ? (
              <div className="section-card__block">
                <h3>{t.whyItMatters}</h3>
                <p className="section-body">
                  {lang === "zh" ? section?.why_it_matters_zh ?? section?.why_it_matters : section?.why_it_matters ?? section?.why_it_matters_zh}
                </p>
              </div>
            ) : null}

            {(section?.data_note || section?.data_note_zh) ? (
              <div className="section-card__block">
                <h3>Data Note</h3>
                <p className="section-body">
                  {lang === "zh" ? section?.data_note_zh ?? section?.data_note : section?.data_note ?? section?.data_note_zh}
                </p>
              </div>
            ) : null}

            {section?.warnings?.length ? (
              <div className="section-card__block">
                <h3>{t.warnings}</h3>
                <ul className="warning-list">
                  {section.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {tables.length ? (
              <div className="section-card__block">
                <h3>Details</h3>
                {tables.map((table, index) => (
                  <DataTable
                    key={`${table.title}-${index}`}
                    table={table}
                    lang={lang}
                    showFullLabel={t.details}
                    emptyLabel={t.noData}
                    previewCount={tablePreviewCount(table.title)}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
