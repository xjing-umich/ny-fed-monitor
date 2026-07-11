"use client";

import { useEffect, useState } from "react";

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

async function fetchAiAnalysis(pageKey?: string): Promise<AiResponse> {
  const url = pageKey
    ? `/api/ai-analysis?page=${encodeURIComponent(pageKey)}`
    : "/api/ai-analysis";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

export type AINarrativeProps = {
  lang: Lang;
  pageKey?: string;
};

export function AINarrative({ lang, pageKey }: AINarrativeProps) {
  const [response, setResponse] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchAiAnalysis(pageKey)
      .then(setResponse)
      .catch(() => setResponse(null))
      .finally(() => setLoading(false));
  }, [pageKey]);

  const heading = lang === "zh" ? "AI 解读" : "AI Read";

  const analysis =
    response?.status === "available"
      ? response.analysis
      : response?.analysis ?? null;

  const isAvailable = response?.status === "available";
  const placeholder =
    lang === "zh" ? "暂无解读" : "No commentary yet.";

  return (
    <section>
      <div className="pb-1 mb-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {heading}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--tt-muted)]">
          {lang === "zh" ? "加载中…" : "Loading…"}
        </p>
      ) : !isAvailable || !analysis?.executive_summary ? (
        <p className="text-sm text-[var(--tt-muted)]">{placeholder}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-[var(--tt-text)]">
            {analysis.executive_summary}
          </p>

          {(analysis.top_signals ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                {lang === "zh" ? "主要信号" : "Top Signals"}
              </p>
              <ul className="space-y-1.5">
                {(analysis.top_signals ?? []).slice(0, 3).map((sig, i) => (
                  <li key={i} className="text-sm text-[var(--tt-text)] leading-relaxed">
                    <span className="font-medium">{sig.signal ?? sig.module}</span>
                    {sig.interpretation && (
                      <span className="text-[var(--tt-muted)]"> — {sig.interpretation}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
