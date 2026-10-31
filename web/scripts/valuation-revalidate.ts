import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { assertPublicationBinding } from "./lib/trackingPublication";
import { refreshSnapshotPublication } from "./lib/valuationPublication";

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.INGEST_SECRET;
  if (!url || !key || !secret)
    throw new Error("Missing Supabase or ingest credentials");
  const origin = process.env.VALUATION_APP_ORIGIN || "https://thecompounder.fyi";
  // Alternate environments require an explicit trusted app/backend pair.
  if (process.env.VALUATION_APP_ORIGIN || process.env.VALUATION_PUBLICATION_BINDING) {
    if (!process.env.VALUATION_PUBLICATION_BINDING) throw new Error("Publication binding required");
    assertPublicationBinding(origin,url,JSON.parse(process.env.VALUATION_PUBLICATION_BINDING));
  }
  const db = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });
  const result = await refreshSnapshotPublication(db, async (tickers) => {
    for (let offset = 0; offset < Math.max(1, tickers.length); offset += 500) {
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await fetch(
            new URL("/api/revalidate?source=valuation",origin),
            {
              method: "POST",
              redirect: "error",
              headers: {
                Authorization: `Bearer ${secret}`,
                ...(tickers.length
                  ? { "Content-Type": "application/json" }
                  : {}),
              },
              ...(tickers.length
                ? {
                    body: JSON.stringify({
                      tickers: tickers.slice(offset, offset + 500),
                    }),
                  }
                : {}),
              signal: AbortSignal.timeout(60_000),
            },
          );
          if (!response.ok || (await response.json()).ok !== true)
            throw new Error(
              `Cache revalidation failed (HTTP ${response.status})`,
            );
          break;
        } catch (error) {
          if (attempt === 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  });
  console.log(
    `Cache invalidation requested; acknowledged ${result.acknowledged}/${result.pending} legacy snapshot markers. Tracking confirmation requires rendered page verification.`,
  );
}
main().catch((error) => {
  console.error(
    "Valuation cache publication failed:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exitCode = 1;
});
