// 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/supabaseMap.check.ts
// (supabase.ts 导入 server-only,用 scripts/tsconfig.json 的桩。)
import assert from "node:assert/strict";
import { mapSummaryRows } from "./supabase";
import { isMissingTableError } from "./db";

const m = mapSummaryRows([
  { cik: "1", latest_value: "120", prior_value: "100", latest_count: 9, prior_count: 10, count_verdict: "buying", top_moves: [{ issuer: "UBER", kind: "new" }] },
  { cik: "2", latest_value: 5, prior_value: 0, latest_count: 1, prior_count: 0, count_verdict: "mixed", top_moves: [] },
]);
assert.deepEqual(m.get("1"), { valueDeltaPct: 0.2, countDelta: -1, verdict: "buying", topMoveIssuer: "UBER", topMoveKind: "new" });
assert.deepEqual(m.get("2"), { valueDeltaPct: null, countDelta: 1, verdict: "mixed", topMoveIssuer: null, topMoveKind: null });
assert.ok(isMissingTableError({ code: "42P01" }) && isMissingTableError({ code: "PGRST205" }) && !isMissingTableError({ code: "XX000" }) && !isMissingTableError(null));
console.log("supabaseMap.check OK");
