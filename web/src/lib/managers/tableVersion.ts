import "server-only";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";

/**
 * 表的廉价版本标记,给 processCached 的 `version` 用:行数 + 按 `col` 倒序的第一行值。
 * 一次请求只回一行,egress 可忽略。增删改变行数，覆盖写改变 `col`(须是写入时会变的列)。
 * 无 Supabase env 或读失败 → null(processCached 退回纯 TTL)。
 */
export async function tableVersion(table: string, col: string): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  const { data, count, error } = await getDb()
    .from(table)
    .select(col, { count: "exact" })
    .order(col, { ascending: false })
    .limit(1);
  if (error) {
    console.error(`tableVersion(${table}): ${error.message}`);
    return null;
  }
  const top = (data?.[0] as unknown as Record<string, unknown> | undefined)?.[col];
  return `${count ?? "?"}:${top ?? ""}`;
}
