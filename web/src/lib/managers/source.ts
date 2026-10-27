import "server-only";
import { cache } from "react";
import type { ManagerIndex, ManagerDetail, ManagerQoQ } from "@/lib/managers/types";
import * as supa from "@/lib/managers/supabase";
import { getCusipMap } from "@/lib/managers/securities";
import { withCanonicalIssuers } from "@/lib/managers/canonicalIssuer";

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

// 持仓名统一成个股页用的名字(见 canonicalIssuer.ts);getCusipMap 有进程级缓存,不额外加往返。
export const getManagerDetail = cache(async (cikOrSlug: string): Promise<ManagerDetail | null> => {
  const [d, cusipMap] = await Promise.all([supa.getManagerDetail(cikOrSlug), getCusipMap()]);
  return d && withCanonicalIssuers(d, cusipMap);
});
