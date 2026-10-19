// Resend 订阅者与语言分组(segment)的读取。backfill 脚本与群发前置检查共用,保证“谁算没分组”只有一个口径。
import type { Contact, ListContactsOptions, Resend } from "resend";

const PAGE_SIZE = 100;
// Resend 默认限速约 2 req/s,翻页之间留间隔。
export const GAP_MS = 600;
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function listAllContacts(resend: Resend, scope: { segmentId: string } | { audienceId: string }): Promise<Contact[]> {
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

/** 纯函数:仍在订阅、但不在任何语言分组里的邮箱(大小写不敏感)。 */
export function computeUntagged(
  audience: Array<Pick<Contact, "email" | "unsubscribed">>,
  segmentMembers: Array<Pick<Contact, "email">>,
): { subscribed: string[]; tagged: Set<string>; untagged: string[] } {
  const tagged = new Set(segmentMembers.map((c) => c.email.toLowerCase()));
  const subscribed = audience.filter((c) => !c.unsubscribed).map((c) => c.email.toLowerCase());
  return { subscribed, tagged, untagged: subscribed.filter((e) => !tagged.has(e)) };
}

/** 读 audience 全量与各语言 segment 成员,算出没分组的订阅者。 */
export async function findUntaggedSubscribers(
  resend: Resend,
  audienceId: string,
  segmentIds: string[],
): Promise<{ subscribed: string[]; tagged: Set<string>; untagged: string[] }> {
  const members: Contact[] = [];
  for (const segmentId of segmentIds) {
    members.push(...(await listAllContacts(resend, { segmentId })));
    await sleep(GAP_MS);
  }
  const audience = await listAllContacts(resend, { audienceId });
  return computeUntagged(audience, members);
}
