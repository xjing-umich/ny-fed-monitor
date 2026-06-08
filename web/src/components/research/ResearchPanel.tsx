"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, Database, FileText, RefreshCw, ShieldCheck } from "lucide-react";
import type {
  CoverageStatus,
  DataConfidence,
  EvidenceBasedRiskCheckResult,
  FundamentalQualityCheckResult,
  GrowthCapacityCheckResult,
  ResearchNoteWriterResult,
  ResearchWorkflowResult,
  RiskSignal,
  RiskSignalCategory,
} from "@/lib/research";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SourceStatus = {
  source?: string;
  status?: string;
  message?: string;
  signal_count?: number;
  missing_fields?: string[];
  latest_fiscal_year?: number;
  data_quality?: {
    missing_valuation_fields?: string[];
    valuation_confidence?: DataConfidence;
  };
};

type ResearchApiResponse = ResearchWorkflowResult & {
  data_source_status?: SourceStatus;
  valuation_source_status?: SourceStatus;
  risk_source_status?: SourceStatus;
  valuation_metrics?: Record<string, number | string | undefined>;
  risk_signals?: RiskSignal[];
};

type Props = {
  ticker: string;
};

const CLAIM_CATEGORY_LABELS: Record<string, string> = {
  buy: "Recommendation terms blocked",
  sell: "Recommendation terms blocked",
  hold: "Recommendation terms blocked",
  avoid: "Recommendation terms blocked",
  short: "Recommendation terms blocked",
  "target price": "Price objective language blocked",
  undervalued: "Valuation conclusion language blocked",
  overvalued: "Valuation conclusion language blocked",
  cheap: "Valuation conclusion language blocked",
  expensive: "Valuation conclusion language blocked",
  "fair value": "Intrinsic-worth language blocked",
  upside: "Return forecast language blocked",
  downside: "Return forecast language blocked",
  "margin of safety": "Intrinsic-worth language blocked",
  "real-time holdings": "Real-time holdings claims blocked",
  "investor motivation": "Investor motivation claims blocked",
  "institutional buying": "Institutional activity claims blocked",
  "institutional selling": "Institutional activity claims blocked",
  "institutions are buying": "Institutional activity claims blocked",
  "institutions are selling": "Institutional activity claims blocked",
  "best-in-class": "Peer ranking claims blocked",
  "market leader": "Peer ranking claims blocked",
  "better than peers": "Peer ranking claims blocked",
  "industry leader": "Peer ranking claims blocked",
  "regulatory risk": "External risk claims require evidence",
  "litigation risk": "External risk claims require evidence",
  "competition risk": "External risk claims require evidence",
  "customer churn": "External risk claims require evidence",
  "management risk": "External risk claims require evidence",
  "geopolitical risk": "External risk claims require evidence",
};

const RISK_CATEGORY_ORDER: RiskSignalCategory[] = [
  "Growth Risk",
  "Profitability and Margin Risk",
  "Free Cash Flow Risk",
  "Balance Sheet and Leverage Risk",
  "Capital Allocation Risk",
  "Valuation Risk",
  "13F Investor Signal Risk",
  "Data Quality Risk",
];

const SAFE_DISCLAIMER =
  "Not an investment recommendation. This research note is evidence-bound and does not provide trading instructions or price objectives.";

const DISPLAY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bbuy\b/gi, "recommendation action"],
  [/\bsell\b/gi, "recommendation action"],
  [/\bhold\b/gi, "recommendation action"],
  [/\bavoid\b/gi, "recommendation action"],
  [/\bshort\b/gi, "recommendation action"],
  [/target price/gi, "price objective"],
  [/fair value/gi, "intrinsic-worth conclusion"],
  [/upside/gi, "return forecast"],
  [/downside/gi, "return forecast"],
  [/undervalued/gi, "valuation conclusion"],
  [/overvalued/gi, "valuation conclusion"],
  [/cheap/gi, "valuation conclusion"],
  [/expensive/gi, "valuation conclusion"],
  [/margin of safety/gi, "intrinsic-worth conclusion"],
];

function titleFromKey(key: string): string {
  return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeText(value: string | undefined): string {
  if (!value) return "Unavailable";
  return DISPLAY_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function compactList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).filter(Boolean))];
}

function forbiddenClaimCategories(claims: string[] | undefined): string[] {
  return compactList((claims ?? []).map((claim) => CLAIM_CATEGORY_LABELS[claim] ?? titleFromKey(claim)));
}

function statusTone(status: string | undefined): "default" | "secondary" | "outline" | "destructive" {
  if (status === "available" || status === "Available") return "default";
  if (status === "partial" || status === "Partial") return "secondary";
  if (status === "unavailable" || status === "Missing") return "destructive";
  return "outline";
}

function confidenceClass(confidence: DataConfidence | undefined): string {
  if (confidence === "High") return "text-[var(--tt-positive)]";
  if (confidence === "Low") return "text-[var(--tt-negative)]";
  return "text-[var(--tt-warn)]";
}

function severityClass(value: string): string {
  if (value === "High") return "border-[var(--tt-negative)] text-[var(--tt-negative)]";
  if (value === "Low") return "border-[var(--tt-border-strong)] text-[var(--tt-muted)]";
  return "border-[var(--tt-warn)] text-[var(--tt-warn)]";
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "Unavailable";
  if (typeof value === "number") {
    if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) > 0 && Math.abs(value) < 1) return `${(value * 100).toFixed(1)}%`;
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value);
}

function StatusCard({
  title,
  status,
  description,
}: {
  title: string;
  status: SourceStatus | undefined;
  description?: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4 text-[var(--tt-accent)]" />
          {title}
        </CardTitle>
        <CardDescription>{description ?? status?.source ?? "Source status"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Badge variant={statusTone(status?.status)}>{status?.status ?? "unknown"}</Badge>
        {status?.message ? <p className="text-sm text-[var(--tt-muted)]">{status.message}</p> : null}
        {status?.signal_count != null ? (
          <p className="font-mono text-xs text-[var(--tt-muted)]">{status.signal_count} risk signals</p>
        ) : null}
        {status?.latest_fiscal_year ? (
          <p className="font-mono text-xs text-[var(--tt-muted)]">Latest FY {status.latest_fiscal_year}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChipList({ values, empty }: { values: string[] | undefined; empty: string }) {
  const list = compactList(values);
  if (list.length === 0) return <p className="text-sm text-[var(--tt-muted)]">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((value) => (
        <Badge key={value} variant="outline" className="h-auto whitespace-normal py-1 text-left leading-snug">
          {safeText(value)}
        </Badge>
      ))}
    </div>
  );
}

function StringList({ values, empty }: { values: string[] | undefined; empty: string }) {
  const list = compactList(values);
  if (list.length === 0) return <p className="text-sm text-[var(--tt-muted)]">{empty}</p>;
  return (
    <ul className="space-y-2 text-sm text-[var(--tt-muted)]">
      {list.map((value) => (
        <li key={value} className="border-l border-[var(--tt-border-strong)] pl-3">
          {safeText(value)}
        </li>
      ))}
    </ul>
  );
}

function DataCoverage({ data }: { data: ResearchApiResponse }) {
  const coverage = data.ui_ready.data_coverage;
  const forbiddenCategories = forbiddenClaimCategories(data.ui_ready.forbidden_claims);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Data Coverage</CardTitle>
          <CardDescription>Available normalized inputs and workflow constraints.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(coverage).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 border-b border-[var(--tt-border)] py-2">
                <span className="text-sm text-[var(--tt-muted)]">{titleFromKey(key)}</span>
                <Badge variant={statusTone(value)}>{value as CoverageStatus}</Badge>
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--tt-faint)]">Missing Fields</h3>
            <ChipList values={data.ui_ready.missing_fields} empty="No missing fields reported." />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Claim Boundaries</CardTitle>
          <CardDescription>What the UI may state from the available data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--tt-faint)]">Allowed Claims</h3>
            <ChipList values={data.ui_ready.allowed_claims} empty="No supported claim categories." />
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--tt-faint)]">Forbidden Claim Categories</h3>
            <ChipList values={forbiddenCategories} empty="No forbidden claim categories reported." />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FundamentalCard({ result }: { result: FundamentalQualityCheckResult }) {
  const rows: Array<[string, string | undefined]> = [
    ["Business Quality", result.business_quality],
    ["Profitability", result.profitability],
    ["Free Cash Flow Quality", result.free_cash_flow_quality],
    ["Balance Sheet Strength", result.balance_sheet_strength],
    ["Capital Allocation", result.capital_allocation],
  ];
  return (
    <SkillCard title="Fundamental Quality Check" description="Evidence-bound interpretation of normalized annual financials.">
      <KeyValueRows rows={rows} />
      <SectionList title="Supported Conclusions" values={result.supported_conclusions} empty="No supported conclusions." />
      <SectionList title="Cannot Conclude" values={result.cannot_conclude} empty="No limitations reported." />
      <SectionList title="Next Data Needed" values={result.next_data_needed} empty="No next data requested." />
    </SkillCard>
  );
}

function GrowthCard({ result }: { result: GrowthCapacityCheckResult }) {
  const rows: Array<[string, string | undefined]> = [
    ["Revenue Growth", result.revenue_growth],
    ["Growth Drivers", result.growth_drivers],
    ["Profit Growth", result.profit_growth],
    ["Free Cash Flow Growth", result.free_cash_flow_growth],
    ["Margin / Operating Leverage", result.margin_operating_leverage],
    ["Reinvestment Efficiency", result.reinvestment_efficiency],
    ["Forward Growth Visibility", result.forward_growth_visibility],
    ["Growth Quality Assessment", result.growth_quality_assessment],
  ];
  return (
    <SkillCard title="Growth Capacity Check" description="Historical growth only, with forward-looking limits called out.">
      <KeyValueRows rows={rows} />
      <SectionList title="Growth Risk Flags" values={result.growth_risk_flags} empty="No growth risk flags." />
      <SectionList title="Supported Conclusions" values={result.supported_conclusions} empty="No supported conclusions." />
      <SectionList title="Cannot Conclude" values={result.cannot_conclude} empty="No limitations reported." />
      <SectionList title="Next Data Needed" values={result.next_data_needed} empty="No next data requested." />
    </SkillCard>
  );
}

function RiskCheckCard({ result }: { result: EvidenceBasedRiskCheckResult }) {
  const rows: Array<[string, string | undefined]> = [
    ["Investor Signal Risk", result.investor_signal_risk],
    ["Growth Risk", result.growth_risk],
    ["Profitability / Margin Risk", result.profitability_margin_risk],
    ["Free Cash Flow Risk", result.free_cash_flow_risk],
    ["Balance Sheet / Leverage Risk", result.balance_sheet_leverage_risk],
    ["Capital Allocation Risk", result.capital_allocation_risk],
    ["Valuation Risk", result.valuation_risk],
    ["Forward-Looking Risk", result.forward_looking_risk],
    ["External Evidence Risk", result.external_evidence_risk],
    ["Data Quality Risk", result.data_quality_risk],
    ["Overall Risk Summary", result.overall_risk_summary],
  ];
  return (
    <SkillCard title="Evidence-Based Risk Check" description="Explains only the structured system-derived risk signals.">
      <KeyValueRows rows={rows} />
      <SectionList title="Cannot Assess" values={result.cannot_assess} empty="No unavailable risk sections reported." />
      <SectionList title="Next Data Needed" values={result.next_data_needed} empty="No next data requested." />
    </SkillCard>
  );
}

function SkillCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function KeyValueRows({ rows }: { rows: Array<[string, string | undefined]> }) {
  return (
    <div className="space-y-3">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 border-b border-[var(--tt-border)] pb-3 md:grid-cols-[180px_1fr]">
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--tt-faint)]">{label}</dt>
          <dd className="text-sm leading-relaxed text-[var(--tt-text)]">{safeText(value)}</dd>
        </div>
      ))}
    </div>
  );
}

function SectionList({ title, values, empty }: { title: string; values: string[] | undefined; empty: string }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--tt-faint)]">{title}</h3>
      <StringList values={values} empty={empty} />
    </section>
  );
}

function RiskSignals({ signals }: { signals: RiskSignal[] | undefined }) {
  const groups = useMemo(() => {
    const grouped = new Map<RiskSignalCategory, RiskSignal[]>();
    for (const signal of signals ?? []) {
      grouped.set(signal.category, [...(grouped.get(signal.category) ?? []), signal]);
    }
    return RISK_CATEGORY_ORDER.flatMap((category) => {
      const rows = grouped.get(category);
      return rows?.length ? [{ category, rows }] : [];
    });
  }, [signals]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-[var(--tt-accent)]" />
          Risk Signals
        </CardTitle>
        <CardDescription>Grouped by category and derived from normalized data only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {groups.length === 0 ? <p className="text-sm text-[var(--tt-muted)]">No structured risk signals were generated.</p> : null}
        {groups.map(({ category, rows }) => (
          <section key={category} className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--tt-faint)]">{category}</h3>
            <div className="grid gap-3">
              {rows.map((signal) => (
                <article key={signal.id} className="rounded-lg border border-[var(--tt-border)] bg-background/50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-mono text-sm font-medium text-[var(--tt-text)]">{signal.id}</h4>
                    <Badge variant="outline" className={cn("border", severityClass(signal.severity))}>
                      {signal.severity}
                    </Badge>
                    <Badge variant="outline" className={cn("border", severityClass(signal.evidence_strength))}>
                      Evidence {signal.evidence_strength}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--tt-text)]">{safeText(signal.evidence)}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--tt-muted)]">{safeText(signal.why_it_matters)}</p>
                  <div className="mt-3">
                    <h5 className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--tt-faint)]">Data Needed Next</h5>
                    <ChipList values={signal.data_needed_next} empty="No next data listed." />
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function ResearchNote({ result }: { result: ResearchNoteWriterResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 text-[var(--tt-accent)]" />
          Research Note Writer
        </CardTitle>
        <CardDescription>Data-grounded interpretation prepared for display.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <KeyValueRows
          rows={[
            ["Research Snapshot", result.research_snapshot],
            ["Fundamental Summary", result.fundamental_summary],
            ["Growth Summary", result.growth_summary],
            ["Risk Summary", result.risk_summary],
          ]}
        />
        <SectionList title="Key Evidence" values={result.key_evidence} empty="No key evidence listed." />
        <SectionList title="Limitations" values={result.limitations} empty="No limitations reported." />
        <SectionList title="Next Data Needed" values={result.next_data_needed} empty="No next data requested." />
      </CardContent>
    </Card>
  );
}

function SpecialGaps({ data }: { data: ResearchApiResponse }) {
  const valuationUnavailable = data.valuation_source_status?.status === "unavailable";
  const missing = new Set(data.ui_ready.missing_fields);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {valuationUnavailable ? (
        <Notice text="Valuation metrics unavailable. Price source is not configured." />
      ) : null}
      {missing.has("peer_comparison") ? <Notice text="Selected peer comparison is not available yet." /> : null}
      {missing.has("external_evidence") ? <Notice text="10-K / 10-Q / earnings call evidence is not connected yet." /> : null}
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--tt-border)] bg-muted/50 p-3 text-sm text-[var(--tt-muted)]">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--tt-warn)]" />
      <span>{text}</span>
    </div>
  );
}

function MetricsStrip({ data }: { data: ResearchApiResponse }) {
  const metrics = data.valuation_metrics ?? {};
  const rows = [
    ["Latest Price", metrics.latest_price],
    ["Market Cap", metrics.market_cap],
    ["Enterprise Value", metrics.enterprise_value],
    ["P/E", metrics.pe],
    ["P/S", metrics.price_to_sales],
    ["P/FCF", metrics.pfcf_ratio],
    ["FCF Yield", metrics.fcf_yield],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-4 text-[var(--tt-accent)]" />
          Valuation Metrics
        </CardTitle>
        <CardDescription>Point-in-time ratios only when price data is available.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[var(--tt-border)] p-3">
              <div className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">{label}</div>
              <div className="mt-1 font-mono text-sm text-[var(--tt-text)]">{formatValue(value)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingPanel({ ticker }: { ticker: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--tt-faint)]">Research</p>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-[var(--tt-text)]">{ticker}</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-96" />
    </div>
  );
}

export function ResearchPanel({ ticker }: Props) {
  const [data, setData] = useState<ResearchApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/research/${encodeURIComponent(ticker)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Research request failed with status ${response.status}`);
        const json = (await response.json()) as ResearchApiResponse;
        if (!cancelled) setData(json);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Research request failed.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (isLoading) return <LoadingPanel ticker={ticker} />;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-[var(--tt-negative)]" />
              Research data unavailable
            </CardTitle>
            <CardDescription>{error ?? "The research workflow did not return data."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const skillResults = data.skill_results;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-4 border-b border-[var(--tt-border)] pb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--tt-faint)]">Evidence-Bound Research Note</p>
          <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">
            {data.company_name ?? data.ticker}
          </h1>
          <p className="mt-2 font-mono text-xs text-[var(--tt-muted)]">
            {data.ticker} {data.period ? `· ${data.period}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("border", confidenceClass(data.data_quality_gate.data_confidence))}>
            Data Confidence: {data.data_quality_gate.data_confidence}
          </Badge>
          <Badge variant="secondary">Analysis Level: {titleFromKey(data.data_quality_gate.analysis_level)}</Badge>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatusCard title="Data Source" status={data.data_source_status} />
        <StatusCard title="Valuation Source" status={data.valuation_source_status} />
        <StatusCard title="Risk Source" status={data.risk_source_status} description="System-derived risk table" />
      </div>

      <SpecialGaps data={data} />
      <DataCoverage data={data} />
      <MetricsStrip data={data} />

      <div className="grid gap-6">
        <FundamentalCard result={skillResults.fundamental_quality_check} />
        <GrowthCard result={skillResults.growth_capacity_check} />
        <RiskCheckCard result={skillResults.evidence_based_risk_check} />
        <RiskSignals signals={data.risk_signals} />
        <ResearchNote result={skillResults.research_note_writer} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Limitations</CardTitle>
          <CardDescription>Data-grounded interpretation boundaries.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <StringList values={data.ui_ready.limitations} empty="No limitations reported." />
          <p className="rounded-lg border border-[var(--tt-border)] bg-muted/50 p-3 text-sm text-[var(--tt-muted)]">
            {SAFE_DISCLAIMER}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
