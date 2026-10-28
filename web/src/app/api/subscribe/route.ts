import { Resend } from "resend";
import { normalizeLang } from "./lang";

export const dynamic = "force-dynamic";

// Newsletter signup → adds the email as a contact in a Resend Audience.
// Managing audiences requires a full-access Resend key, which is kept separate
// from the send-only RESEND_API_KEY used by the public contact form.

const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const API_KEY = process.env.RESEND_AUDIENCE_API_KEY;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request): Promise<Response> {
  if (!API_KEY || !AUDIENCE_ID) {
    return Response.json(
      { ok: false, code: "not_configured", error: "Newsletter is not configured." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, code: "bad_request", error: "Invalid request." }, { status: 400 });
  }

  // Honeypot — silently accept bots without adding them.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return Response.json({ ok: true });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !EMAIL_RE.test(email) || email.length > 200) {
    return Response.json({ ok: false, code: "invalid_email", error: "A valid email is required." }, { status: 400 });
  }

  const lang = normalizeLang(body.lang);
  const segmentId = lang === "zh" ? process.env.RESEND_SEGMENT_ZH_ID : process.env.RESEND_SEGMENT_EN_ID;
  const otherSegmentId = lang === "zh" ? process.env.RESEND_SEGMENT_EN_ID : process.env.RESEND_SEGMENT_ZH_ID;
  const resend = new Resend(API_KEY);
  try {
    const { error } = await resend.contacts.create({
      email,
      audienceId: AUDIENCE_ID,
      unsubscribed: false,
    });
    // Resend treats an existing contact as a soft error; we still report success
    // so repeat subscribers see a friendly confirmation.
    if (error && !/already exists/i.test(error.message ?? "")) {
      return Response.json({ ok: false, code: "send_failed", error: "Failed to subscribe. Please try again." }, { status: 502 });
    }
    // 语言分组是尽力而为:任何失败(含抛错)都不影响订阅成功;没有分组的联系人按 EN 处理(见 newsletter-backfill-segment)。
    try {
      if (!segmentId) {
        console.warn(`[subscribe] RESEND_SEGMENT_${lang.toUpperCase()}_ID not configured; contact left unsegmented`);
      } else {
        const seg = await resend.contacts.segments.add({ email, segmentId });
        const added = !seg.error || /already/i.test(seg.error.message ?? "");
        if (!added) console.error(`[subscribe] segment add 失败: ${seg.error?.message}`);
        // 以最后一次订阅的语言为准:加入新语言分组后,把联系人移出另一种语言的分组,避免收到两封。
        if (added && otherSegmentId && otherSegmentId !== segmentId) {
          const rm = await resend.contacts.segments.remove({ email, segmentId: otherSegmentId });
          if (rm.error && !/not found|not in|not part|does not exist|no such/i.test(rm.error.message ?? "")) {
            console.error(`[subscribe] segment remove 失败: ${rm.error.message}`);
          }
        }
      }
    } catch (e) {
      console.error(`[subscribe] segment 异常: ${e instanceof Error ? e.message : "unknown"}`);
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, code: "send_failed", error: "Failed to subscribe. Please try again." }, { status: 502 });
  }
}
