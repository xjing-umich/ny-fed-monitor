/**
 * valuation-ingest.ts — 物化每 ticker 的估值位置档判定到 valuation_snapshot。
 * 用法: cd web && npm run valuation:ingest(本地读仓库根 .env.local;CI 用 env)。
 *
 * Universe = 所有被追踪投资人最新持仓的 ticker 并集(= 任何持仓表可能出现的全集)。
 * 逐 ticker 复用个股页同一编排: getSecCompanyData → computeValuationFloor → strikeZone →
 * oeDcf → reconcile → deriveValuationVerdict。可估值才入表;不可估值跳过(读取侧缺行=" —")。
 * 这是**唯一**批量算估值的地方 —— 投资人页只读快照, 故 SSG 构建期零额外 SEC 计算。
 *
 * 注: 本脚本经 `--tsconfig scripts/tsconfig.json` 跑(见 npm script), 该 tsconfig 把 `server-only`
 * 桩成空模块——价格/国债/管理人/证券读取器(priceRead/treasuryRead/source/securities)都 `import
 * "server-only"`, 而 Next 在构建期才别名它、tsx 运行期无法解析。桩仅作用于脚本运行, 不碰 app 构建
 * 的 RSC 边界(Next 仍用根 tsconfig 的真 server-only)。
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import { getCusipMap } from "@/lib/managers/securities";
import { isLikelyTicker } from "@/lib/externalLinks";
import { getSecCompanyData } from "@/lib/sec/read";
import {
  fundamentalsToFloorInput,
  computeValuationFloor,
  deriveStrikeZone,
  deriveOeDcf,
  reconcileMethods,
  deriveValuationVerdict,
} from "@/lib/valuation";
import { getLatestPrice } from "@/lib/managers/priceRead";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";

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

// 枚举所有被追踪投资人最新持仓涉及的 ticker(去重、仅 ticker 形态)。
async function collectUniverse(): Promise<string[]> {
  const idx = await getManagerIndex();
  const cusipMap = await getCusipMap();
  const cusipToTicker = new Map<string, string>();
  for (const [cusip, info] of cusipMap)
    if (info.ticker && isLikelyTicker(info.ticker)) cusipToTicker.set(cusip, info.ticker.toUpperCase());

  const tickers = new Set<string>();
  for (const m of idx.managers) {
    const d = await getManagerDetail(m.slug);
    if (!d?.latest) continue;
    for (const h of d.latest.holdings) {
      const tk = cusipToTicker.get(h.cusip);
      if (tk) tickers.add(tk);
    }
  }
  return Array.from(tickers).sort();
}

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  const universe = await collectUniverse();
  console.log(`Universe: ${universe.length} tickers(持仓并集)`);
  const dgs10 = await getLatestDgs10(); // 全局共享, 取一次
  const computedAt = new Date().toISOString();

  let valued = 0, skipped = 0;
  const rows: Record<string, unknown>[] = [];
  for (const ticker of universe) {
    try {
      const sec = await getSecCompanyData(ticker);
      // company_name 不影响判定(仅卡片 who 前缀用), 投资人页只读 verdict, 故传 ticker 即可。
      const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual);
      const floor = computeValuationFloor(floorInput);
      if (!floor || floor.kind !== "floor") { skipped++; continue; }
      const price = await getLatestPrice(ticker);
      const strikeZone = deriveStrikeZone(floor, price);
      const oeDcf = deriveOeDcf(floor, floorInput.years, dgs10, price);
      const reconciliation = reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, price);
      const v = deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation });
      if (!v) { skipped++; continue; }
      rows.push({
        ticker,
        verdict_bucket: v.bucket,
        in_strike_zone: v.inStrikeZone,
        range_lo: v.rangeLo,
        range_hi: v.rangeHi,
        price: v.price,
        price_date: v.priceDate || null,
        margin_pct: v.marginPct,
        coverage: v.coverage,
        reliable: v.reliable,
        computed_at: computedAt,
        payload: v,
        updated_at: computedAt,
      });
      valued++;
    } catch (err) {
      skipped++;
      console.error(`  ${ticker} 跳过: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 批量 upsert(分批避免单请求过大)。
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from("valuation_snapshot").upsert(rows.slice(i, i + BATCH), { onConflict: "ticker" });
    if (error) throw new Error(`valuation_snapshot upsert 失败: ${error.message}`);
  }
  console.log(`估值快照完成: 入表 ${valued}, 跳过 ${skipped}(无估值/多股权/薄数据), computed_at ${computedAt}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
