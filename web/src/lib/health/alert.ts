import "server-only";
import { Resend } from "resend";
import type { HealthReport } from "./checks";

export type AlertResult = { alerted: boolean; reason?: string };

export async function sendHealthAlert(report: HealthReport): Promise<AlertResult> {
  if (report.ok) return { alerted: false, reason: "healthy" };

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.RESEND_ALERTS_TO;
  if (!apiKey || !to) {
    console.warn("[watchdog] RESEND_API_KEY / RESEND_ALERTS_TO 未配置,跳过告警");
    return { alerted: false, reason: "RESEND_API_KEY 或 RESEND_ALERTS_TO 未配置" };
  }
  // 已验证发送域 send.thecompounder.fyi(见 contact-form-resend 记忆);可用 env 覆盖。
  const from = process.env.RESEND_ALERTS_FROM || "Compounder Ops <ops@send.thecompounder.fyi>";
  const env = process.env.VERCEL_ENV || "local";

  const lines = report.problems.map(
    (p) => `[${p.pipeline}] ${p.source}: ${p.message}（截至 ${p.asOf ?? "—"}，${p.expected}）`
  );
  const infoBlock = report.info.length ? `\n\n诊断:\n${report.info.join("\n")}` : "";
  const text = `数据健康告警 · ${report.problems.length} 项\n\n${lines.join("\n")}${infoBlock}\n\ncheckedAt: ${report.checkedAt}\nenv: ${env}\n本邮件由 health-watchdog 自动发出。`;
  const subject = `[Compounder] 数据健康告警 · ${report.problems.length} 项`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, text });
  if (error) {
    console.error("[watchdog] Resend 发送失败:", error);
    return { alerted: false, reason: `resend error: ${error.message ?? String(error)}` };
  }
  return { alerted: true };
}
