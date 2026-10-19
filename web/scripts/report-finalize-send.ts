/**
 * 定稿并群发。用法:
 *   npm run report:finalize -- --period=2026-09-30 --action=preview
 *   npm run report:finalize -- --period=2026-09-30 --action=finalize [--dry-run]
 *   (本地专用)--allow-past-period:允许群发不是当前季度的报告;workflow 不暴露这个开关。
 * 决策全部在 planFinalize(纯函数,有测试);这里只执行。可安全重跑:
 *   每种语言先建 broadcast 并记下 broadcastId(sentAt=null),再发送,发送成功后补 sentAt。
 *   重跑时有 broadcastId 没 sentAt 的语言先向 Resend 核实状态,绝不新建第二个 broadcast。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { planFinalize } from "../src/lib/reports/readiness";
import { renderReportEmail } from "../src/lib/reports/email";
import { buildQuarterlyReport } from "../src/lib/reports/build";
import { reportPeriodFor, reportSlug } from "../src/lib/reports/period";
import type { ReportLang, ReportSendEntry } from "../src/lib/reports/types";
import { loadReportInput } from "./lib/loadReportInput";
import { findUntaggedSubscribers } from "./lib/newsletterSegments";
import { countPriorIssues, readReport } from "./lib/reportDb";
import { env, makeDb, sendPreview } from "./report";

type Args = { period: string; action: "preview" | "finalize"; dryRun: boolean; allowPastPeriod: boolean };

/** 只接受 --period=YYYY-MM-DD、--action=preview|finalize、--dry-run、--allow-past-period;其它一律拒绝(避免 --dryrun 之类拼写错误变成真发送)。 */
function parseArgs(args: string[]): Args {
  let period: string | undefined;
  let action: string | undefined;
  let dryRun = false;
  let allowPastPeriod = false;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--allow-past-period") allowPastPeriod = true;
    else if (a.startsWith("--period=")) period = a.slice("--period=".length);
    else if (a.startsWith("--action=")) action = a.slice("--action=".length);
    else throw new Error(`不认识的参数: ${a}(只接受 --period=YYYY-MM-DD、--action=preview|finalize、--dry-run、--allow-past-period)`);
  }
  if (!period || !/^\d{4}-\d{2}-\d{2}$/.test(period)) throw new Error("需要 --period=YYYY-MM-DD");
  if (action !== "preview" && action !== "finalize") throw new Error("需要 --action=preview 或 --action=finalize");
  if (action === "preview" && dryRun) throw new Error("--dry-run 只用于 --action=finalize(preview 本身会记录待定稿版本)");
  return { period, action, dryRun, allowPastPeriod };
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

/** 写 sends[lang]:重试 3 次(0 / 500ms / 1500ms 间隔),只写 sends 列(final 行的触发器拒绝其它改动)。返回错误信息或 null。 */
async function recordSend(db: SupabaseClient, period: string, lang: ReportLang, entry: ReportSendEntry): Promise<string | null> {
  const delays = [0, 500, 1500];
  let lastErr = "";
  for (const d of delays) {
    if (d) await new Promise((r) => setTimeout(r, d));
    try {
      const current = await readReport(db, period);
      if (!current) throw new Error("报告行不存在");
      const sends = { ...current.sends, [lang]: entry };
      const { error } = await db.from("quarterly_reports").update({ sends }).eq("period", period);
      if (!error) return null;
      lastErr = error.message;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  return lastErr;
}

/** 已有 broadcastId、未记 sentAt:Resend 侧已不是草稿 → 只补记;仍是草稿 → 发送这一个(不新建)。 */
async function verifyAndComplete(resend: Resend, db: SupabaseClient, period: string, lang: ReportLang, broadcastId: string): Promise<void> {
  const got = await resend.broadcasts.get(broadcastId);
  if (got.error || !got.data) throw new Error(`核实 broadcast 失败(${lang}) ${broadcastId}: ${got.error?.message}`);
  if (got.data.status !== "draft") {
    const recErr = await recordSend(db, period, lang, { broadcastId, sentAt: got.data.sent_at ?? new Date().toISOString() });
    if (recErr) throw new Error(`broadcast ${broadcastId} 已是 ${got.data.status},补记 sentAt 失败(${lang}):重跑会再次核实,不会重发: ${recErr}`);
    console.log(`[finalize] ${lang} broadcast ${broadcastId} 在 Resend 侧已是 ${got.data.status} → 补记 sentAt,不重发`);
    return;
  }
  const sent = await resend.broadcasts.send(broadcastId);
  if (sent.error) throw new Error(`broadcast 发送失败(${lang}) ${broadcastId}: ${sent.error.message}(重跑会再次核实状态)`);
  const recErr = await recordSend(db, period, lang, { broadcastId, sentAt: new Date().toISOString() });
  if (recErr) throw new Error(`broadcast ${broadcastId} 已发出,记录 sentAt 失败(${lang}):重跑会核实状态并补记,不会重发: ${recErr}`);
  console.log(`[finalize] ${lang} 草稿 broadcast ${broadcastId} 已发送`);
}

async function main() {
  const { period, action, dryRun, allowPastPeriod } = parseArgs(process.argv.slice(2));

  const db = makeDb();
  const row = await readReport(db, period);
  const plan = planFinalize(row, action, dryRun, { currentPeriod: reportPeriodFor(new Date()), allowPastPeriod });
  console.log(`[finalize] ${period} action=${action} dryRun=${dryRun} → ${JSON.stringify(plan)}`);

  if (plan.kind === "error") throw new Error(plan.message);
  if (plan.kind === "preview") {
    const { input, valuationAsOf } = await loadReportInput(db, period);
    await sendPreview(db, row!, buildQuarterlyReport(input), valuationAsOf);
    console.log("[finalize] 新预览已发给站长");
    return;
  }

  // 发送前置条件在冻结之前检查,避免冻结后才发现发不出去。
  const segment: Record<ReportLang, string | undefined> = { en: env.RESEND_SEGMENT_EN_ID, zh: env.RESEND_SEGMENT_ZH_ID };
  const testSegment = env.RESEND_SEGMENT_TEST_ID || undefined;
  if (plan.to === "segments" && plan.sendLangs.length + plan.verifyLangs.length > 0) {
    if (!env.RESEND_AUDIENCE_API_KEY) throw new Error("缺 RESEND_AUDIENCE_API_KEY");
    for (const lang of plan.sendLangs) if (!segment[lang]) throw new Error(`缺 ${lang} segment id`);
  }
  if (plan.to === "segments" && plan.sendLangs.length > 0) {
    // 群发只发给 EN/ZH 两个 segment:没有语言分组的订阅者会静默收不到。
    if (!env.RESEND_AUDIENCE_ID) throw new Error("缺 RESEND_AUDIENCE_ID,无法核对未分组的订阅者");
    if (!segment.en || !segment.zh) throw new Error("缺 RESEND_SEGMENT_EN_ID / RESEND_SEGMENT_ZH_ID,无法核对未分组的订阅者");
    const { untagged } = await findUntaggedSubscribers(new Resend(env.RESEND_AUDIENCE_API_KEY), env.RESEND_AUDIENCE_ID, [segment.en, segment.zh]);
    if (untagged.length > 0) {
      throw new Error(`${untagged.length} 位订阅者没有语言分组,群发会漏掉他们:先运行 npx tsx scripts/newsletter-backfill-segment.ts --apply`);
    }
    console.log("[finalize] 订阅者均已分组");
  }
  if (plan.to === "ops") {
    if (testSegment) {
      if (!env.RESEND_AUDIENCE_API_KEY) throw new Error("缺 RESEND_AUDIENCE_API_KEY,无法向测试 segment 发 dry-run broadcast");
    } else {
      if (!env.RESEND_API_KEY || !env.RESEND_ALERTS_TO) throw new Error("缺 RESEND_API_KEY / RESEND_ALERTS_TO,无法发 dry-run");
      console.warn("[finalize] 警告:未配置 RESEND_SEGMENT_TEST_ID,dry-run 改用普通邮件发给站长。退订链接会显示为字面量 {{{RESEND_UNSUBSCRIBE_URL}}},replyTo / previewText 也没经过 broadcast 路径验证。");
    }
  }

  if (plan.freeze) {
    const { data: ok, error } = await db.rpc("finalize_report", { p_period: period });
    if (error) throw new Error(`finalize_report 失败: ${error.message}`);
    if (!ok) throw new Error("定稿未生效(状态已变化?),重新读取后再试");
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
  if (plan.sendLangs.length === 0 && plan.verifyLangs.length === 0) { console.log("[finalize] 无需发送"); await finishRevalidate(); return; }

  const audience = env.RESEND_AUDIENCE_API_KEY ? new Resend(env.RESEND_AUDIENCE_API_KEY) : null;

  // 先收尾上次中断的语言(只核实/发送已有的 broadcast)。
  if (plan.verifyLangs.length) {
    const cur = (await readReport(db, period))!;
    for (const lang of plan.verifyLangs) {
      const entry = cur.sends[lang];
      if (!entry) throw new Error(`内部错误:${lang} 在 verifyLangs 但没有 sends 记录`);
      await verifyAndComplete(audience!, db, period, lang, entry.broadcastId);
    }
  }
  if (plan.sendLangs.length === 0) { await finishRevalidate(); return; }

  const fresh = (await readReport(db, period))!;
  const payload = dryRun ? fresh.previewPayload : fresh.payload;
  if (!payload) throw new Error("没有可发送的 payload");
  const valuationAsOf = dryRun ? fresh.previewValuationAsOf : fresh.valuationAsOf;
  const meta = {
    status: "final" as const, coverageFiled: payload.coverage.filed, coverageTotal: payload.coverage.total,
    finalizedAt: fresh.finalizedAt ?? new Date().toISOString(), valuationAsOf,
    isFirstIssue: (await countPriorIssues(db, period)) === 0, postalAddress: env.NEWSLETTER_POSTAL_ADDRESS || undefined,
  };

  const from = "Compounder <newsletter@send.thecompounder.fyi>";
  const replyTo = env.NEWSLETTER_REPLY_TO || undefined;

  for (const lang of plan.sendLangs) {
    const e = renderReportEmail(payload, meta, lang);
    if (plan.to === "ops") {
      if (testSegment) {
        // 走真实 broadcast 路径(退订占位符、replyTo、previewText 都会被 Resend 真正处理),只是 segment 换成只含站长的测试分组;不写库。
        const created = await audience!.broadcasts.create({
          segmentId: testSegment, from, replyTo,
          subject: `[dry-run ${lang}] ${e.subject}`, previewText: e.previewText, html: e.html, text: e.text,
          name: `${reportSlug(period)}-${lang}-dryrun`,
        });
        if (created.error || !created.data) throw new Error(`dry-run broadcast 创建失败(${lang}): ${created.error?.message}`);
        const sent = await audience!.broadcasts.send(created.data.id);
        if (sent.error) throw new Error(`dry-run broadcast 发送失败(${lang}): ${sent.error.message}`);
        console.log(`[finalize] dry-run ${lang} 已发到测试 segment(broadcast ${created.data.id})`);
      } else {
        const ops = new Resend(env.RESEND_API_KEY);
        const { error } = await ops.emails.send({ from, to: env.RESEND_ALERTS_TO, replyTo, subject: `[dry-run ${lang}] ${e.subject}`, html: e.html, text: e.text });
        if (error) throw new Error(`dry-run 发送失败(${lang}): ${error.message}`);
        console.log(`[finalize] dry-run ${lang} 已发给站长`);
      }
      continue;
    }

    const created = await audience!.broadcasts.create({
      segmentId: segment[lang]!, from, replyTo,
      subject: e.subject, previewText: e.previewText, html: e.html, text: e.text,
      name: `${reportSlug(period)}-${lang}`,
    });
    if (created.error || !created.data) throw new Error(`broadcast 创建失败(${lang}): ${created.error?.message}`);
    const id = created.data.id;
    // 先记 broadcastId 再发送:记不下来就不发(草稿无害),之后任何中断重跑都只会核实这一个 broadcast。
    const markErr = await recordSend(db, period, lang, { broadcastId: id, sentAt: null });
    if (markErr) throw new Error(`记录 broadcastId 失败(${lang}),尚未发送;草稿 ${id} 可在 Resend 后台删除,重跑会新建: ${markErr}`);
    const sent = await audience!.broadcasts.send(id);
    if (sent.error) throw new Error(`broadcast 发送失败(${lang}) ${id}: ${sent.error.message}(重跑会先核实该 broadcast 状态,不会重复发送)`);
    const recErr = await recordSend(db, period, lang, { broadcastId: id, sentAt: new Date().toISOString() });
    if (recErr) throw new Error(`broadcast ${id} 已发出,记录 sentAt 失败(${lang}):重跑会核实状态并补记,不会重发: ${recErr}`);
    console.log(`[finalize] ${lang} 已群发 broadcast ${id}`);
  }
  await finishRevalidate();
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
