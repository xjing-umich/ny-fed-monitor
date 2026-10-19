/**
 * 一次性:把还没有语言分组的订阅者归入 EN segment(老订阅者语言不明,首期发英文 + 中文版链接)。
 * 用法: npx tsx scripts/newsletter-backfill-segment.ts [--apply]   不带 --apply 只打印将要处理的数量。
 */
import { Resend, type Contact, type ListContactsOptions } from "resend";
import { env } from "./report";

const PAGE_SIZE = 100;
// Resend 默认限速约 2 req/s,翻页与逐个写入之间留间隔。
const GAP_MS = 600;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function listAll(resend: Resend, scope: { segmentId: string } | { audienceId: string }): Promise<Contact[]> {
  const out: Contact[] = [];
  let after: string | undefined;
  for (;;) {
    const opts: ListContactsOptions = { ...scope, limit: PAGE_SIZE, ...(after ? { after } : {}) };
    const r = await resend.contacts.list(opts);
    if (r.error) throw new Error(r.error.message);
    out.push(...r.data.data);
    if (!r.data.has_more || r.data.data.length === 0) break;
    after = r.data.data[r.data.data.length - 1].id;
    await sleep(GAP_MS);
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const apiKey = env.RESEND_AUDIENCE_API_KEY;
  const audienceId = env.RESEND_AUDIENCE_ID;
  const en = env.RESEND_SEGMENT_EN_ID;
  const zh = env.RESEND_SEGMENT_ZH_ID;
  if (!apiKey || !audienceId) throw new Error("缺 RESEND_AUDIENCE_API_KEY / RESEND_AUDIENCE_ID");
  if (!en || !zh) throw new Error("缺 RESEND_SEGMENT_EN_ID / RESEND_SEGMENT_ZH_ID");
  const resend = new Resend(apiKey);

  const tagged = new Set<string>();
  for (const segmentId of [en, zh]) {
    for (const c of await listAll(resend, { segmentId })) tagged.add(c.email.toLowerCase());
    await sleep(GAP_MS);
  }
  const all = (await listAll(resend, { audienceId }))
    .filter((c) => !c.unsubscribed)
    .map((c) => c.email.toLowerCase());
  const todo = all.filter((e) => !tagged.has(e));
  console.log(`订阅者 ${all.length},已分组 ${tagged.size},待归入 EN ${todo.length}${apply ? "" : "(dry run,加 --apply 才写入)"}`);
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
