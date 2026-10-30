import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { refreshSnapshotPublication } from "./lib/valuationPublication";

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.INGEST_SECRET;
  if (!url || !key || !secret) throw new Error("Missing Supabase or ingest credentials");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });
  const result = await refreshSnapshotPublication(db, async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch("https://thecompounder.fyi/api/revalidate?source=valuation", {
          method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok || (await response.json()).ok !== true) throw new Error(`Cache revalidation failed (HTTP ${response.status})`);
        return;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  });
  console.log(`Cache refreshed; acknowledged ${result.acknowledged}/${result.pending} pending snapshot generations.`);
}
main().catch(error => { console.error("Valuation cache publication failed:", error instanceof Error ? error.message : "unknown error"); process.exitCode = 1; });
