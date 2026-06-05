"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Lang = "zh" | "en";

type TopSignal = {
  module?: string;
  signal?: string;
  interpretation?: string;
  market_impact?: string;
  caveat?: string;
};

type AiAnalysis = {
  executive_summary?: string;
  top_signals?: TopSignal[];
  cross_market_reading?: string;
  funding_conditions?: string;
  auction_risk_commentary?: string;
  policy_expectations_commentary?: string;
  watchlist?: string[];
  data_quality_notes?: string[];
  confidence?: "low" | "medium" | "high" | string;
  limitations?: string[];
};

type AiResponse =
  | {
      status: "available";
      analysis: AiAnalysis;
      created_at?: string;
      model?: string;
    }
  | {
      status: "unavailable";
      message: string;
      analysis?: AiAnalysis;
    };

const CONFIDENCE_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

async function fetchAiAnalysis(): Promise<AiResponse> {
  const response = await fetch("/api/ai-analysis", { cache: "no-store" });
  if (!response.ok) throw new Error(`/api/ai-analysis ${response.status}`);
  return response.json();
}

async function refreshAiAnalysis(): Promise<AiResponse> {
  const response = await fetch("/api/refresh-ai-analysis", { method: "POST" });
  if (!response.ok) throw new Error(`/api/refresh-ai-analysis ${response.status}`);
  return response.json();
}

function TextBlock({ title, children }: { title: string; children?: string }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <p className="text-sm leading-relaxed text-card-foreground">{children || "—"}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items?: string[] }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {items?.length ? (
        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2 text-sm leading-relaxed text-card-foreground">
              <span className="mt-0.5 text-amber-500">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

export default function AIMarketCommentary({ lang }: { lang: Lang }) {
  const [response, setResponse] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAiAnalysis()
      .then(setResponse)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "AI commentary unavailable."))
      .finally(() => setLoading(false));
  }, []);

  const analysis = response?.status === "available" ? response.analysis : response?.analysis;
  const confidence = analysis?.confidence ?? "low";
  const badgeClass = CONFIDENCE_BADGE[String(confidence).toLowerCase()] ?? CONFIDENCE_BADGE.low;
  const unavailableMessage = response?.status === "unavailable"
    ? response.message
    : "AI commentary unavailable. Click Refresh AI Analysis to generate it.";

  const title = lang === "zh"
    ? "AI Market Commentary / DeepSeek 中文解读"
    : "AI Market Commentary / DeepSeek Chinese Commentary";

  const meta = useMemo(() => {
    if (!response || response.status !== "available") return null;
    return [response.model, response.created_at].filter(Boolean).join(" · ");
  }, [response]);

  async function handleRefresh() {
    setRefreshing(true);
    setError("");
    try {
      setResponse(await refreshAiAnalysis());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "AI analysis refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Card className="border border-border shadow-sm bg-card/95">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Market Commentary</p>
            <h3 className="text-base font-semibold text-card-foreground">{title}</h3>
            {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${badgeClass}`}>
              {lang === "zh" ? "置信度" : "Confidence"}: {confidence}
            </Badge>
            <Button type="button" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
              {refreshing
                ? lang === "zh" ? "刷新中" : "Refreshing"
                : lang === "zh" ? "刷新 AI 解读" : "Refresh AI Analysis"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading AI commentary...</p>
        ) : response?.status !== "available" ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
            {unavailableMessage}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-card-foreground">{analysis?.executive_summary}</p>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-1.5 lg:col-span-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {lang === "zh" ? "主要信号" : "Top Signals"}
                </h4>
                <div className="space-y-2">
                  {(analysis?.top_signals ?? []).map((signal, index) => (
                    <div key={index} className="rounded-md border border-border bg-background/30 p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{signal.module ?? "module"}</Badge>
                        <span className="text-sm font-medium text-card-foreground">{signal.signal}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-card-foreground">{signal.interpretation}</p>
                      {signal.market_impact && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{signal.market_impact}</p>
                      )}
                      {signal.caveat && (
                        <p className="mt-1 text-xs leading-relaxed text-amber-600 dark:text-amber-300">{signal.caveat}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <TextBlock title={lang === "zh" ? "跨市场解读" : "Cross-market Reading"}>{analysis?.cross_market_reading}</TextBlock>
              <TextBlock title={lang === "zh" ? "资金条件" : "Funding Conditions"}>{analysis?.funding_conditions}</TextBlock>
              <TextBlock title={lang === "zh" ? "拍卖风险" : "Auction Risk Commentary"}>{analysis?.auction_risk_commentary}</TextBlock>
              <TextBlock title={lang === "zh" ? "政策预期" : "Policy Expectations Commentary"}>{analysis?.policy_expectations_commentary}</TextBlock>
              <ListBlock title={lang === "zh" ? "观察清单" : "Watchlist"} items={analysis?.watchlist} />
              <ListBlock title={lang === "zh" ? "数据质量" : "Data Quality Notes"} items={analysis?.data_quality_notes} />
              <ListBlock title={lang === "zh" ? "限制" : "Limitations"} items={analysis?.limitations} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
