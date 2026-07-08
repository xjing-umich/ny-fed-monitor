/**
 * backfill-ads-ratio.ts — 写入 securities.ads_ratio(每 1 ADS 折合几股普通股)。
 * 仅 ADR 需要;比例经双源核定(公司存托条款 + SEC普通股/市场ADS张数自检)。幂等:直接 upsert 覆盖。
 * 需先跑 20260708_add_ads_ratio migration。
 * Run: cd web && npx tsx scripts/backfill-ads-ratio.ts
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}

// 每 1 ADS 折合几股普通股。双源核定(见 plan Task 8 表);改数前重新查证。
const ADS_RATIO: Record<string, number> = {
  PDD: 4, JD: 2, NTES: 5, EDU: 10, WB: 1, NICE: 1, QFIN: 2, BEKE: 3, SIMO: 4,
  TCOM: 1, VALE: 1, ARM: 1, HTHT: 10, JOYY: 20, NOAH: 5, ATAT: 3, FINV: 5, HDB: 3, FMS: 0.5,
};

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  let ok = 0, missing: string[] = [], mismatch: string[] = [];
  for (const [ticker, ratio] of Object.entries(ADS_RATIO)) {
    // 只更新已存在且确为 ADR 的行(防呆:写错票不留脏数据)。
    const { data: row } = await db.from("securities").select("ticker,security_type").eq("ticker", ticker).maybeSingle();
    if (!row) { missing.push(ticker); continue; }
    if (row.security_type !== "ADR") { mismatch.push(`${ticker}(${row.security_type})`); continue; }
    const { error } = await db.from("securities").update({ ads_ratio: ratio }).eq("ticker", ticker);
    if (error) throw new Error(`${ticker} 写入失败: ${error.message}`);
    ok++;
  }
  console.log(`ads_ratio 回填 ${ok} 只`);
  if (missing.length) console.warn(`securities 无此票(跳过): ${missing.join(", ")}`);
  if (mismatch.length) console.warn(`security_type≠ADR(跳过,请核对): ${mismatch.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
