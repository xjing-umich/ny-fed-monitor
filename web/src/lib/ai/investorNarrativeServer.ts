import "server-only";
import { cache } from "react";
import { generateText } from "ai";
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

// 缺省模型: 走 AI Gateway 的 "provider/model" 字符串(已用 gateway.getAvailableModels() 核准)。
// 可由 env NARRATIVE_MODEL 覆盖(如 deepseek/deepseek-v4-pro)。
const DEFAULT_MODEL = "deepseek/deepseek-v3.2";

/** 调 AI Gateway 生成并写库。缺 env 抛错（路由捕获）。 */
export async function generateAndCacheNarrative(
  d: ManagerDetailLike,
  lang: Lang
): Promise<InvestorNarrativeData> {
  // AI Gateway 认证: 静态 AI_GATEWAY_API_KEY 优先, 否则回退 vercel env pull 的 VERCEL_OIDC_TOKEN
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error("No AI Gateway auth (set AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN)");
  }
  if (!hasSupabaseEnv()) throw new Error("Supabase env not configured");

  const model = process.env.NARRATIVE_MODEL || DEFAULT_MODEL;
  const payload = buildMovesPayload(d);

  const { text } = await generateText({
    model, // 纯 "provider/model" 字符串 → 自动走 AI Gateway
    temperature: 0.2,
    system: systemPrompt(lang),
    prompt: userPrompt(payload),
  });
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
