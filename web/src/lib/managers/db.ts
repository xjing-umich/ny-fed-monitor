import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Accept either our own var names or the ones the Vercel↔Supabase integration injects.
export function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}
export function supabaseServiceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function hasSupabaseEnv(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

let _client: SupabaseClient | null = null;

// Lazy: never throws at import time (so `next build` works without creds).
export function getDb(): SupabaseClient {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase env not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  }
  if (!_client) {
    _client = createClient(supabaseUrl()!, supabaseServiceKey()!, {
      auth: { persistSession: false },
      // We never use Realtime; pass a WebSocket impl so supabase-js doesn't throw
      // on Node 20 (no global WebSocket).
      realtime: { transport: WebSocket as unknown as never },
    });
  }
  return _client;
}
