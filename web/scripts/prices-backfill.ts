/** 一次性历史回填: 全 securities, 按 [Yahoo, Eastmoney] 顺序拉近 N 年日线 upsert prices。
 *  用法: npm run prices:backfill [-- 年数 单只ticker]
 *  例:   npm run prices:backfill            (全量, 默认 5 年)
 *        npm run prices:backfill -- 5 AAPL  (只回填 AAPL, 5 年) */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { defaultProviders, resolveHistory } from "../src/lib/prices/providers/index.js";

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
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const env = loadEnv();
  const years = Number(process.argv[2]) || 5;
  const only = process.argv[3]?.toUpperCase();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  let tickers: string[] = [];
  if (only) tickers = [only];
  else for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("securities").select("ticker").range(from, from + 999);
    if (error) throw new Error(`securities read: ${error.message}`);
    if (!data?.length) break;
    tickers.push(...data.map((r: { ticker: string }) => r.ticker));
    if (data.length < 1000) break;
  }

  const providers = defaultProviders();
  let totalRows = 0, done = 0, empty = 0;
  for (const ticker of tickers) {
    const hist = await resolveHistory(ticker, years, providers);
    if (hist.length) {
      const asOf = new Date().toISOString();
      const rows = hist.map((d) => ({ ticker: d.ticker, date: d.date, close: d.close, currency: d.currency, source: d.source, as_of: asOf }));
      for (let i = 0; i < rows.length; i += 1000) {
        const { error } = await db.from("prices").upsert(rows.slice(i, i + 1000), { onConflict: "ticker,date" });
        if (error) console.warn(`${ticker} upsert err: ${error.message}`);
      }
      totalRows += rows.length;
    } else empty++;
    done++;
    if (done % 50 === 0) console.log(`  进度 ${done}/${tickers.length}, 累计行 ${totalRows}, 空 ${empty}`);
    await sleep(200);
  }
  console.log(`回填完成: ticker ${tickers.length}, 写入行 ${totalRows}, 无数据 ${empty}`);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
