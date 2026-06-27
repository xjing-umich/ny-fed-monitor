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

  // 数据新鲜度护栏(守 CLAUDE.md 铁律:外部数据必须标注来源/日期、不用过时数据)。
  // 整本估值的 DCF 都锚到这一个 DGS10 快照 —— 若它过期/缺失,全书贴现率一起漂。
  // 这里显式标注它的值与 as-of 日期,并在 >10 个日历日(节假日+周末的宽容上限)时高声告警。
  if (!dgs10) {
    console.warn("⚠ DGS10 不可用(FRED 取数失败/超时)→ 全书 DCF 退化到 9–11% fallback 带(未锚活国债)。");
  } else {
    const ageDays = Math.floor((Date.parse(computedAt) - Date.parse(`${dgs10.date}T00:00:00Z`)) / 86_400_000);
    const tag = `DGS10 锚: ${dgs10.value.toFixed(2)}% (10Y 国债, FRED, as-of ${dgs10.date}, ${ageDays} 日前)`;
    if (ageDays > 10) console.warn(`⚠ ${tag} —— 已超 10 日,疑似过期,贴现率可能偏离当下;建议先刷新 FRED 再 ingest。`);
    else console.log(tag);
  }

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

  // 清理陈旧行:本轮 universe 里尝试过、但算不出估值(翻转为不可估值/被引擎闸抑制,如周期股
  // 最新年转亏 → #2 压到亏损 → 不可估值)的 ticker,其旧行必须删除 —— upsert 只覆盖不删,
  // 否则会留下上一轮的陈旧价值带(AMR/ATKR 那种"打一折"幻觉就是这么残留的)。只删本轮
  // 尝试过的(universe ∩ 未写入),不碰本轮 universe 之外的行。
  const written = new Set(rows.map((r) => r.ticker as string));
  const stale = universe.filter((t) => !written.has(t));
  let deleted = 0;
  for (let i = 0; i < stale.length; i += BATCH) {
    const { error, count } = await db
      .from("valuation_snapshot")
      .delete({ count: "exact" })
      .in("ticker", stale.slice(i, i + BATCH));
    if (error) throw new Error(`valuation_snapshot 陈旧行删除失败: ${error.message}`);
    deleted += count ?? 0;
  }
  console.log(`估值快照完成: 入表 ${valued}, 跳过 ${skipped}(无估值/多股权/薄数据), 清理陈旧 ${deleted}, computed_at ${computedAt}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
