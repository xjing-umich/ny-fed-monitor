import { revalidatePath } from "next/cache";
import { isAuthorizedIngestRequest, unauthorizedResponse } from "@/lib/ingestion/auth";
import { DATA_DRIVEN_PATHS, DATA_DRIVEN_ROUTE_HANDLERS, REPORT_PATHS } from "@/lib/revalidate/paths";

export const dynamic = "force-dynamic";

/**
 * 数据落库 → 页面生效 的闭环。ingest 成功后由 workflow 调用,把数据驱动页标记为陈旧,
 * 下次访问即重新生成。
 *
 * 没有它,页面只能等各自的 ISR 到期(详情页 7 天),而 97 个投资人页各有各的倒计时(起点是各自
 * 上次生成的时间)→ 申报季站点长时间半新半旧:2026-08 Q2 申报季实测,Berkshire 页已翻到
 * Q2、段永平页仍停在 Q1,只因后者恰好在 ingest 前两小时重新生成过。
 *
 * `source=report` 只刷新报告相关页(learn),其余来源刷新全部数据页,理由见 paths.ts。
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedIngestRequest(request)) return unauthorizedResponse();

  const source = new URL(request.url).searchParams.get("source") ?? "manual";
  const paths: readonly string[] = source === "report" ? REPORT_PATHS : DATA_DRIVEN_PATHS;
  for (const path of paths) {
    revalidatePath(path, "page");
  }
  // 报告刷新不碰 llms.txt 等路由处理器(它们不读报告);其余来源照常刷新。
  if (source !== "report") {
    for (const path of DATA_DRIVEN_ROUTE_HANDLERS) {
      revalidatePath(path);
    }
  }

  return Response.json({
    ok: true,
    source,
    revalidated: source === "report" ? paths : [...paths, ...DATA_DRIVEN_ROUTE_HANDLERS],
    at: new Date().toISOString(),
  });
}
