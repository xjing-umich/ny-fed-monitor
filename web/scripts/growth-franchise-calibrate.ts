/**
 * growth-franchise-calibrate.ts — 成长型 franchise 护城河信号（moat_via_growth）阈值全 universe 校准脚本。
 *
 * 背景:被判 moat_reading.signal === "commodity" 的票里,有一部分是靠营业利润持续复利增长
 * 撑起 franchise 特征的成长股(AMZN/ARM/EQIX 一类),现行判据只看 EPV/AV 比值,漏判成"大宗"。
 * 本脚本对「被追踪投资人最新持仓」全宇宙里所有 commodity 信号、非金融的票,内联计算：
 *   - allOpIncPositive: 全部 FY 年 operating_income 均 >0
 *   - opIncLogGrowth: 对 ln(operating_income) 做 FY log-线性回归年化斜率(算法与
 *     src/lib/valuation/growthBaseRate.ts 的 historicalGrowthBaseRate 逐字一致,只是把
 *     revenue 换成 operating_income —— 这是 CAGR 准确性硬门要求的口径:回归而非端点)
 *   - years: 参与回归的有效正 FY 点数
 *   - epvAvCons: moat_reading.epv_per_share_compared / asset_per_share_compared
 * 并对候选阈值网格算出各候选下的命中集,供人工判读锁定
 * GROWTH_FRANCHISE_MIN_CAGR / MIN_YEARS / STRONG_CAGR / STRONG_MIN_YEARS 四个常量。
 * 只读:不写库,不改任何表,不 import 未落地的 Task 3 判别器函数(本脚本内联同一算法)。
 *
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/growth-franchise-calibrate.ts > /tmp/gfcal.ndjson 2> /tmp/gfcal.log
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

const MIN_YEARS_FOR_REGRESSION = 3; // 与 historicalGrowthBaseRate 的 MIN_BASE_RATE_YEARS 一致

/**
 * operatingIncomeLogGrowth — 与 Task 3 将落地的同名函数逐字一致的口径。
 * 对 ln(operating_income) 做 FY log-线性回归(最小二乘),年化 g = exp(slope) - 1。
 * 只用 operating_income>0 且有限的点;有效点数 < MIN_YEARS_FOR_REGRESSION 时返回 undefined。
 */
function operatingIncomeLogGrowth(
  years: { fiscal_year: number; operating_income?: number | null }[],
): { g: number | undefined; validYears: number } {
  const pts = years
    .filter((y) => y.operating_income != null && Number.isFinite(y.operating_income) && (y.operating_income as number) > 0)
    .map((y) => ({ x: y.fiscal_year, y: Math.log(y.operating_income as number) }));
  const validYears = pts.length;
  if (pts.length < MIN_YEARS_FOR_REGRESSION) return { g: undefined, validYears };
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (!(denom > 0)) return { g: undefined, validYears };
  const slope = (n * sxy - sx * sy) / denom;
  const g = Math.exp(slope) - 1;
  return { g: Number.isFinite(g) ? g : undefined, validYears };
}

const MIN_CAGR_GRID = [0.04, 0.05, 0.06, 0.07, 0.08];
const MIN_YEARS_GRID = [4, 5, 6];
const STRONG_CAGR_GRID = [0.12, 0.15, 0.18, 0.2];

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  const universe = await collectUniverse();
  console.error(`Universe: ${universe.length} tickers, computed_at=${new Date().toISOString()}`);

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

  const CONCURRENCY = 8;
  let cursor = 0;
  let scanned = 0;
  let commodityCount = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const ticker = universe[cursor++];
      if (ticker === undefined) return;
      scanned++;
      if (scanned % 200 === 0) console.error(`progress: ${scanned}/${universe.length}`);
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
        const mr = floor.moat_reading;
        // 校准池 = 旁路生效前的 commodity 群 = 当前仍判 commodity 的票 ∪ 已被成长旁路提升为
        // franchise 的票(moat_via_growth)。Task 3-5 落地后,growthFranchise 命中票的 signal 会从
        // "commodity" 变成 "franchise"(viaGrowth 仅替换 commodity 分支,见 epvFloor.ts §521-597),
        // 若只筛 signal==="commodity" 会漏掉正被校准的那批票。取并集使本脚本无论旁路是否接线都能
        // 复现同一 149 票池、同一命中集(自洽可复现)。
        const inCommodityCohort = mr.signal === "commodity" || mr.moat_via_growth === true;
        if (!inCommodityCohort) continue;
        if (floor.is_financial === true) continue;
        commodityCount++;

        // 判别口径与生产 growthFranchise(moatCap.ts)逐字一致:先 drop-null(滤掉 operating_income
        // 为 null/非有限的年),再对剩余年 every(>0),years 用滤后计数 withOi.length。含缺失年但其余
        // 全正的票不会被误排除(此前用 fi.years.every 含 null → false 会误伤,是与生产的口径分歧)。
        const withOi = fi.years.filter(
          (y) => y.operating_income != null && Number.isFinite(y.operating_income),
        );
        const years = withOi.length;
        const allOpIncPositive = years > 0 && withOi.every((y) => (y.operating_income as number) > 0);
        const { g: opIncLogGrowth } = operatingIncomeLogGrowth(withOi);
        // epvAvCons: EPV/AV 保守比值,仅作诊断字段随行输出备查(判断该 commodity 票的盈利力相对
        // 资产是否已偏高,辅助人工甄别真假 franchise),不参与命中判定 —— 命中只看增长口径三闸。
        const epvAvCons =
          mr.epv_per_share_compared != null && mr.asset_per_share_compared != null && mr.asset_per_share_compared !== 0
            ? mr.epv_per_share_compared / mr.asset_per_share_compared
            : undefined;

        // 命中判定必须含 allOpIncPositive 闸 —— 否则周期低谷回补票(ATI/CELH)会因回归斜率被谷底
        // 抬高而假阳命中。gridHits/gridStrong 自洽包含此闸,单独重跑脚本即可复现文档命中集。
        const gridHits: Record<string, boolean> = {};
        const gridStrong: Record<string, boolean> = {};
        for (const minCagr of MIN_CAGR_GRID) {
          for (const minYears of MIN_YEARS_GRID) {
            const key = `c${minCagr}_y${minYears}`;
            const hit = allOpIncPositive && opIncLogGrowth != null && opIncLogGrowth >= minCagr && years >= minYears;
            gridHits[key] = hit;
            if (hit) {
              for (const strongCagr of STRONG_CAGR_GRID) {
                // strong 再叠加 STRONG_CAGR(STRONG_MIN_YEARS 与基档 MIN_YEARS 同值,已由 hit 保证)
                gridStrong[`${key}_s${strongCagr}`] = opIncLogGrowth != null && opIncLogGrowth >= strongCagr;
              }
            }
          }
        }

        const row = {
          ticker,
          signal: mr.signal,
          moatViaGrowth: mr.moat_via_growth === true, // 生产判据结果,供与本脚本网格命中交叉核对
          allOpIncPositive,
          opIncLogGrowth,
          years,
          epvAvCons,
          gridHits,
          gridStrong,
        };
        console.log(JSON.stringify(row));
      } catch {
        // 单票失败跳过（只读校准，容错）
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.error(`done: scanned=${scanned} commodity_nonfin=${commodityCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
