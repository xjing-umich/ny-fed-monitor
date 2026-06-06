import { Resend } from "resend";

export const dynamic = "force-dynamic";

// Visitor-facing contact form → forwards to a private inbox via Resend.
// The recipient address lives only in env (CONTACT_TO_EMAIL); it is never
// shipped to the client, so the owner's email is never exposed on the site.

const TO_EMAIL = process.env.CONTACT_TO_EMAIL;
// Until a sending domain is verified in Resend, the only usable `from` is
// onboarding@resend.dev (and Resend will only deliver to the account owner).
const FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || "Compounder <onboarding@resend.dev>";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !TO_EMAIL) {
    return Response.json(
      { ok: false, error: "Contact form is not configured." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: bots fill hidden fields. Silently accept to avoid signalling.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return Response.json({ ok: true });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }
  if (message.length < 5) {
    return Response.json({ ok: false, error: "Message is too short." }, { status: 400 });
  }
  if (name.length > 200 || email.length > 200 || message.length > 5000) {
    return Response.json({ ok: false, error: "Input too long." }, { status: 400 });
  }

  const displayName = name || "(no name)";
  const resend = new Resend(apiKey);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      replyTo: email, // reply goes straight back to the visitor
      subject: `[Compounder] Contact from ${displayName}`,
      text: `Name: ${displayName}\nEmail: ${email}\n\n${message}`,
    });

    if (error) {
      return Response.json({ ok: false, error: "Failed to send. Please try again." }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "Failed to send. Please try again." }, { status: 502 });
  }
}
