/**
 * route.ts — GET /api/data
 *
 * Returns the full DataPayload from buildAllSections().
 *
 * Next.js 16 conventions (cacheComponents NOT enabled — using previous model):
 * - Route Handlers are not cached by default.
 * - We use `export const dynamic = 'force-dynamic'` so each request runs fresh
 *   (live financial data should not be statically prerendered).
 * - Individual fetch() calls inside sources/nyfed.ts already set
 *   next: { revalidate: 600 } for incremental static caching at the fetch level.
 * - On error, return JSON { error } with HTTP 500.
 *
 * Reference: node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
 *            node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md
 */

import { buildAllSections } from "@/lib/build";

// Opt into fully dynamic rendering — route re-runs on every request.
// Individual fetch() calls inside sources/ still use next: { revalidate }
// for incremental caching in the Next.js Data Cache.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const payload = await buildAllSections();
    return Response.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
