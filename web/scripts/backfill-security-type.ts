/**
 * backfill-security-type.ts — populate securities.security_type for existing rows.
 * The normal `npm run enrich` skips already-resolved CUSIPs (idempotency gate), so
 * it never backfills the new column; this script re-maps existing securities' CUSIPs
 * through OpenFIGI purely to fill security_type. Idempotent: only touches rows where
 * security_type is null.
 * Requires the 20260704_add_security_type_to_securities migration applied first.
 * Run: cd web && npx tsx scripts/backfill-security-type.ts
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { mapBatch } from "./lib/enrichSecurities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local"); // web/scripts → repo root
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });
  const apiKey = env.OPENFIGI_API_KEY;

  // securities 行(仅 security_type 未填 且 有 primary_cusip)
  const todo: { ticker: string; cusip: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("securities")
      .select("ticker,primary_cusip,security_type")
      .is("security_type", null)
      .range(from, from + 999);
    if (error) throw new Error(`securities 读取失败: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) if (r.primary_cusip) todo.push({ ticker: r.ticker, cusip: r.primary_cusip });
    if (data.length < 1000) break;
  }
  console.log(`待回填 security_type: ${todo.length} 行`);

  const batchSize = apiKey ? 100 : 10;
  const intervalMs = apiKey ? 300 : 2600;
  let filled = 0, unresolved = 0, skippedBatches = 0;
  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    let rows;
    try {
      rows = await mapBatch(batch.map((b) => ({ cusip: b.cusip, issuer: b.ticker })), apiKey);
    } catch (e) {
      console.warn(`batch ${i}-${i + batch.length} failed(跳过, 下次重试): ${e instanceof Error ? e.message : e}`);
      skippedBatches++;
      await sleep(intervalMs);
      continue;
    }
    // cusip → securityType，回写对应 securities 行(按 ticker 更新，稳过 cusip 大小写/补零歧义)
    const byCusip = new Map(rows.map((r) => [r.cusip, r.securityType]));
    for (const b of batch) {
      const st = byCusip.get(b.cusip);
      if (st) {
        const { error } = await db.from("securities").update({ security_type: st }).eq("ticker", b.ticker);
        if (error) console.warn(`update ${b.ticker} err: ${error.message}`);
        else filled++;
      } else unresolved++;
    }
    console.log(`progress ${Math.min(i + batchSize, todo.length)}/${todo.length} (filled ${filled}, unresolved ${unresolved})`);
    await sleep(intervalMs);
  }
  console.log(`回填完成: 填入 ${filled}, 无类型 ${unresolved}, 跳过批次 ${skippedBatches}`);
  if (skippedBatches > 0) console.warn(`⚠ ${skippedBatches} 个批次因错误跳过, 重跑本脚本补齐(幂等)。`);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
