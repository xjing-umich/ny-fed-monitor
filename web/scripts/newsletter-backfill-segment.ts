/**
 * 一次性:把还没有语言分组的订阅者归入 EN segment(老订阅者语言不明,首期发英文 + 中文版链接)。
 * 用法: npx tsx scripts/newsletter-backfill-segment.ts [--apply]   不带 --apply 只打印将要处理的数量。
 */
import { Resend } from "resend";
import { env } from "./report";
import { findUntaggedSubscribers, GAP_MS, sleep } from "./lib/newsletterSegments";

async function main() {
  const apply = process.argv.includes("--apply");
  const apiKey = env.RESEND_AUDIENCE_API_KEY;
  const audienceId = env.RESEND_AUDIENCE_ID;
  const en = env.RESEND_SEGMENT_EN_ID;
  const zh = env.RESEND_SEGMENT_ZH_ID;
  if (!apiKey || !audienceId) throw new Error("缺 RESEND_AUDIENCE_API_KEY / RESEND_AUDIENCE_ID");
  if (!en || !zh) throw new Error("缺 RESEND_SEGMENT_EN_ID / RESEND_SEGMENT_ZH_ID");
  const resend = new Resend(apiKey);

  const { subscribed, tagged, untagged: todo } = await findUntaggedSubscribers(resend, audienceId, [en, zh]);
  console.log(`订阅者 ${subscribed.length},已分组 ${tagged.size},待归入 EN ${todo.length}${apply ? "" : "(dry run,加 --apply 才写入)"}`);
  if (!apply) return;

  let failed = 0;
  for (const email of todo) {
    const r = await resend.contacts.segments.add({ email, segmentId: en });
    if (r.error) {
      failed++;
      console.error(`${email}: ${r.error.message}`);
    }
    await sleep(GAP_MS);
  }
  console.log(`完成:成功 ${todo.length - failed},失败 ${failed}`);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
