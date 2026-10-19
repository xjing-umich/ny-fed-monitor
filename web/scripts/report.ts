/**
 * 季度报告 live 刷新 + 可定稿时发预览。用法: npm run report [-- --period=2026-06-30]
 * ingest 之后运行。payload 不变则什么都不写(不刷缓存、不改 generated_at)。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import { buildQuarterlyReport } from "../src/lib/reports/build";
import { meetsPublishThreshold, payloadHash, PUBLISH_MIN_COVERAGE, reportReadiness } from "../src/lib/reports/readiness";
import { renderReportEmail } from "../src/lib/reports/email";
import { reportPeriodFor, reportSlug } from "../src/lib/reports/period";
import type { ReportPayload, ReportRow } from "../src/lib/reports/types";
import { loadReportInput } from "./lib/loadReportInput";
import { countPriorIssues, readReport } from "./lib/reportDb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}
export const env = loadEnv();

function setActionOutput(key: string, value: string) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${key}=${value}\n`);
}

export function makeDb(): SupabaseClient {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  return createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });
}

/** 把中英两版真实渲染的邮件发给站长,并记录这份 payload 作为待定稿版本。 */
export async function sendPreview(db: SupabaseClient, row: ReportRow, payload: ReportPayload, valuationAsOf: string | null): Promise<void> {
  const key = env.RESEND_API_KEY;
  const to = env.RESEND_ALERTS_TO;
  if (!key || !to) throw new Error("缺少 RESEND_API_KEY / RESEND_ALERTS_TO,无法发预览");
  const resend = new Resend(key);
  const from = env.RESEND_ALERTS_FROM || "Compounder Ops <ops@send.thecompounder.fyi>";
  // 首期句与真实群发同一口径(countPriorIssues),预览里看到的就是订阅者会看到的。
  const isFirstIssue = (await countPriorIssues(db, row.period)) === 0;
  const meta = { status: "final" as const, coverageFiled: payload.coverage.filed, coverageTotal: payload.coverage.total, finalizedAt: new Date().toISOString(), valuationAsOf, isFirstIssue, postalAddress: env.NEWSLETTER_POSTAL_ADDRESS || undefined };
  const how = `\n\n[预览] ${reportSlug(row.period)} · 覆盖 ${payload.coverage.filed}/${payload.coverage.total}\n确认无误后:GitHub → Actions → Report finalize & send → Run workflow(period=${row.period}, action=finalize)。\n想用更新的数据先跑 action=preview。`;
  for (const lang of ["en", "zh"] as const) {
    const e = renderReportEmail(payload, meta, lang);
    const { error } = await resend.emails.send({ from, to, subject: `[预览 ${lang}] ${e.subject}`, html: e.html, text: e.text + how });
    if (error) throw new Error(`预览发送失败(${lang}): ${error.message}`);
  }
  const { error } = await db.from("quarterly_reports")
    .update({ preview_payload: payload, preview_valuation_as_of: valuationAsOf, preview_sent_at: new Date().toISOString() })
    .eq("period", row.period).eq("status", "live");
  if (error) throw new Error(`记录预览失败: ${error.message}`);
}

async function main() {
  const db = makeDb();
  const arg = process.argv.find((a) => a.startsWith("--period="));
  const period = arg ? arg.slice("--period=".length) : reportPeriodFor(new Date());
  const { input, valuationAsOf } = await loadReportInput(db, period);
  const payload = buildQuarterlyReport(input);

  // 未达公开门槛不建行;已有的行(此前达标过)照常刷新,不会因门槛被撤下。
  const existing = await readReport(db, period);
  if (!existing && !meetsPublishThreshold(payload.coverage)) {
    console.log(`[report] ${period}: 覆盖 ${payload.coverage.filed}/${payload.coverage.total} 未达公开门槛 ${PUBLISH_MIN_COVERAGE * 100}%,暂不建行`);
    setActionOutput("report_changed", "false");
    return;
  }
  const hash = payloadHash(payload);
  const { data: result, error } = await db.rpc("upsert_live_report", {
    p_period: period, p_payload: payload, p_hash: hash,
    p_filed: payload.coverage.filed, p_total: payload.coverage.total, p_valuation_as_of: valuationAsOf,
  });
  if (error) throw new Error(`upsert_live_report 失败: ${error.message}`);
  console.log(`[report] ${period}: ${result} · 覆盖 ${payload.coverage.filed}/${payload.coverage.total}`);
  setActionOutput("report_changed", result === "inserted" || result === "updated" ? "true" : "false");

  const row = await readReport(db, period);
  if (!row || row.status !== "live" || row.previewSentAt) return;
  if (!reportReadiness(row, new Date()).ready) return;
  await sendPreview(db, row, row.payload, row.valuationAsOf);
  console.log(`[report] ${period}: 已满足定稿条件,预览已发给站长`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
