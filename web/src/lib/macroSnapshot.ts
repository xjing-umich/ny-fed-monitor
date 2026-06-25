import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";
import type { DataPayload } from "@/lib/types";

/**
 * 读宏观快照(consensus 模式):/macro 页据此渲染,取代构建期实时抓 NY Fed/FRED/Treasury。
 *
 * 关键:任何异常都**优雅返回 null,绝不抛**——/macro 是次级 demo,首要目标是
 * "构建永远不因外部数据失败"。无 env / 表未迁移(42P01)/ 查询出错 / 暂无快照 → null,
 * 由页面降级为"刷新中"。新鲜快照由 scripts/macro-ingest.ts 周期写入。
 */
export const readMacroSnapshot = cache(async (): Promise<DataPayload | null> => {
  if (!hasSupabaseEnv()) return null;
  try {
    const { data, error } = await getDb()
      .from("macro_snapshot")
      .select("payload")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      if (error.code !== "42P01") console.error(`readMacroSnapshot 失败: ${error.message}`);
      return null;
    }
    return (data?.payload as DataPayload | undefined) ?? null;
  } catch (err) {
    console.error(`readMacroSnapshot 异常: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
});
