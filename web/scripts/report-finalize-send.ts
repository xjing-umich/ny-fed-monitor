/**
 * 定稿并群发。用法:
 *   npm run report:finalize -- --period=2026-09-30 --action=preview
 *   npm run report:finalize -- --period=2026-09-30 --action=finalize [--dry-run]
 * 决策全部在 planFinalize(纯函数,有测试);这里只执行。可安全重跑。
 */
import { Resend } from "resend";
import { planFinalize } from "../src/lib/reports/readiness";
import { renderReportEmail } from "../src/lib/reports/email";
import { buildQuarterlyReport } from "../src/lib/reports/build";
import { reportSlug } from "../src/lib/reports/period";
import type { ReportLang } from "../src/lib/reports/types";
import { loadReportInput } from "./lib/loadReportInput";
import { readReport } from "./lib/reportDb";
import { env, makeDb, sendPreview } from "./report";

const args = process.argv.slice(2);
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

/** 只接受 --period=YYYY-MM-DD、--action=preview|finalize、--dry-run;其它一律拒绝(避免 --dryrun 之类拼写错误变成真发送)。 */
function parseArgs(): { period: string; action: "preview" | "finalize"; dryRun: boolean } {
  let period: string | undefined;
  let action: string | undefined;
  let dryRun = false;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--period=")) period = a.slice("--period=".length);
    else if (a.startsWith("--action=")) action = a.slice("--action=".length);
    else throw new Error(`不认识的参数: ${a}(只接受 --period=YYYY-MM-DD、--action=preview|finalize、--dry-run)`);
  }
  if (!period || !/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new Error("需要 --period=YYYY-MM-DD");
  if (action !== "preview" && action !== "finalize") throw new Error("需要 --action=preview 或 --action=finalize");
  if (action === "preview" && dryRun) throw new Error("--dry-run 只用于 --action=finalize(preview 本身会记录待定稿版本)");
  return { period, action, dryRun };
}

/** 返回是否刷新成功。失败不挡群发,但最终会让进程以非零退出,提示重跑(重跑跳过已发语言、重试刷新)。 */
async function revalidateReport(): Promise<boolean> {
  if (!env.INGEST_SECRET) { console.error("缺 INGEST_SECRET,无法刷新报告页缓存"); return false; }
  try {
    const res = await fetch("https://thecompounder.fyi/api/revalidate?source=report", { method: "POST", headers: { Authorization: `Bearer ${env.INGEST_SECRET}` } });
    if (!res.ok) { console.error(`revalidate 失败: ${res.status}`); return false; }
    return true;
  } catch (e) {
    console.error(`revalidate 失败: ${(e as Error).message}`);
    return false;
  }
}

/** 记录 sends:重试 3 次(0 / 500ms / 1500ms 间隔),只写 sends 列(final 行的触发器拒绝其它改动)。 */
async function recordSend(db: any, period: string, lang: ReportLang, broadcastId: string): Promise<string | null> {
  const delays = [0, 500, 1500];
  let lastErr = "";
  for (const d of delays) {
    if (d) await new Promise((r) => setTimeout(r, d));
    try {
      const sends = { ...(await readReport(db, period))!.sends, [lang]: { broadcastId, sentAt: new Date().toISOString() } };
      const { error } = await db.from("quarterly_reports").update({ sends }).eq("period", period);
      if (!error) return null;
      lastErr = error.message;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  return lastErr;
}

async function main() {
  const { period, action, dryRun } = parseArgs();

  const db = makeDb();
  const row = await readReport(db, period);
  const plan = planFinalize(row, action, dryRun);
  console.log(`[finalize] ${period} action=${action} dryRun=${dryRun} → ${JSON.stringify(plan)}`);

  if (plan.kind === "error") throw new Error(plan.message);
  if (plan.kind === "preview") {
    const { input, valuationAsOf } = await loadReportInput(db, period);
    await sendPreview(db, row!, buildQuarterlyReport(input), valuationAsOf);
    console.log("[finalize] 新预览已发给站长");
    return;
  }

  // 发送前置条件在冻结之前检查,避免冻结后才发现发不出去。
  const sendToSegments = plan.to === "segments" && plan.sendLangs.length > 0;
  const segment: Record<ReportLang, string | undefined> = { en: env.RESEND_SEGMENT_EN_ID, zh: env.RESEND_SEGMENT_ZH_ID };
  if (sendToSegments) {
    if (!env.RESEND_AUDIENCE_API_KEY) throw new Error("缺 RESEND_AUDIENCE_API_KEY");
    for (const lang of plan.sendLangs) if (!segment[lang]) throw new Error(`缺 ${lang} segment id`);
  }
  if (plan.to === "ops" && (!env.RESEND_API_KEY || !env.RESEND_ALERTS_TO)) throw new Error("缺 RESEND_API_KEY / RESEND_ALERTS_TO,无法发 dry-run");

  if (plan.freeze) {
    const { data: ok, error } = await db.rpc("finalize_report", { p_period: period });
    if (error) throw new Error(`finalize_report 失败: ${error.message}`);
    if (!ok) throw new Error("定稿未生效(状态已变化?)— 重新读取后再试");
    console.log("[finalize] 已冻结");
  }
  // 非 dry-run 的 finalize 此时行必为 final:冻结后立刻刷新一次;发送结束后再刷新一次,让重跑能修复一次瞬时失败。
  const shouldRevalidate = !dryRun;
  let revalidateFailed = false;
  if (shouldRevalidate && plan.freeze) {
    if (await revalidateReport()) console.log("[finalize] 已刷新报告页");
    else revalidateFailed = true;
  }
  const finishRevalidate = async () => {
    if (!shouldRevalidate) return;
    if (await revalidateReport()) { revalidateFailed = false; console.log("[finalize] 已刷新报告页"); }
    else revalidateFailed = true;
    if (revalidateFailed) {
      console.error("[finalize] 报告页缓存刷新失败:群发已完成/无需发送,但公开页可能仍是旧版本。请重跑同一命令(已发语言会跳过,仅重试刷新)。");
      process.exit(1);
    }
  };
  if (plan.sendLangs.length === 0) { console.log("[finalize] 无需发送"); await finishRevalidate(); return; }

  const fresh = (await readReport(db, period))!;
  const payload = dryRun ? fresh.previewPayload : fresh.payload;
  if (!payload) throw new Error("没有可发送的 payload");
  const valuationAsOf = dryRun ? fresh.previewValuationAsOf : fresh.valuationAsOf;
  const { data: others, error: oErr } = await db.from("quarterly_reports").select("period,sends");
  if (oErr) throw new Error(`读历史发送记录失败: ${oErr.message}`);
  const priorIssues = (others ?? []).filter((r: any) => r.period !== period && Object.keys(r.sends ?? {}).length > 0).length;
  const meta = {
    status: "final" as const, coverageFiled: payload.coverage.filed, coverageTotal: payload.coverage.total,
    finalizedAt: fresh.finalizedAt ?? new Date().toISOString(), valuationAsOf,
    isFirstIssue: priorIssues === 0, postalAddress: env.NEWSLETTER_POSTAL_ADDRESS || undefined,
  };

  const from = "Compounder <newsletter@send.thecompounder.fyi>";

  for (const lang of plan.sendLangs) {
    const e = renderReportEmail(payload, meta, lang);
    if (plan.to === "ops") {
      const ops = new Resend(env.RESEND_API_KEY);
      const { error } = await ops.emails.send({ from, to: env.RESEND_ALERTS_TO, subject: `[dry-run ${lang}] ${e.subject}`, html: e.html, text: e.text });
      if (error) throw new Error(`dry-run 发送失败(${lang}): ${error.message}`);
      console.log(`[finalize] dry-run ${lang} 已发给站长`);
      continue;
    }
    const resend = new Resend(env.RESEND_AUDIENCE_API_KEY);
    const created = await resend.broadcasts.create({
      segmentId: segment[lang]!, from, replyTo: env.NEWSLETTER_REPLY_TO || undefined,
      subject: e.subject, previewText: e.previewText, html: e.html, text: e.text,
      name: `${reportSlug(period)}-${lang}`,
    });
    if (created.error || !created.data) throw new Error(`broadcast 创建失败(${lang}): ${created.error?.message}`);
    const sent = await resend.broadcasts.send(created.data.id);
    if (sent.error) throw new Error(`broadcast 发送失败(${lang}): ${sent.error.message}`);
    const recErr = await recordSend(db, period, lang, created.data.id);
    if (recErr) throw new Error(`记录发送失败(${lang}),broadcast ${created.data.id} 已发出 — 手动补记,勿重跑该语言: ${recErr}`);
    console.log(`[finalize] ${lang} 已群发 broadcast ${created.data.id}`);
  }
  await finishRevalidate();
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
