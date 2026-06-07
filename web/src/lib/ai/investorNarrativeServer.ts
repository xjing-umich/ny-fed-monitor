import "server-only";
import { cache } from "react";
import { getDb, hasSupabaseEnv } from "@/lib/managers/db";
import {
  buildMovesPayload,
  parseInvestorNarrative,
  systemPrompt,
  userPrompt,
  narrativeKey,
  type ManagerDetailLike,
  type InvestorNarrativeData,
  type Lang,
} from "./investorNarrative";

// 直连用户自己的 DeepSeek API(OpenAI 兼容 /chat/completions), 绕开 Vercel AI Gateway 的免费档模型门槛。
// 模型优先级: NARRATIVE_MODEL > DEEPSEEK_MODEL > 缺省 v4-flash。base url 默认 DeepSeek 官方。
const DEFAULT_BASE = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

/** 直连 DeepSeek 生成并写库。缺 env 抛错（路由捕获）。 */
export async function generateAndCacheNarrative(
  d: ManagerDetailLike,
  lang: Lang
): Promise<InvestorNarrativeData> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");
  if (!hasSupabaseEnv()) throw new Error("Supabase env not configured");

  const base = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
  const model = process.env.NARRATIVE_MODEL || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const payload = buildMovesPayload(d);

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      // v4 是推理模型, reasoning 先吃 token; 给足上限避免正文(content)被截断为空。
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt(lang) },
        { role: "user", content: userPrompt(payload, lang) },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`deepseek ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("deepseek returned empty content");
  const data = parseInvestorNarrative(text);

  const { error } = await getDb().from("ai_analysis_cache").insert({
    page_key: narrativeKey(d.manager.slug, d.latest.period, lang),
    analysis_json: data,
    model,
    source_data_timestamp: d.latest.filedAt,
  });
  if (error) throw new Error(`cache insert failed: ${error.message}`);
  return data;
}

/**
 * 读某投资者某语言的**最新**缓存叙述(按 created_at 降序, 不绑定具体 period)。
 * 这样页面正文与 generateMetadata 读到的一致, 且对 latest.period 漂移/新季度生成天然鲁棒。
 * 无 env / 无缓存 → null。每次渲染缓存一次。
 */
export const getInvestorNarrative = cache(
  async (slug: string, lang: Lang): Promise<InvestorNarrativeData | null> => {
    if (!hasSupabaseEnv()) return null;
    const { data, error } = await getDb()
      .from("ai_analysis_cache")
      .select("analysis_json")
      .like("page_key", `investor:${slug}:%:${lang}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data.analysis_json as InvestorNarrativeData;
  }
);
