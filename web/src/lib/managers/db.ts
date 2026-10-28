import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Accept either our own var names or the ones the Vercel↔Supabase integration injects.
export function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}
export function supabaseServiceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function hasSupabaseEnv(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

let _client: SupabaseClient | null = null;

// Lazy: never throws at import time (so `next build` works without creds).
export function getDb(): SupabaseClient {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase env not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  }
  if (!_client) {
    _client = createClient(supabaseUrl()!, supabaseServiceKey()!, {
      auth: { persistSession: false },
      // We never use Realtime; pass a WebSocket impl so supabase-js doesn't throw
      // on Node 20 (no global WebSocket).
      realtime: { transport: WebSocket as unknown as never },
    });
  }
  return _client;
}

/**
 * 对 Supabase 查询做"瞬时错误重试 + 指数退避(带抖动)"。
 * thunk 每次必须新建查询(PostgREST builder 是一次性的,不能重复 await)。
 * 原样返回最终响应,所以调用方保持既有写法不变:
 *   const { data, error } = await withRetry(() => db.from(...)...);
 *   if (error) throw ...;
 * —— 一次抖动被静默吸收;只有"重试耗尽仍失败"(=持续故障)才把 error 透出去
 * → 调用方 throw → 500/构建失败,绝不缓存假 404。退避抖动还顺带打散并发预渲染
 * 对 Supabase 的瞬时压力(即当初触发假 404 的"压力窗口"成因)。
 * happy path 首试即成、零额外开销。
 * retryable:可选;返回 false 的错误(如表未迁移 42P01,重试也不会好)直接透出、不退避重试。
 */
export async function withRetry<R extends { error: unknown }>(
  run: () => PromiseLike<R>,
  attempts = 3,
  retryable: (error: NonNullable<R["error"]>) => boolean = () => true,
): Promise<R> {
  let res: R = await run();
  for (let i = 1; i < attempts && res.error && retryable(res.error as NonNullable<R["error"]>); i++) {
    const backoff = 150 * 2 ** (i - 1) + Math.floor(Math.random() * 120);
    await new Promise((r) => setTimeout(r, backoff));
    res = await run();
  }
  return res;
}

/** PostgREST 单次响应的行数上限(Supabase 默认 max-rows = 1000)。 */
export const PAGE_SIZE = 1000;

type PageQuery<T> = { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }> };

/**
 * 分页读全量行,返回与单次查询同形的 `{ data, error }`,调用方照旧 `if (error) throw`。
 * 为什么必须分页:PostgREST 超出 max-rows 时**静默截断、不报错**。2026-10 实测
 * getManagerDetail 一次取「一户 8 季持仓」:Bridgewater 6757 行只回 1000、最新季 0 行,
 * GMO 4897 行同样最新季 0 行 → 投资人页空白、估值 universe 少 ~350 只票,且无任何报错。
 * build 每次必须新建查询,并以唯一键 .order(...) 结尾 —— 否则 OFFSET 分页在页边界会漏行/重行。
 * 每页走 withRetry;某页重试耗尽仍失败 → 原样返回该 error(不返回半截数据)。
 * retryable 同 withRetry:调用方可让"表未迁移"这类确定性错误不重试(见 getManagerDetail 读 split_adjustments)。
 */
export async function selectAllPages<T>(
  build: () => PageQuery<T>,
  pageSize = PAGE_SIZE,
  retryable?: (error: { message: string }) => boolean,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const data: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const res = await withRetry(() => build().range(from, from + pageSize - 1), 3, retryable);
    if (res.error) return { data: [], error: res.error };
    const page = res.data ?? [];
    data.push(...page);
    if (page.length < pageSize) break;
  }
  return { data, error: null };
}

/**
 * 分页读前 limit 行(Top-N 列表用)。单次 `.limit(n)` 在 n > max-rows 时同样被静默截在 1000 行:
 * 2026-10 个股目录与 sitemap 用 limit=5000 读共识表,1205 只共识股只出 998。
 * 约定同 selectAllPages:build 每次新建、以唯一键 .order(...) 结尾;某页失败 → 原样返回 error、不给半截数据。
 */
export async function selectPagesUpTo<T>(
  build: () => PageQuery<T>,
  limit: number,
  pageSize = PAGE_SIZE,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const data: T[] = [];
  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(from + pageSize, limit) - 1;
    const res = await withRetry(() => build().range(from, to));
    if (res.error) return { data: [], error: res.error };
    const page = res.data ?? [];
    data.push(...page);
    if (page.length < to - from + 1) break;
  }
  return { data, error: null };
}

/** 表未迁移(Postgres 42P01 / PostgREST PGRST205):新派生表先于 DDL 部署时据此降级,其他错误照常抛。 */
export function isMissingTableError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
