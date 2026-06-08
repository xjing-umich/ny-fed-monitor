import "server-only";
import { cache } from "react";
import type { ManagerIndex, ManagerDetail, ManagerQoQ, Manager, FilingData } from "@/lib/managers/types";
import { assembleManagerDetail } from "@/lib/managers/assemble";
import { hasSupabaseEnv } from "@/lib/managers/db";
import * as supa from "@/lib/managers/supabase";
import indexJson from "@/data/13f/index.json";
// Static map of bundled per-manager JSON (slug + cik keys) — keep in sync with data dir.
import berkshire from "@/data/13f/berkshire-hathaway.json";
import scion from "@/data/13f/scion-asset-management.json";
import pershing from "@/data/13f/pershing-square.json";
import bridgewater from "@/data/13f/bridgewater-associates.json";
import duquesne from "@/data/13f/duquesne-family-office.json";
import baupost from "@/data/13f/baupost-group.json";

// bundle 既可能是新形状 { manager, filings } 也可能是旧形状 { manager, latest, prior }。
type RawManagerDetail = { manager: Manager; filings?: FilingData[]; latest?: FilingData; prior?: FilingData };

const JSON_DETAILS = [berkshire, scion, pershing, bridgewater, duquesne, baupost] as unknown as RawManagerDetail[];

function jsonIndex(): ManagerIndex { return indexJson as unknown as ManagerIndex; }
function jsonDetail(cikOrSlug: string): ManagerDetail | null {
  const raw = JSON_DETAILS.find((d) => d.manager.cik === cikOrSlug || d.manager.slug === cikOrSlug);
  if (!raw) return null;
  // 新形状直接用 filings；旧形状从 latest/prior 兜底拼出 filings。
  const filings = raw.filings ?? [raw.latest, raw.prior].filter((f): f is FilingData => !!f);
  if (filings.length === 0) return null;
  return assembleManagerDetail(raw.manager, filings);
}

// cache(): 同一请求内对相同入参去重(generateMetadata 与 page 组件、以及
// 扫描/个股页对同一 manager 的重复读取共享一次查询),避免重复往返 Supabase。
export const getManagerIndex = cache(async (): Promise<ManagerIndex> => {
  if (hasSupabaseEnv()) return supa.getManagerIndex(new Date().toISOString());
  return jsonIndex();
});

// 列表页季度变化信号:有 Supabase 走 RPC,否则空 Map(JSON 兜底数据无 QoQ)。
// cache() 使同一请求内多次调用只查一次。
export const getManagerQoQ = cache(async (): Promise<Map<string, ManagerQoQ>> => {
  if (hasSupabaseEnv()) return supa.getManagerQoQ();
  return new Map();
});

export const getManagerDetail = cache(async (cikOrSlug: string): Promise<ManagerDetail | null> => {
  if (hasSupabaseEnv()) return supa.getManagerDetail(cikOrSlug);
  return jsonDetail(cikOrSlug);
});
