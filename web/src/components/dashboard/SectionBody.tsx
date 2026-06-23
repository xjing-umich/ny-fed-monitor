/**
 * SectionBody — renders the data-viz body of a Section (metrics strip, chart,
 * interpretation, why-it-matters, warnings, tables, and the special
 * data-freshness live report).
 *
 * Extracted from [section]/page.tsx so both the legacy section page and the
 * new macro/[indicator] entity page can reuse the same rendering logic without
 * copy-paste.
 */

import React from "react";
import { buildChartSpec } from "@/lib/charts";
import { stripEnglishSuffix } from "@/lib/dashboard";
import {
  keyMetricLimit,
  tablePreviewCount,
  metricLabel,
  displayStatusValue,
  inferSectionMode,
  chartExpected,
  badgeTone,
} from "@/lib/dashboard";
import { trendDirection } from "@/lib/format";
import SectionChartClient from "@/components/dashboard/SectionChartClient";
import DataFreshnessReport from "@/components/dashboard/DataFreshnessReport";
import type { Section, Metric, TableT } from "@/lib/types";

type Lang = "zh" | "en";

// ── Column header translation ─────────────────────────────────────────────────

const COLUMN_LABELS_ZH: Record<string, string> = {
  auction_date: "拍卖日期", auctionDate: "拍卖日期",
  security_type: "证券类型", securityType: "证券类型",
  term: "期限", offering_amount: "发行规模", offeringAmount: "发行规模",
  issue_date: "发行日期", issueDate: "发行日期",
  bid_to_cover: "投标倍数", bidToCover: "投标倍数",
  primary_dealer_share: "主要交易商份额", primaryDealerShare: "主要交易商份额",
  indirect_bidder_share: "间接投标人份额", indirectBidderShare: "间接投标人份额",
  date: "日期", facility: "工具", operation_type: "操作类型",
  accepted_amount: "接受金额", submitted_amount: "提交金额",
  rate: "利率", counterparty_count: "交易对手数量", maturity_date: "到期日",
  description: "描述", rate_name: "利率名称", rate_percent: "利率 (%)",
  volume: "成交量", metric: "指标", source: "来源", latest_date: "最新日期",
  formatted_value: "格式化数值", status: "状态", value: "数值",
  category: "类别", par_value: "面值", label: "标签",
  security: "证券", sector: "板块", trade_channel: "交易渠道",
  frequency: "频率", period_or_release_date: "期间 / 发布日期",
  daily_avg_volume_millions: "日均成交量 (百万)",
};

function translateHeader(key: string, lang: Lang): string {
  if (lang === "zh") return COLUMN_LABELS_ZH[key] ?? key;
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const TONE_COLOR: Record<string, string> = {
  red:    "var(--tt-negative)",
  orange: "var(--tt-warn)",
  yellow: "var(--tt-warn)",
  green:  "var(--tt-positive)",
  gray:   "var(--tt-faint)",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function ModePill({ value, lang }: { value: string; lang: Lang }) {
  const tone = badgeTone(value);
  const color = TONE_COLOR[tone] ?? TONE_COLOR.gray;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        border: `1px solid ${color}`,
        fontSize: 10,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color,
      }}
    >
      {displayStatusValue(lang, value)}
    </span>
  );
}

function KpiTile({ metric, lang }: { metric: Metric; lang: Lang }) {
  const dir = trendDirection(metric.value);
  const label = metricLabel(lang, metric) ?? metric.label;
  return (
    <div
      style={{
        background: "var(--tt-panel)",
        border: "1px solid var(--tt-border)",
        borderRadius: 6,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--tt-muted)",
          marginBottom: 8,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 20,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: "var(--tt-text)",
          lineHeight: 1.2,
          display: "flex",
          alignItems: "baseline",
          gap: 4,
        }}
      >
        {dir === "up" && (
          <span style={{ color: "var(--tt-positive)", fontSize: 14 }}>▲</span>
        )}
        {dir === "down" && (
          <span style={{ color: "var(--tt-negative)", fontSize: 14 }}>▼</span>
        )}
        <span>{metric.value}</span>
        {metric.unit && (
          <span style={{ fontSize: 12, color: "var(--tt-muted)", fontWeight: 400 }}>
            {metric.unit}
          </span>
        )}
      </div>
    </div>
  );
}

function DenseTable({ table, lang }: { table: TableT; lang: Lang }) {
  const rows = table.rows ?? [];
  const title =
    lang === "zh" && table.title_zh
      ? stripEnglishSuffix(table.title_zh, table.title)
      : (table.title ?? table.title_zh);
  const previewCount = tablePreviewCount(table.title);
  const previewRows = rows.slice(0, previewCount);
  const overflowRows = rows.slice(previewCount);
  const hasOverflow = overflowRows.length > 0;

  if (!rows.length) {
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--tt-faint)", marginBottom: 8 }}>
          {title}
        </div>
        <p style={{ fontSize: 13, color: "var(--tt-muted)" }}>
          {lang === "zh" ? "暂无数据" : "No data available"}
        </p>
      </div>
    );
  }

  const columns = Object.keys(rows[0]);

  const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
  const thStyle: React.CSSProperties = {
    padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--tt-faint)",
    borderBottom: "1px solid var(--tt-border)", whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "5px 10px", fontSize: 12, color: "var(--tt-text)",
    fontVariantNumeric: "tabular-nums",
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    borderBottom: "1px solid var(--tt-border)", whiteSpace: "nowrap",
  };

  function TableRows({ r }: { r: Record<string, unknown>[] }) {
    return (
      <tbody>
        {r.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "color-mix(in srgb, var(--tt-panel-2) 50%, transparent)" }}>
            {columns.map((col) => (
              <td key={col} style={tdStyle}>{String(row[col] ?? "—")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--tt-faint)", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ overflowX: "auto", border: "1px solid var(--tt-border)", borderRadius: 6 }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ background: "var(--tt-panel-2)" }}>
              {columns.map((col) => <th key={col} style={thStyle}>{translateHeader(col, lang)}</th>)}
            </tr>
          </thead>
          <TableRows r={previewRows} />
        </table>
      </div>
      {hasOverflow && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--tt-accent)", padding: "4px 0", userSelect: "none" }}>
            {lang === "zh"
              ? `显示全部（还有 ${overflowRows.length} 行）`
              : `Show all (${overflowRows.length} more rows)`}
          </summary>
          <div style={{ overflowX: "auto", border: "1px solid var(--tt-border)", borderRadius: 6, marginTop: 4 }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ background: "var(--tt-panel-2)" }}>
                  {columns.map((col) => <th key={col} style={thStyle}>{translateHeader(col, lang)}</th>)}
                </tr>
              </thead>
              <TableRows r={rows} />
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function SectionBlock({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--tt-faint)", marginBottom: 12 }}>
        {heading}
      </div>
      {children}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export type SectionBodyProps = {
  sectionKey: string;
  section: Section;
  lang: Lang;
  /** When true, suppresses the status pills and section title header (used inside EntityPage which has its own header). */
  headless?: boolean;
  /** When true, suppresses the KPI strip because the surrounding page already renders key facts. */
  hideMetricStrip?: boolean;
};

export function SectionBody({
  sectionKey,
  section,
  lang,
  headless = false,
  hideMetricStrip = false,
}: SectionBodyProps): React.ReactElement {
  const mode = inferSectionMode(section);
  const metrics = (section.key_metrics ?? []).slice(0, keyMetricLimit(sectionKey));
  const tables = section.tables ?? [];
  const warnings = lang === "zh" ? (section.warnings_zh ?? section.warnings ?? []) : (section.warnings ?? []);
  const chartSpec = buildChartSpec(sectionKey, section, lang);
  const hasChart = Boolean(chartSpec);
  const expectsChart = chartExpected(sectionKey);

  const interpretation = lang === "zh"
    ? (section.interpretation_zh ?? section.interpretation)
    : (section.interpretation ?? section.interpretation_zh);
  const whyItMatters = lang === "zh"
    ? (section.why_it_matters_zh ?? section.why_it_matters)
    : (section.why_it_matters ?? section.why_it_matters_zh);

  const isUnavailable = mode === "mock" || mode === "unavailable" || mode === "manual-missing";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Status pills (shown only in non-headless mode) */}
      {!headless && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <ModePill value={mode} lang={lang} />
          {section.freshness_status && section.freshness_status !== mode && (
            <ModePill value={section.freshness_status} lang={lang} />
          )}
          {section.data_date && (
            <span style={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              fontSize: 11, color: "var(--tt-faint)", textTransform: "uppercase",
              letterSpacing: "0.06em", fontVariantNumeric: "tabular-nums",
            }}>
              DATA {section.data_date}
            </span>
          )}
        </div>
      )}

      {/* Unavailable */}
      {isUnavailable && (
        <div style={{ background: "var(--tt-panel)", border: "1px solid var(--tt-border)", borderRadius: 6, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--tt-text)", marginBottom: 4 }}>
            {lang === "zh" ? "数据当前不可用" : "Data currently unavailable"}
          </p>
          <p style={{ fontSize: 13, color: "var(--tt-muted)" }}>
            {lang === "zh"
              ? "该模块数据源暂未就绪或仍在接入中。"
              : "This module's data source is not yet connected or is pending integration."}
          </p>
        </div>
      )}

      {/* KPI strip */}
      {!isUnavailable && !hideMetricStrip && metrics.length > 0 && (
        <SectionBlock heading={lang === "zh" ? "核心指标" : "Key Metrics"}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {metrics.map((metric) => (
              <KpiTile key={metric.label} metric={metric} lang={lang} />
            ))}
          </div>
        </SectionBlock>
      )}

      {/* Chart */}
      {!isUnavailable && (hasChart || expectsChart) && (
        <SectionBlock heading={lang === "zh" ? "图表" : "Chart"}>
          <div style={{ background: "var(--tt-panel)", border: "1px solid var(--tt-border)", borderRadius: 6, padding: 16 }}>
            {hasChart && chartSpec ? (
              <SectionChartClient spec={chartSpec} />
            ) : (
              <p style={{ fontSize: 13, color: "var(--tt-muted)", fontStyle: "italic" }}>
                {lang === "zh" ? "图表暂不可用" : "Chart unavailable"}
              </p>
            )}
          </div>
        </SectionBlock>
      )}

      {/* Interpretation */}
      {!isUnavailable && interpretation && (
        <SectionBlock heading={lang === "zh" ? "解读" : "Interpretation"}>
          <div style={{ background: "var(--tt-panel)", border: "1px solid var(--tt-border)", borderRadius: 6, padding: "14px 16px" }}>
            <p style={{ fontSize: 13, color: "var(--tt-text)", lineHeight: 1.7, margin: 0 }}>{interpretation}</p>
          </div>
        </SectionBlock>
      )}

      {/* Why it matters */}
      {!isUnavailable && whyItMatters && (
        <SectionBlock heading={lang === "zh" ? "为什么重要" : "Why It Matters"}>
          <div style={{ background: "var(--tt-panel)", border: "1px solid var(--tt-border)", borderRadius: 6, padding: "14px 16px" }}>
            <p style={{ fontSize: 13, color: "var(--tt-muted)", lineHeight: 1.7, margin: 0 }}>{whyItMatters}</p>
          </div>
        </SectionBlock>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <SectionBlock heading={lang === "zh" ? "提示" : "Warnings"}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {warnings.map((w, i) => (
              <li key={i} style={{
                fontSize: 12, color: "var(--tt-warn)",
                background: "color-mix(in srgb, var(--tt-warn) 8%, var(--tt-panel))",
                border: "1px solid color-mix(in srgb, var(--tt-warn) 20%, transparent)",
                borderRadius: 4, padding: "6px 10px",
              }}>
                {w}
              </li>
            ))}
          </ul>
        </SectionBlock>
      )}

      {/* Tables */}
      {tables.length > 0 && (
        <SectionBlock heading={lang === "zh" ? "数据表" : "Data Tables"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {tables.map((table, i) => (
              <DenseTable key={`${table.title}-${i}`} table={table} lang={lang} />
            ))}
          </div>
        </SectionBlock>
      )}

      {/* Special: data-freshness live report */}
      {sectionKey === "data-freshness" && (
        <SectionBlock heading={lang === "zh" ? "实时数据库状态" : "Live Database Status"}>
          <DataFreshnessReport lang={lang} />
        </SectionBlock>
      )}
    </div>
  );
}
