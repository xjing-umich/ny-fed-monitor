import "server-only";

export function ingestSecretConfigured(): boolean {
  return Boolean(process.env.INGEST_SECRET);
}

export function isProductionIngestRequest(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV);
}

export function isAuthorizedIngestRequest(request: Request): boolean {
  // Accept EITHER secret. Vercel Cron auto-injects `Authorization: Bearer
  // ${CRON_SECRET}` (only when CRON_SECRET is set), while manual/GitHub-Actions
  // callers use INGEST_SECRET. Accepting both removes the fragile requirement
  // that the two env vars be kept value-identical by hand — a mismatch silently
  // 401'd the macro cron for days (2026-06-08 incident).
  const secrets = [process.env.INGEST_SECRET, process.env.CRON_SECRET].filter(
    (s): s is string => Boolean(s)
  );
  if (secrets.length === 0) return !isProductionIngestRequest();
  const header = request.headers.get("authorization");
  return secrets.some((secret) => header === `Bearer ${secret}`);
}

export function unauthorizedResponse(): Response {
  return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
}
