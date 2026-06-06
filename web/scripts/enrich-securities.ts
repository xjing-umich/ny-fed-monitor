/** CUSIP→ticker 富化入口: 读仓库根 .env.local, 调 enrichSecurities。用法: npm run enrich */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { enrichSecurities } from "./lib/enrichSecurities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local"); // web/scripts → repo root
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return { ...out, ...process.env } as Record<string, string>;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });
  const stats = await enrichSecurities(db, env.OPENFIGI_API_KEY);
  console.log(`完成: 处理 ${stats.total}, 解析 ${stats.resolved}, 未解析 ${stats.unresolved}, 跳过批次 ${stats.skippedBatches}`);
  if (stats.skippedBatches > 0) console.warn(`⚠ 有 ${stats.skippedBatches} 个批次因错误跳过, 建议重跑 npm run enrich 补齐。`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
