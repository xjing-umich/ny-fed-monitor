import "server-only";
import type { ManagerIndex, ManagerDetail } from "@/lib/managers/types";
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

const JSON_DETAILS = [berkshire, scion, pershing, bridgewater, duquesne, baupost] as unknown as ManagerDetail[];

function jsonIndex(): ManagerIndex { return indexJson as unknown as ManagerIndex; }
function jsonDetail(cikOrSlug: string): ManagerDetail | null {
  return JSON_DETAILS.find((d) => d.manager.cik === cikOrSlug || d.manager.slug === cikOrSlug) ?? null;
}

export async function getManagerIndex(): Promise<ManagerIndex> {
  if (hasSupabaseEnv()) return supa.getManagerIndex(new Date().toISOString());
  return jsonIndex();
}

export async function getManagerDetail(cikOrSlug: string): Promise<ManagerDetail | null> {
  if (hasSupabaseEnv()) return supa.getManagerDetail(cikOrSlug);
  return jsonDetail(cikOrSlug);
}
