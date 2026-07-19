/**
 * leverage-premium-calibrate.ts — Task 8 只读校准脚本(spec §5)。
 *
 * 对「被追踪投资人最新持仓」全宇宙每只 ticker,跑**真引擎**
 * (fundamentalsToFloorInput → computeValuationFloor → deriveStrikeZone → deriveOeDcf →
 * reconcileMethods → deriveValuationVerdict),原样照抄 valuation-ingest.ts 的编排 —— 不手写
 * SQL,不重算杠杆数学。
 *
 * 只读:不写 valuation_snapshot,不改任何表。输出一行 JSON 到 stdout(NDJSON),供
 * 上层脚本 diff 两次跑(改动前 vs 改动后)。
 *
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/leverage-premium-calibrate.ts > /tmp/after.ndjson
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import { getCusipMap } from "@/lib/managers/securities";
import { isLikelyTicker } from "@/lib/externalLinks";
import { isOperatingSecurity } from "@/lib/securities/openfigi";
import { getSecCompanyData } from "@/lib/sec/read";
import {
  fundamentalsToFloorInput,
  computeValuationFloor,
  deriveStrikeZone,
  deriveOeDcf,
  reconcileMethods,
  deriveValuationMethods,
  deriveValuationVerdict,
  resolveAds,
  isFundamentalsStale,
} from "@/lib/valuation";
import { getLatestPrice } from "@/lib/managers/priceRead";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}

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
  console.error(`Universe: ${universe.length} tickers(持仓并集)`);

  const secTypeMap = new Map<string, string | null>();
  const adsRatioMap = new Map<string, number | null>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("securities")
      .select("ticker,security_type,ads_ratio")
      .order("ticker", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`securities 读取失败: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      const tk = String(r.ticker).toUpperCase();
      secTypeMap.set(tk, (r.security_type as string | null) ?? null);
      adsRatioMap.set(tk, (r.ads_ratio as number | null) ?? null);
    }
    if (data.length < 1000) break;
  }
  // 只读:不调用 persistDgs10()(会写 market_rates)—— 只读已持久化的 last-good/live 值。
  const dgs10 = await getLatestDgs10();
  if (!dgs10) console.error("DGS10 不可用 → 本轮贴现带未锚定");
  const computedAt = new Date().toISOString();

  let n = 0;
  // 全部 per-ticker I/O 都是 Supabase 读(sec/read + priceRead),无 SEC API 速率限制 →
  // 用小并发池把 1900 只票的串行往返压缩掉。纯读,不改任何判定。
  const CONCURRENCY = 8;
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
    const ticker = universe[cursor++];
    if (ticker === undefined) return;
    if (!isOperatingSecurity(secTypeMap.get(ticker))) continue;
    const ads = resolveAds(secTypeMap.get(ticker), adsRatioMap.get(ticker));
    if (ads.suppressed) continue;
    try {
      const sec = await getSecCompanyData(ticker);
      if (!sec.company && !(sec.annual?.length)) continue;
      const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
      const sicNum = sicRaw == null ? undefined : Number(sicRaw);
      const sic = sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
      const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual, ads.ratio, sic);
      const floor = computeValuationFloor(floorInput);
      if (!floor || floor.kind !== "floor") continue;
      if (isFundamentalsStale(sec.annual?.[0]?.period_end ?? null, computedAt)) continue;
      const price = await getLatestPrice(ticker);
      if (price?.stale) continue;
      const strikeZone = deriveStrikeZone(floor, price);
      const oeDcf = deriveOeDcf(floor, floorInput.years, dgs10, price);
      const reconciliation = reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, price);
      const methods = deriveValuationMethods({ floor, strikeZone, oeDcf });
      const v = deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation, methods });
      if (!v) continue;

      const latest = floorInput.years[0];
      const ivMid =
        oeDcf.assessable && oeDcf.per_share_low != null && oeDcf.per_share_high != null
          ? (oeDcf.per_share_low + oeDcf.per_share_high) / 2
          : (v.rangeLo + v.rangeHi) / 2;

      const row = {
        ticker,
        sic: sic ?? null,
        is_financial: floor.is_financial ?? null,
        net_debt: latest?.net_debt ?? null,
        total_debt: latest?.total_debt ?? null,
        cash: latest?.cash ?? null,
        shareholders_equity: latest?.shareholders_equity ?? null,
        owner_earnings: floor.buffett_epv?.normalized_earnings ?? null,
        L_net_debt_to_oe: floor.net_debt_to_owner_earnings ?? null,
        net_debt_to_equity: floor.net_debt_to_equity ?? null,
        leverage_premium: floor.leverage_premium ?? null,
        high_leverage_warning: floor.high_leverage_warning ?? null,
        moat_cap_grade: floor.moat_cap?.grade ?? null,
        reliable: v.reliable,
        bucket: v.bucket,
        in_strike_zone: v.inStrikeZone,
        price: v.price,
        iv_mid: ivMid,
        range_lo: v.rangeLo,
        range_hi: v.rangeHi,
      };
      console.log(JSON.stringify(row));
      n++;
    } catch (err) {
      console.error(`  ${ticker} 跳过: ${err instanceof Error ? err.message : String(err)}`);
    }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.error(`完成: ${n} 行(NDJSON → stdout)`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
