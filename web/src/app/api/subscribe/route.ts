import { Resend } from "resend";

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
      { ok: false, error: "Newsletter is not configured." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // Honeypot — silently accept bots without adding them.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return Response.json({ ok: true });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !EMAIL_RE.test(email) || email.length > 200) {
    return Response.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }

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
      return Response.json({ ok: false, error: "Failed to subscribe. Please try again." }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "Failed to subscribe. Please try again." }, { status: 502 });
  }
}
