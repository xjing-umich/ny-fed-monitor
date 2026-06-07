/**
 * Backfill securities.exchange with Google-Finance exchange codes.
 *
 * Our securities.exchange was "US" (OpenFIGI composite), which can't build a
 * Google Finance quote URL (needs TICKER:EXCHANGE, e.g. GOOG:NASDAQ). This maps
 * each ticker to its listing exchange via SEC's authoritative, current
 * company_tickers_exchange.json and writes the GF code back.
 *
 * Source: https://www.sec.gov/files/company_tickers_exchange.json (verified current at run time)
 * Run: npx tsx scripts/backfill-exchange.ts   (Node 20)
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UA = "NYFedMonitor research junlinzhu@jobright.ai";

// SEC exchange vocabulary → Google Finance exchange code. CBOE is left out
// (rare; Google Finance code is unreliable) → those fall back to Google search.
const SEC_TO_GF: Record<string, string> = {
  Nasdaq: "NASDAQ",
  NYSE: "NYSE",
  OTC: "OTCMKTS",
};

// Normalize tickers for matching: SEC uses dashes (BRK-B), our DB uses dots (BRK.B).
const norm = (t: string) => t.toUpperCase().replace(/[.\-\s]/g, "");

function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p))
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  return { ...out, ...process.env } as Record<string, string>;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });

  // 1) SEC ticker → GF exchange code
  const res = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`SEC fetch HTTP ${res.status}`);
  const sec = (await res.json()) as { fields: string[]; data: unknown[][] };
  const ti = sec.fields.indexOf("ticker");
  const ei = sec.fields.indexOf("exchange");
  const secGf = new Map<string, string>(); // norm(ticker) → GF code
  for (const row of sec.data) {
    const t = String(row[ti] ?? "");
    const gf = SEC_TO_GF[String(row[ei] ?? "")];
    if (t && gf) secGf.set(norm(t), gf);
  }
  console.log(`SEC rows mapped to GF codes: ${secGf.size}`);

  // 2) our securities tickers
  const tickers: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("securities").select("ticker").range(from, from + 999);
    if (error) throw new Error(`securities read: ${error.message}`);
    if (!data?.length) break;
    tickers.push(...data.map((r: { ticker: string }) => r.ticker).filter(Boolean));
    if (data.length < 1000) break;
  }

  // 3) group our tickers by resolved GF code
  const byCode = new Map<string, string[]>();
  let matched = 0;
  for (const t of tickers) {
    const gf = secGf.get(norm(t));
    if (!gf) continue;
    matched++;
    (byCode.get(gf) ?? byCode.set(gf, []).get(gf)!).push(t);
  }
  console.log(`our tickers: ${tickers.length}, matched: ${matched}, unmatched (→ search fallback): ${tickers.length - matched}`);

  // 4) one update per code, chunked to keep IN() filters small
  for (const [gf, list] of byCode) {
    let n = 0;
    for (const part of chunk(list, 150)) {
      const { error } = await db.from("securities").update({ exchange: gf }).in("ticker", part);
      if (error) { console.warn(`update ${gf} err: ${error.message}`); continue; }
      n += part.length;
    }
    console.log(`  ${gf}: updated ${n}`);
  }
  console.log("done.");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
