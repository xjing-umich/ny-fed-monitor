/**
 * structural-growth-calibrate.ts — 层③(增长率引擎)只读校准脚本。
 *
 * 背景:OE-DCF 的 g1 = min(gRaw 营收log回归, gFund=ROIC×净再投资率, cagr) 受 grade cap 封顶。
 * gFund 对近零再投资的轻资产 franchise(MA/SPGI 等)结构性≈0 → 经 Math.min 把已证实增长盖成 0
 * → 护城河把 CAP 拉到 20 年却施加在零增长流上。修法:非金融 franchise 且 structural_confidence
 * ≥ 门槛时,把 gFund 从 g1 候选剔除(改用已证实的 gRaw/cagr,仍受 grade cap + declined 闸)。
 *
 * 本脚本对「被追踪投资人最新持仓」全宇宙,统计该门槛下:哪些 franchise 的 g1 被 gFund 归零/压低、
 * 剔除后 g1 变成多少、structural_confidence 分布如何 —— 给门槛定 provenance,并确认不给
 * 顺周期股(低 s)过度计入峰值增长。只读:不写库,不改任何表。
 *
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/structural-growth-calibrate.ts > /tmp/sgcal.ndjson
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
import { fundamentalsToFloorInput, computeValuationFloor, resolveAds } from "@/lib/valuation";
import { historicalGrowthBaseRate } from "@/lib/valuation/growthBaseRate";

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

function netIncomeCagr(years: { fiscal_year: number; net_income?: number }[]): number | undefined {
  const s = years.filter((y) => y.net_income != null).sort((a, b) => a.fiscal_year - b.fiscal_year);
  if (s.length < 2) return undefined;
  const a = s[0].net_income as number, b = s[s.length - 1].net_income as number, n = s.length - 1;
  if (!(a > 0) || !(b > 0)) return undefined;
  return Math.pow(b / a, 1 / n) - 1;
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

const FR = 0.20, MOD = 0.07, NONE = 0.05;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  const universe = await collectUniverse();
  console.error(`Universe: ${universe.length} tickers`);

  const secTypeMap = new Map<string, string | null>();
  const adsRatioMap = new Map<string, number | null>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("securities").select("ticker,security_type,ads_ratio").order("ticker", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`securities 读取失败: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      const tk = String(r.ticker).toUpperCase();
      secTypeMap.set(tk, (r.security_type as string | null) ?? null);
      adsRatioMap.set(tk, (r.ads_ratio as number | null) ?? null);
    }
    if (data.length < 1000) break;
  }

  // 门槛候选:对每个 franchise 记录在各门槛下是否被放行 + g1 变化,供选点。
  const THRESHOLDS = [0.4, 0.5, 0.6, 0.7, 0.8];
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
        const fi = fundamentalsToFloorInput(ticker, ticker, sec.annual, ads.ratio, sic);
        const floor = computeValuationFloor(fi);
        if (!floor || floor.kind !== "floor") continue;
        const grade = floor.moat_cap?.grade;
        const isFranchise = grade === "strong" || grade === "moderate";
        if (!isFranchise) continue; // 只关心 franchise（本修法只动 franchise）
        const isFin = floor.is_financial === true;
        const s = floor.structural_confidence;
        const gRaw = historicalGrowthBaseRate(fi.years);
        const gFund = floor.sustainable_growth;
        const wy = fi.years.filter((y) => floor.buffett_epv.method.years_used.includes(y.fiscal_year));
        const cagr = netIncomeCagr(wy.length >= 2 ? wy : fi.years);
        const declined = cagr != null && cagr < 0;
        const cap = grade === "strong" ? FR : isFin ? MOD : grade === "moderate" ? MOD : NONE;
        const cagrFb = cagr != null && cagr > 0 ? cagr : undefined;
        const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
        const curCand = [gRaw, gFund, cagrFb].filter(num);
        const curG1 = declined ? 0 : curCand.length ? clamp(Math.min(...curCand), 0, cap) : 0;
        // 剔除 gFund 后(仅非金融 franchise 参与本修法;金融走 SGR，不动）
        const propCand = [gRaw, cagrFb].filter(num);
        const propG1 = declined ? 0 : propCand.length ? clamp(Math.min(...propCand), 0, cap) : 0;
        const row = {
          ticker, grade, isFin, s, gRaw, gFund, cagr, cap, declined, curG1, propG1,
          delta: propG1 - curG1,
          passes: Object.fromEntries(THRESHOLDS.map((t) => [t, !isFin && s != null && s >= t])),
        };
        console.log(JSON.stringify(row));
      } catch {
        // 单票失败跳过（只读校准，容错）
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.error("done");
}

main().catch((e) => { console.error(e); process.exit(1); });
