"use client";

import { useEffect, useMemo, useState } from "react";

type Lang = "zh" | "en";

type SourceInfo = {
  name?: string;
  provider?: string;
  official_url?: string | null;
};

type FreshnessRow = {
  id: number;
  source_id: number;
  latest_observation_date: string | null;
  last_successful_fetch: string | null;
  freshness_status: string;
  days_since_latest: number | null;
  expected_frequency: string | null;
  checked_at: string;
  warning: string | null;
  source: SourceInfo | null;
};

type FreshnessReport = {
  data_status_summary: {
    total_modules: number;
    fresh: number;
    stale: number;
    failed: number;
    manual_required: number;
    unknown: number;
    partial: number;
    empty: number;
  };
  fresh_modules: FreshnessRow[];
  stale_modules: FreshnessRow[];
  failed_modules: FreshnessRow[];
  partial_modules: FreshnessRow[];
  empty_modules: FreshnessRow[];
  manual_required_modules: FreshnessRow[];
  unknown_modules: FreshnessRow[];
  safe_to_analyze: boolean;
  warnings: string[];
};

type LabelSet = {
  provider: string;
  latest: string;
  lastFetch: string;
  status: string;
  frequency: string;
  days: string;
  warning: string;
  source: string;
};

const LABELS = {
  en: {
    title: "Database Freshness Report",
    loading: "Loading freshness report...",
    error: "Freshness report unavailable. Please check database connection or ingestion status.",
    total: "Total modules",
    fresh: "Fresh",
    stale: "Stale",
    failed: "Failed",
    partial: "Partial",
    empty: "Empty",
    unknown: "Unknown",
    safe: "Safe to analyze",
    yes: "Yes",
    no: "No",
    safetyWarning:
      "Some modules are stale, failed, partial, or empty. AI analysis should explicitly mention these data limitations.",
    module: "Module",
    provider: "Provider",
    latest: "Latest observation date",
    lastFetch: "Last successful fetch",
    status: "Freshness status",
    frequency: "Expected frequency",
    days: "Days since latest",
    warning: "Warning",
    source: "Official source",
    noModules: "No modules in this group.",
    groups: {
      fresh_modules: "Fresh modules",
      stale_modules: "Stale modules",
      failed_modules: "Failed modules",
      partial_modules: "Partial modules",
      empty_modules: "Empty modules",
      unknown_modules: "Unknown modules",
    },
  },
  zh: {
    title: "数据库新鲜度报告 (Database Freshness Report)",
    loading: "Loading freshness report...",
    error: "Freshness report unavailable. Please check database connection or ingestion status.",
    total: "总模块数 (Total modules)",
    fresh: "新鲜 (Fresh)",
    stale: "过期 (Stale)",
    failed: "失败 (Failed)",
    partial: "部分数据 (Partial)",
    empty: "空数据 (Empty)",
    unknown: "未知 (Unknown)",
    safe: "可安全分析 (Safe to analyze)",
    yes: "是",
    no: "否",
    safetyWarning:
      "部分模块为 stale、failed、partial 或 empty。AI analysis 应明确说明这些数据限制。",
    module: "模块 (Module)",
    provider: "提供方 (Provider)",
    latest: "最新观测日期 (Latest observation date)",
    lastFetch: "最近成功抓取 (Last successful fetch)",
    status: "新鲜度状态 (Freshness status)",
    frequency: "预期频率 (Expected frequency)",
    days: "距今天数 (Days since latest)",
    warning: "提示 (Warning)",
    source: "官方来源 (Official source)",
    noModules: "该分组暂无模块。",
    groups: {
      fresh_modules: "新鲜模块 (Fresh modules)",
      stale_modules: "过期模块 (Stale modules)",
      failed_modules: "失败模块 (Failed modules)",
      partial_modules: "部分数据模块 (Partial modules)",
      empty_modules: "空数据模块 (Empty modules)",
      unknown_modules: "未知模块 (Unknown modules)",
    },
  },
} as const;

function Pill({ value }: { value: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "2px 7px",
        border: "1px solid var(--tt-border)",
        borderRadius: 4,
        fontSize: 10,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        textTransform: "uppercase",
        color: "var(--tt-text)",
      }}
    >
      {value}
    </span>
  );
}

function SummaryTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        background: "var(--tt-panel)",
        border: "1px solid var(--tt-border)",
        borderRadius: 6,
        padding: "12px 14px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--tt-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 6,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 18,
          fontWeight: 600,
          color: "var(--tt-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ModuleRow({ row, labels }: { row: FreshnessRow; labels: LabelSet }) {
  const sourceUrl = row.source?.official_url;
  return (
    <div
      style={{
        background: "var(--tt-panel)",
        border: "1px solid var(--tt-border)",
        borderRadius: 6,
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tt-text)" }}>
          {row.source?.name ?? `source:${row.source_id}`}
        </div>
        <Pill value={row.freshness_status} />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 8,
          fontSize: 12,
          color: "var(--tt-muted)",
        }}
      >
        <span>{labels.provider}: {row.source?.provider ?? "--"}</span>
        <span>{labels.latest}: {row.latest_observation_date ?? "--"}</span>
        <span>{labels.lastFetch}: {row.last_successful_fetch ?? "--"}</span>
        <span>{labels.frequency}: {row.expected_frequency ?? "--"}</span>
        <span>{labels.days}: {row.days_since_latest ?? "--"}</span>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--tt-accent)" }}>
            {labels.source}
          </a>
        )}
      </div>
      {row.warning && (
        <div style={{ fontSize: 12, color: "var(--tt-warn)", lineHeight: 1.5 }}>
          {labels.warning}: {row.warning}
        </div>
      )}
    </div>
  );
}

export default function DataFreshnessReport({ lang }: { lang: Lang }) {
  const labels = LABELS[lang];
  const [report, setReport] = useState<FreshnessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/market/freshness/report", { cache: "no-store" });
        if (!response.ok) throw new Error(`freshness report ${response.status}`);
        const payload = (await response.json()) as FreshnessReport;
        if (!cancelled) setReport(payload);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summaryTiles = useMemo(() => {
    if (!report) return [];
    const s = report.data_status_summary;
    return [
      [labels.total, s.total_modules],
      [labels.fresh, s.fresh],
      [labels.stale, s.stale],
      [labels.failed, s.failed],
      [labels.partial, s.partial],
      [labels.empty, s.empty],
      [labels.unknown, s.unknown],
      [labels.safe, report.safe_to_analyze ? labels.yes : labels.no],
    ] as Array<[string, string | number]>;
  }, [labels, report]);

  if (loading) {
    return <p style={{ fontSize: 13, color: "var(--tt-muted)" }}>{labels.loading}</p>;
  }
  if (error || !report) {
    return <p style={{ fontSize: 13, color: "var(--tt-warn)" }}>{labels.error}</p>;
  }

  const groups = [
    ["fresh_modules", report.fresh_modules],
    ["stale_modules", report.stale_modules],
    ["failed_modules", report.failed_modules],
    ["partial_modules", report.partial_modules],
    ["empty_modules", report.empty_modules],
    ["unknown_modules", report.unknown_modules],
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {!report.safe_to_analyze && (
        <div
          style={{
            border: "1px solid color-mix(in srgb, var(--tt-warn) 40%, var(--tt-border))",
            background: "color-mix(in srgb, var(--tt-warn) 10%, var(--tt-panel))",
            borderRadius: 6,
            padding: "12px 14px",
            fontSize: 13,
            color: "var(--tt-text)",
            lineHeight: 1.6,
          }}
        >
          {labels.safetyWarning}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 8,
        }}
      >
        {summaryTiles.map(([label, value]) => (
          <SummaryTile key={label} label={label} value={value} />
        ))}
      </div>

      {groups.map(([key, rows]) => (
        <div key={key}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--tt-faint)",
              marginBottom: 10,
            }}
          >
            {labels.groups[key]}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {rows.length ? (
              rows.map((row) => <ModuleRow key={`${key}-${row.source_id}`} row={row} labels={labels} />)
            ) : (
              <p style={{ fontSize: 13, color: "var(--tt-muted)", margin: 0 }}>{labels.noModules}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
