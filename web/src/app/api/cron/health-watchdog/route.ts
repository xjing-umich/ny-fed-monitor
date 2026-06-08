import { isAuthorizedIngestRequest, unauthorizedResponse } from "@/lib/ingestion/auth";
import { hasSupabaseEnv } from "@/lib/managers/db";
import { gatherHealth } from "@/lib/health/gather";
import { sendHealthAlert } from "@/lib/health/alert";
import type { HealthReport } from "@/lib/health/checks";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedIngestRequest(request)) return unauthorizedResponse();
  if (!hasSupabaseEnv()) {
    return Response.json({ ok: false, message: "Database not configured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const today = new Date();
  const report = await gatherHealth(today);

  // 只看健康,不发邮件
  if (url.searchParams.get("dryRun") === "1") {
    return Response.json({ ...report, alerted: false, dryRun: true });
  }

  // 发一封测试告警,验 Resend 通路
  if (url.searchParams.get("test") === "1") {
    const testReport: HealthReport = {
      ...report,
      ok: false,
      problems: [{ pipeline: "13f", source: "测试", message: "这是一封 health-watchdog 测试告警", asOf: null, expected: "忽略即可" }],
    };
    const result = await sendHealthAlert(testReport);
    return Response.json({ ...testReport, ...result, test: true });
  }

  const result = await sendHealthAlert(report);
  return Response.json({ ...report, ...result });
}
