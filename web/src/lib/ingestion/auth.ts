import "server-only";

export function ingestSecretConfigured(): boolean {
  return Boolean(process.env.INGEST_SECRET);
}

export function isProductionIngestRequest(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV);
}

export function isAuthorizedIngestRequest(request: Request): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return !isProductionIngestRequest();
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export function unauthorizedResponse(): Response {
  return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
}
