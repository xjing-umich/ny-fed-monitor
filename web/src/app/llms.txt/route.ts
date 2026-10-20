import { buildLlmsTxt } from "@/lib/llms";

// 静态缓存 + 3 天兜底(同列表页);新 filing 入库后由 /api/revalidate 一并刷新。
export const dynamic = "force-static";
export const revalidate = 259200;

export async function GET(): Promise<Response> {
  return new Response(await buildLlmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
