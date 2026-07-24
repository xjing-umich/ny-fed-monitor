/**
 * valuation-ingest.ts — 物化每 ticker 的估值位置档判定到 valuation_snapshot。
 * 用法: cd web && npm run valuation:ingest(本地读仓库根 .env.local;CI 用 env)。
 *
 * Universe = 所有被追踪投资人最新持仓的 ticker 并集(= 任何持仓表可能出现的全集)。
 * 逐 ticker 复用个股页同一编排: getSecCompanyData → runValuation。可估值才入表;
 * 不可估值跳过(读取侧缺行=" —")。
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
import { isOperatingSecurity } from "@/lib/securities/openfigi";
import { getSecCompanyData } from "@/lib/sec/read";
import {
  fundamentalsToFloorInput,
  resolveAds,
  isFundamentalsStale,
  isSplitCoverageStale,
  fundamentalsIntegrityViolated,
  FUNDAMENTALS_MAX_AGE_MONTHS,
  runValuation,
} from "@/lib/valuation";
import { getLatestPrice, getLatestSplit } from "@/lib/managers/priceRead";
import { getLatestDgs10, persistDgs10 } from "@/lib/managers/treasuryRead";

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

  // 证券类型图:非经营性载体(ETP/基金/权证…)不该用盈利法估值(如 SIVR/GLD 实物商品信托)。
  // security_type=NULL(未回填)→ isOperatingSecurity 视为可估,靠上游闸兜底,不静默漏真公司。
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
  // 先耐心抓 DGS10 写入 market_rates(FRED 可达时刷新/播种), 再读 —— getLatestDgs10 在 live
  // 6s 超时时回退到该 last-good, 使全表估值锚定真 10Y 而非未锚定回退带。
  await persistDgs10();
  const dgs10 = await getLatestDgs10(); // 全局共享, 取一次(fresh 或 DB last-good)
  if (!dgs10) console.warn("DGS10 仍不可用(live 失败且 market_rates 无 last-good)→ 本轮贴现带未锚定");
  const computedAt = new Date().toISOString();

  let valued = 0, skipped = 0, excludedNonOperating = 0, adrSuppressed = 0, staleFundamentals = 0;
  let ttmBasis = 0;
  let exceptionSkipped = 0;
  // 数据缺口导致算不出 verdict(缺价/陈旧价/陈旧基本面):与瞬时故障同类,保留历史行。
  let suppressedByDataGap = 0;
  // 引擎有意抑制(该删旧行)vs 瞬时异常(保留历史行)。catch / 抓取失败不进此集。
  const intentionallyUnvaluable = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const ticker of universe) {
    // 非经营性证券:不进盈利法估值。旧快照行应删(有意抑制,非瞬时故障)。
    if (!isOperatingSecurity(secTypeMap.get(ticker))) {
      excludedNonOperating++;
      intentionallyUnvaluable.add(ticker);
      continue;
    }
    // ADR/ADS 归一化:ADR 且比例已策展 → 用每 ADS 口径;ADR 但比例缺 → 抑制(不出估值)。
    const ads = resolveAds(secTypeMap.get(ticker), adsRatioMap.get(ticker));
    if (ads.suppressed) {
      adrSuppressed++;
      intentionallyUnvaluable.add(ticker);
      continue;
    }
    try {
      const sec = await getSecCompanyData(ticker);
      // getSecCompanyData 在 DB 不可用时静默返回空(不抛)——与瞬时故障同类,不得当「有意不可估值」删行。
      // 有 company 行但无年报 → 真收录、引擎抑制;无 company 且无年报 → 抓取/未就绪,保留历史。
      if (!sec.company && !(sec.annual?.length)) {
        exceptionSkipped++;
        console.error(`  ${ticker} 跳过: SEC 基本面不可用(空结果,保留历史快照)`);
        continue;
      }
      // company_name 不影响判定(仅卡片 who 前缀用), 投资人页只读 verdict, 故传 ticker 即可。
      // sic(Task 4):驱动 is_financial 识别(银行/保险走 SGR 封顶而非扁平 7% cap)。
      // sic 在 DB 是 text（"6022"），须运行时转 number（镜像 page.tsx），否则 isFinancialSic 对字符串恒 false。
      const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
      const sicNum = sicRaw == null ? undefined : Number(sicRaw);
      const sic = sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
      const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual, ads.ratio, sic, sec.quarterly);
      // as-of 重锚(spec §6):TTM 生效 → 新鲜度/拆股闸都按 TTM 期末判。
      const fundamentalsAsOf = floorInput.ttm?.period_end ?? sec.annual?.[0]?.period_end ?? null;
      // 基本面过期闸:最新 FY 年报距今超阈值(停报/退市/外股 ADR 覆盖不了)→ 抑制,
      // 不拿今天的价配多年前基本面造"陈旧幻觉"verdict。与 price.stale 同类护栏。
      const fundamentalsStale = isFundamentalsStale(fundamentalsAsOf, computedAt);
      if (fundamentalsStale) {
        staleFundamentals++;
      }
      const fetchedPrice = await getLatestPrice(ticker);
      const priceStale = fetchedPrice?.stale === true;
      const valuationPrice = priceStale ? null : fetchedPrice;
      // 拆股闸 as-of:仅当 TTM 每股股数真取自最新10-Q(非回退 FY0)才前滚到 TTM 期末;
      // 否则退回 FY 期末,防拆股落在 (FY0期末, TTM期末] 且最新10-Q缺股数时漏抑制(spec §6)。
      const splitAsOf =
        floorInput.ttm && !floorInput.ttm.shares_from_fy
          ? floorInput.ttm.period_end
          : sec.annual?.[0]?.period_end ?? null;
      const splitCoverageStale = isSplitCoverageStale({
        fundamentalsAsOf: splitAsOf,
        latestSplitDate: await getLatestSplit(ticker),
      });
      const fundamentalsCorrupt = fundamentalsIntegrityViolated(floorInput.years);
      const run = runValuation({
        floorInput,
        price: valuationPrice,
        dgs10,
        guards: {
          adsSuppressed: false,
          fundamentalsStale,
          priceStale,
          splitCoverageStale,
          fundamentalsCorrupt,
        },
        suppressExpectations: false,
      });
      if (!run.verdict) {
        skipped++;
        // 数据缺口(缺价/陈旧价/陈旧基本面)计入熔断分子:全 universe 无价时熔断会拦下清理,
        // 防止价格 cron 断更把整张表删空。但「是否真删」统一交给熔断裁决 —— 零星死票
        // (退市/停报/长期无价)仍须能被清理,否则旧 price/verdict 会无限期挂在榜单上,
        // 而读取侧不按 computed_at 过滤陈旧行。故此处始终加入候选集,不做豁免。
        const dataGap = priceStale || !fetchedPrice || fundamentalsStale;
        if (dataGap) suppressedByDataGap++;
        intentionallyUnvaluable.add(ticker);
        continue;
      }
      const v = run.verdict;
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
        payload: {
          ...v,
          expectations: run.expectations,
          methods: run.methods,
          fundamental_basis: floorInput.ttm
            ? { kind: "ttm", as_of: floorInput.ttm.period_end, quarters_used: floorInput.ttm.quarters_used }
            : { kind: "fy", as_of: sec.annual?.[0]?.period_end ?? null },
          ...(run.oeDcf?.assessable && run.oeDcf.moatCap ? { moatCap: run.oeDcf.moatCap } : {}),
        },
        updated_at: computedAt,
      });
      valued++;
      if (floorInput.ttm) ttmBasis++;
    } catch (err) {
      // 瞬时故障(Supabase/SEC 抖动):保留历史行,不进 intentionallyUnvaluable。
      exceptionSkipped++;
      console.error(`  ${ticker} 跳过: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 批量 upsert(分批避免单请求过大)。
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from("valuation_snapshot").upsert(rows.slice(i, i + BATCH), { onConflict: "ticker" });
    if (error) throw new Error(`valuation_snapshot upsert 失败: ${error.message}`);
  }

  // 清理陈旧行:只删「引擎有意抑制」且本轮未写入的 ticker。catch / 抓取异常的 ticker
  // 不进 intentionallyUnvaluable → 保留历史行,避免抖动期误删后读取侧变"—"。
  // 数据缺口(缺价/陈旧价/陈旧基本面)则进候选集,由下面两道闸统一裁决是否真删。
  // 另:异常跳过率熔断 —— 超过阈值则整轮跳过清理,防大面积误删。
  // 熔断分子含两类「非结构性」跳过:异常 + 数据缺口(缺价/陈旧价/陈旧基本面)。
  // 单看 exceptionSkipped 会漏掉价格 cron 断更这类场景(getLatestPrice 返回 null 不抛异常)。
  const MAX_NON_STRUCTURAL_SKIP_RATIO = 0.15;
  // 绝对地板:本轮写入覆盖率断崖即视为系统性故障,无论比率如何都不清理。
  // 注意这不是覆盖率目标 —— 分母 universe 含大量结构性排除项(ETP/基金/权证、
  // 未策展 ADR、薄数据),它们永远不计入分子,故常态覆盖率本就远低于 100%。
  // 真实基准(2026-07-23 生产跑):universe 2142、入表 1037 = 48.4%。地板必须
  // 显著低于该基准,否则每轮都触发、清理永久静默停摆。调整前请以真实一轮日志为准。
  const MIN_WRITTEN_RATIO = 0.35;
  const written = new Set(rows.map((r) => r.ticker as string));
  const nonStructuralSkipped = exceptionSkipped + suppressedByDataGap;
  const skipRatio = universe.length > 0 ? nonStructuralSkipped / universe.length : 0;
  const writtenRatio = universe.length > 0 ? written.size / universe.length : 0;
  let deleted = 0;
  if (skipRatio > MAX_NON_STRUCTURAL_SKIP_RATIO || writtenRatio < MIN_WRITTEN_RATIO) {
    console.warn(
      `陈旧行清理已跳过:非结构性跳过率 ${(skipRatio * 100).toFixed(1)}% ` +
        `(异常 ${exceptionSkipped} + 数据缺口 ${suppressedByDataGap} = ${nonStructuralSkipped}/${universe.length}, ` +
        `阈值 ${(MAX_NON_STRUCTURAL_SKIP_RATIO * 100).toFixed(0)}%)、` +
        `写入覆盖率 ${(writtenRatio * 100).toFixed(1)}% (${written.size}/${universe.length}, ` +
        `地板 ${(MIN_WRITTEN_RATIO * 100).toFixed(0)}%)。` +
        `保留全部既有 valuation_snapshot 行,避免抖动期误删。`
    );
  } else {
    const stale = universe.filter((t) => intentionallyUnvaluable.has(t) && !written.has(t));
    for (let i = 0; i < stale.length; i += BATCH) {
      const { error, count } = await db
        .from("valuation_snapshot")
        .delete({ count: "exact" })
        .in("ticker", stale.slice(i, i + BATCH));
      if (error) throw new Error(`valuation_snapshot 陈旧行删除失败: ${error.message}`);
      deleted += count ?? 0;
    }
  }
  console.log(`TTM基点: ${ttmBasis}/${valued}`);
  console.log(
    `估值快照完成: 入表 ${valued}, 跳过 ${skipped}(无估值/多股权/薄数据/陈旧价), ` +
      `异常跳过 ${exceptionSkipped}, 数据缺口抑制 ${suppressedByDataGap}(缺价/陈旧价/陈旧基本面,保留历史行), ` +
      `过期基本面抑制 ${staleFundamentals}(最新FY距今>${FUNDAMENTALS_MAX_AGE_MONTHS}月), ` +
      `排除非经营性 ${excludedNonOperating}(ETP/基金/权证), ADR未策展抑制 ${adrSuppressed}, ` +
      `清理陈旧 ${deleted}, computed_at ${computedAt}\n` +
      // 常态也打印,让距离熔断/地板的余量平时可观测,而不是等它咬人才发现。
      `覆盖率: 写入 ${(writtenRatio * 100).toFixed(1)}% (${written.size}/${universe.length}, 地板 ${(MIN_WRITTEN_RATIO * 100).toFixed(0)}%), ` +
      `非结构性跳过 ${(skipRatio * 100).toFixed(1)}% (阈值 ${(MAX_NON_STRUCTURAL_SKIP_RATIO * 100).toFixed(0)}%)`
  );
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
