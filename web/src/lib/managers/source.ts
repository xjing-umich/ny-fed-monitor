import "server-only";
import { cache } from "react";
import type { ManagerIndex, ManagerDetail, ManagerQoQ } from "@/lib/managers/types";
import * as supa from "@/lib/managers/supabase";

// Supabase 是投资人数据的唯一真源。所有部署环境(Vercel)与 ingest 都配了
// SUPABASE_URL / SUPABASE_SERVICE_KEY;无凭据时下面经 getDb() 直接抛错(不再有
// 提交式 JSON 兜底 —— 退役原因见 retire-committed-13f-json 决策)。
// cache(): 同一请求内对相同入参去重(generateMetadata 与 page 组件、以及
// 个股页对同一 manager 的重复读取共享一次查询),避免重复往返 Supabase。
export const getManagerIndex = cache(async (): Promise<ManagerIndex> => {
  return supa.getManagerIndex(new Date().toISOString());
});

export const getManagerQoQ = cache(async (): Promise<Map<string, ManagerQoQ>> => {
  return supa.getManagerQoQ();
});

export const getManagerDetail = cache(async (cikOrSlug: string): Promise<ManagerDetail | null> => {
  return supa.getManagerDetail(cikOrSlug);
});
