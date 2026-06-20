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
 */
export async function withRetry<R extends { error: unknown }>(
  run: () => PromiseLike<R>,
  attempts = 3,
): Promise<R> {
  let res: R = await run();
  for (let i = 1; i < attempts && res.error; i++) {
    const backoff = 150 * 2 ** (i - 1) + Math.floor(Math.random() * 120);
    await new Promise((r) => setTimeout(r, backoff));
    res = await run();
  }
  return res;
}
