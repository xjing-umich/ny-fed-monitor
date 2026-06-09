import { getDb } from "@/lib/managers/db";

export function createServiceSupabaseClient() {
  return getDb();
}
