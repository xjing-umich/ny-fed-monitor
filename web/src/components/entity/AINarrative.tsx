"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

type Lang = "zh" | "en";

type TopSignal = {
  module?: string;
  signal?: string;
  interpretation?: string;
};

type AiAnalysis = {
  executive_summary?: string;
  top_signals?: TopSignal[];
};

type AiResponse =
  | { status: "available"; analysis: AiAnalysis; created_at?: string; model?: string }
  | { status: "unavailable"; message: string; analysis?: AiAnalysis };

async function fetchAiAnalysis(): Promise<AiResponse> {
  const res = await fetch("/api/ai-analysis", { cache: "no-store" });
  if (!res.ok) throw new Error(`/api/ai-analysis ${res.status}`);
  return res.json();
}

export type AINarrativeProps = {
  lang: Lang;
  pageKey?: string;
};

export function AINarrative({ lang }: AINarrativeProps) {
  const [response, setResponse] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAiAnalysis()
      .then(setResponse)
      .catch(() => setResponse(null))
      .finally(() => setLoading(false));
  }, []);

  const heading = lang === "zh" ? "AI 解读" : "AI Read";

  const analysis =
    response?.status === "available"
      ? response.analysis
      : response?.analysis ?? null;

  const isAvailable = response?.status === "available";
  const placeholder =
    lang === "zh" ? "暂无解读 / No commentary yet." : "No commentary yet.";

  return (
    <Card className="border border-border shadow-sm bg-card/95">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {heading}
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">
            {lang === "zh" ? "加载中…" : "Loading…"}
          </p>
        ) : !isAvailable || !analysis?.executive_summary ? (
          <p className="text-sm text-muted-foreground">{placeholder}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-card-foreground">
              {analysis.executive_summary}
            </p>

            {(analysis.top_signals ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {lang === "zh" ? "主要信号" : "Top Signals"}
                </p>
                <ul className="space-y-1">
                  {(analysis.top_signals ?? []).slice(0, 3).map((sig, i) => (
                    <li key={i} className="text-sm text-card-foreground leading-relaxed">
                      <span className="font-medium">{sig.signal ?? sig.module}</span>
                      {sig.interpretation && (
                        <span className="text-muted-foreground"> — {sig.interpretation}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
