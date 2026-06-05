import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildAllSections } from "@/lib/build";
import { getDb, hasSupabaseEnv } from "@/lib/managers/db";
import type { Section } from "@/lib/types";

const PAGE_KEY = "nyfed_treasury_monitor_zh";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";

const REQUIRED_KEYS = [
  "executive_summary",
  "top_signals",
  "cross_market_reading",
  "funding_conditions",
  "auction_risk_commentary",
  "policy_expectations_commentary",
  "watchlist",
  "data_quality_notes",
  "confidence",
  "limitations",
] as const;

type DeepSeekAnalysis = Record<(typeof REQUIRED_KEYS)[number], unknown>;

function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function compactSection(section: Section) {
  return {
    key: section.key,
    title: section.title,
    title_zh: section.title_zh,
    freshness_status: section.freshness_status,
    data_date: section.data_date,
    mode: section.mode,
    summary: section.summary,
    summary_zh: section.summary_zh,
    warnings: section.warnings ?? [],
    key_metrics: (section.key_metrics ?? []).slice(0, 8).map((metric) => ({
      label: metric.label,
      label_zh: metric.label_zh,
      value: metric.value,
      unit: metric.unit,
    })),
  };
}

async function loadDerivedMetricRules() {
  const filePath = path.join(process.cwd(), "data", "derived_metrics.json");
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as unknown;
}

async function buildPromptPayload() {
  const [data, derivedMetricRules] = await Promise.all([
    buildAllSections(),
    loadDerivedMetricRules(),
  ]);
  const sections = Object.values(data.sections).map(compactSection);
  return {
    as_of: data.as_of,
    summary: data.summary,
    dashboard_labels: sections.map((section) => ({
      key: section.key,
      title: section.title,
      title_zh: section.title_zh,
      freshness_status: section.freshness_status,
      data_date: section.data_date,
      mode: section.mode,
    })),
    section_metrics: sections,
    warnings: sections.flatMap((section) => section.warnings ?? []).slice(0, 40),
    derived_metric_rules: derivedMetricRules,
  };
}

function systemPrompt(): string {
  return [
    "You are a Treasury market research assistant.",
    "You analyze NY Fed Treasury Monitor data.",
    "Use only the provided JSON data and derived metric rules.",
    "Do not invent missing values.",
    "Do not fetch raw data.",
    "Do not give buy/sell/trading recommendations.",
    "Write Chinese-first market commentary using cautious language such as 可能表明, 需要继续观察, 与……一致, 并不一定意味着, 需要结合其他指标确认.",
    "Always distinguish repo financing usage, funding rate stress, ON RRP cash buffer, SRP backstop usage, settlement fails, auction risk, and policy expectations.",
  ].join("\n");
}

function userPrompt(payload: unknown): string {
  return [
    "请基于以下 JSON 生成严格 JSON 输出。不要使用 Markdown。",
    "输出格式必须为：",
    JSON.stringify({
      executive_summary: "...",
      top_signals: [
        {
          module: "...",
          signal: "...",
          interpretation: "...",
          market_impact: "...",
          caveat: "...",
        },
      ],
      cross_market_reading: "...",
      funding_conditions: "...",
      auction_risk_commentary: "...",
      policy_expectations_commentary: "...",
      watchlist: ["...", "..."],
      data_quality_notes: ["...", "..."],
      confidence: "low | medium | high",
      limitations: ["...", "..."],
    }),
    "唯一允许使用的数据：",
    JSON.stringify(payload),
  ].join("\n\n");
}

function extractJson(text: string): DeepSeekAnalysis {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const jsonText = start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(jsonText) as Partial<DeepSeekAnalysis>;
  for (const key of REQUIRED_KEYS) {
    if (!(key in parsed)) {
      throw new Error(`DeepSeek response missing required key: ${key}`);
    }
  }
  if (!["low", "medium", "high"].includes(String(parsed.confidence))) {
    parsed.confidence = "low";
    parsed.limitations = [
      ...((Array.isArray(parsed.limitations) ? parsed.limitations : []) as unknown[]),
      "Confidence was normalized because the model returned an invalid value.",
    ];
  }
  return parsed as DeepSeekAnalysis;
}

export async function getLatestAiAnalysis() {
  if (!hasSupabaseEnv()) {
    return {
      status: "unavailable",
      message: "Supabase is not configured on the server.",
    };
  }
  try {
    const { data, error } = await getDb()
      .from("ai_analysis_cache")
      .select("analysis_json, created_at, model")
      .eq("page_key", PAGE_KEY)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return {
        status: "unavailable",
        message: "AI commentary unavailable. Click Refresh AI Analysis to generate it.",
      };
    }
    return {
      status: "available",
      analysis: data.analysis_json,
      created_at: data.created_at,
      model: data.model,
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: `AI commentary unavailable. Supabase read failed: ${serializeError(error)}`,
    };
  }
}

export async function refreshAiAnalysis() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "unavailable",
      message: "DEEPSEEK_API_KEY is not configured on the server.",
    };
  }
  if (!hasSupabaseEnv()) {
    return {
      status: "unavailable",
      message: "Supabase is not configured on the server.",
    };
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

  try {
    const promptPayload = await buildPromptPayload();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: userPrompt(promptPayload) },
        ],
      }),
    });

    const raw = await response.json().catch(async () => ({ text: await response.text() }));
    if (!response.ok) {
      return {
        status: "unavailable",
        message: `DeepSeek request failed with HTTP ${response.status}.`,
      };
    }

    const content = raw?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("DeepSeek response did not include message content.");
    }
    const analysis = extractJson(content);

    const { data, error } = await getDb()
      .from("ai_analysis_cache")
      .insert({
        page_key: PAGE_KEY,
        analysis_json: analysis,
        model,
        source_data_timestamp: typeof promptPayload.as_of === "string" ? promptPayload.as_of : null,
      })
      .select("analysis_json, created_at, model")
      .single();
    if (error) throw error;

    return {
      status: "available",
      analysis: data.analysis_json,
      created_at: data.created_at,
      model: data.model,
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: `AI commentary refresh failed: ${serializeError(error)}`,
    };
  }
}
