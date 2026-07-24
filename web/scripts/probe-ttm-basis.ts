/**
 * probe-ttm-basis.ts — TTM 估值基点真数据验收探针(spec §9.1-9.5,只读)。
 *
 * 对每只 ticker 跑两遍真引擎:A=现状(不传 quarterRows,恒 FY 基点)/B=TTM(传 sec.quarterly)。
 * 打印 basis/as_of/TTM+FY 的 rev+NI/IV(neutral)/bucket/band/marginPct,并内置三条硬断言:
 *   1. GOOGL 对账(独立 REST 直拉 company_fundamentals_periods 复算,不复用引擎路径;
 *      配对季度由人工按财历钉死为常量表,不复刻 ttmBasis.ts 的 findYearAgoMatch 选取算法——
 *      详见 assertPinnedReconciliation 注释)
 *   2. FY-only 票(ADR 20-F)零漂移(floorInput.years / verdict JSON 全等,ttm undefined)
 *   3. HRB 独立对账(同 1,人工钉死配对复算 net_income;季节性偏差只打印观测值不设门槛——
 *      15% 门槛已被真数据证伪,见 spec §9.2 验收记录)
 *
 * `--sample N`:从 consensus_holdings 按 holder_count 降序取前 N(确定性),跑 A/B 两路统计
 * ttm命中/fy回退/抑制数三分账,断言 B 路抑制数 ≤ A 路(TTM 不得新增抑制)。
 *
 * 用法:
 *   cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-ttm-basis.ts
 *   cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-ttm-basis.ts --sample 80
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getSecCompanyData } from "@/lib/sec/read";
import { getLatestPrice, getLatestSplit } from "@/lib/managers/priceRead";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
import {
  fundamentalsToFloorInput,
  resolveAds,
  isFundamentalsStale,
  isSplitCoverageStale,
  fundamentalsIntegrityViolated,
  runValuation,
} from "@/lib/valuation";
import type { ValuationFloorInput } from "@/lib/valuation/types";
import type { RunValuationInput, ValuationRun } from "@/lib/valuation/runValuation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return { ...out, ...process.env } as Record<string, string>;
}

const MAIN_TICKERS = ["GOOGL", "MSFT", "AMZN", "NFLX", "EMN", "HRB", "ASML", "SAP", "NVO", "SPGI", "BKNG"];
const ADR_ZERO_DRIFT = new Set(["ASML", "SAP", "NVO"]);

/**
 * 预期配对由人工按财历钉死,独立于引擎配对算法(ttmBasis.ts findYearAgoMatch)——
 * 复审意见:对账函数原先文本复刻 findYearAgoMatch 的"target−365天/±45窗/取最近"选取逻辑,
 * 是同一算法自证,不构成独立验证。改法:显式写死候选 (新季度, 去年同期) 日期对,REST 按
 * period_end 精确 eq 取行;只有当某候选新季度确实已入库(真实 10-Q)才纳入求和,按候选表
 * 顺序线性截断(不做"最近邻"推导)。这样断言同时覆盖:①算术正确 ②引擎选取的配对季度
 * 与人工按财历认定的正确季度一致。
 */
type PinnedPair = { newQ: string; matchQ: string };

// GOOGL 日历年结账(FY=12/31)。当前已知 2026-03-31 入库;候选表按季度顺延,
// Q2'26/Q3'26 入库后自动纳入(仍是精确 eq 存在性判定,非距离推导)。
const GOOGL_CANDIDATE_PAIRS: PinnedPair[] = [
  { newQ: "2026-03-31", matchQ: "2025-03-31" },
  { newQ: "2026-06-30", matchQ: "2025-06-30" },
  { newQ: "2026-09-30", matchQ: "2025-09-30" },
];

// HRB FY=4/30 结账。当前库内已知的 3 个新季度(2025-09-30/2025-12-31/2026-03-31),
// 人工按财历钉死其去年同期配对。
const HRB_CANDIDATE_PAIRS: PinnedPair[] = [
  { newQ: "2025-09-30", matchQ: "2024-09-30" },
  { newQ: "2025-12-31", matchQ: "2024-12-31" },
  { newQ: "2026-03-31", matchQ: "2025-03-31" },
];

function n(x: number | null | undefined, d = 2): string {
  return x == null || !Number.isFinite(x) ? "—" : x.toFixed(d);
}
function pct(x: number | null | undefined, d = 1): string {
  return x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(d);
}

let ASSERT_FAILURES = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    console.error(`  [FAIL] ${msg}`);
    ASSERT_FAILURES++;
  }
}

type Evaluated = {
  floorInput: ValuationFloorInput;
  run: ValuationRun;
  fundamentalsAsOf: string | null;
};

/** 跑一遍完整链路(镜像 valuation-ingest.ts 141-168 行的构造),`useTtm` 控制是否传 quarterRows。 */
async function evaluate(
  ticker: string,
  sec: Awaited<ReturnType<typeof getSecCompanyData>>,
  ads: { suppressed: boolean; ratio: number },
  sic: number | undefined,
  dgs10: { value: number; date: string } | null,
  computedAt: string,
  useTtm: boolean,
): Promise<Evaluated> {
  const floorInput = fundamentalsToFloorInput(
    ticker,
    ticker,
    sec.annual,
    ads.ratio,
    sic,
    useTtm ? sec.quarterly : undefined,
  );
  const fundamentalsAsOf = floorInput.ttm?.period_end ?? sec.annual?.[0]?.period_end ?? null;
  const fundamentalsStale = isFundamentalsStale(fundamentalsAsOf, computedAt);
  const fetchedPrice = await getLatestPrice(ticker);
  const priceStale = fetchedPrice?.stale === true;
  const valuationPrice = priceStale ? null : fetchedPrice;
  const splitCoverageStale = isSplitCoverageStale({
    fundamentalsAsOf,
    latestSplitDate: await getLatestSplit(ticker),
  });
  const fundamentalsCorrupt = fundamentalsIntegrityViolated(floorInput.years);
  const guards: RunValuationInput["guards"] = {
    adsSuppressed: ads.suppressed,
    fundamentalsStale,
    priceStale,
    splitCoverageStale,
    fundamentalsCorrupt,
  };
  const run = runValuation({ floorInput, price: valuationPrice, dgs10, guards, suppressExpectations: true });
  return { floorInput, run, fundamentalsAsOf };
}

function getSic(sec: Awaited<ReturnType<typeof getSecCompanyData>>): number | undefined {
  const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
  const sicNum = sicRaw == null ? undefined : Number(sicRaw);
  return sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
}

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  const argv = process.argv.slice(2);
  const sampleIdx = argv.indexOf("--sample");
  if (sampleIdx !== -1) {
    const nSample = Number(argv[sampleIdx + 1]) || 80;
    await runSample(db, nSample);
    return;
  }

  const dgs10 = await getLatestDgs10();
  console.log(dgs10 ? `DGS10: ${dgs10.value}% as of ${dgs10.date}` : "DGS10: 不可用");
  const computedAt = new Date().toISOString();

  // securities 表:main ticker 集里只有 ASML/SAP/NVO 是 ADR,批量取一次真实 ads_ratio。
  const { data: secRows } = await db
    .from("securities")
    .select("ticker,security_type,ads_ratio")
    .in("ticker", MAIN_TICKERS);
  const secTypeMap = new Map<string, string | null>();
  const adsRatioMap = new Map<string, number | null>();
  for (const r of secRows ?? []) {
    secTypeMap.set(String(r.ticker).toUpperCase(), (r.security_type as string | null) ?? null);
    adsRatioMap.set(String(r.ticker).toUpperCase(), (r.ads_ratio as number | null) ?? null);
  }

  console.log(
    "\nticker  basis  as_of        TTM_rev/NI(B)              FY_rev/NI          IV(neutral)  bucket        band              marginPct(%)",
  );

  const results = new Map<string, { A: Evaluated; B: Evaluated; sec: Awaited<ReturnType<typeof getSecCompanyData>> }>();

  for (const ticker of MAIN_TICKERS) {
    try {
      const sec = await getSecCompanyData(ticker);
      const ads = resolveAds(secTypeMap.get(ticker), adsRatioMap.get(ticker));
      const sic = getSic(sec);
      const A = await evaluate(ticker, sec, ads, sic, dgs10, computedAt, false);
      const B = await evaluate(ticker, sec, ads, sic, dgs10, computedAt, true);
      results.set(ticker, { A, B, sec });

      const basis = B.floorInput.ttm ? "ttm" : "fy";
      const asOf = B.fundamentalsAsOf ?? "—";
      const ttmYear = B.floorInput.ttm?.year;
      const fyYear = A.floorInput.years[0];
      const ttmStr = ttmYear ? `${n(ttmYear.revenue, 0)}/${n(ttmYear.net_income, 0)}` : "—";
      const fyStr = fyYear ? `${n(fyYear.revenue, 0)}/${n(fyYear.net_income, 0)}` : "—";
      const verdictB = B.run.verdict;
      const iv = B.run.oeDcf?.assessable ? B.run.oeDcf.tiers?.neutral?.per_share : undefined;
      const bucketStr = verdictB ? verdictB.bucket : `null(${B.run.suppressedReason ?? "抑制"})`;
      const bandStr = verdictB ? `${n(verdictB.rangeLo)}-${n(verdictB.rangeHi)}` : "—";
      const marginStr = verdictB ? pct(verdictB.marginPct) : "—";

      console.log(
        `${ticker.padEnd(6)}  ${basis.padEnd(5)}  ${asOf.padEnd(11)}  ${ttmStr.padEnd(26)} ${fyStr.padEnd(18)} ` +
          `${n(iv).padEnd(12)} ${bucketStr.padEnd(13)} ${bandStr.padEnd(17)} ${marginStr}`,
      );

      if (ticker === "SPGI" || ticker === "BKNG") {
        const splitStaleA = A.run.suppressedReason === "split_coverage_stale";
        const splitStaleB = B.run.suppressedReason === "split_coverage_stale";
        console.log(
          `  [${ticker}] split_coverage_stale: A(FY)=${splitStaleA} → B(TTM)=${splitStaleB}` +
            (splitStaleA && !splitStaleB ? "  (TTM 新 10-Q 已覆盖拆股,抑制解除)" : ""),
        );
      }
    } catch (e) {
      console.log(`${ticker.padEnd(6)} ERR ${String(e).slice(0, 160)}`);
    }
  }

  console.log("\n--- 断言 1: GOOGL 对账(spec §9.1,独立 REST 直拉复算,人工钉死配对)---");
  await assertPinnedReconciliation(db, "GOOGL", "revenue", GOOGL_CANDIDATE_PAIRS, results.get("GOOGL"));

  console.log("\n--- 断言 2: FY-only ADR 零漂移(spec §9.3)---");
  for (const ticker of ADR_ZERO_DRIFT) {
    const r = results.get(ticker);
    if (!r) {
      assert(false, `${ticker}: 未取到结果(抓取失败)`);
      continue;
    }
    const { A, B } = r;
    assert(B.floorInput.ttm === undefined, `${ticker}: floorInput.ttm === undefined (实际 ${JSON.stringify(B.floorInput.ttm)})`);
    assert(
      JSON.stringify(A.floorInput.years) === JSON.stringify(B.floorInput.years),
      `${ticker}: floorInput.years A/B 全等`,
    );
    assert(
      JSON.stringify(A.run.verdict) === JSON.stringify(B.run.verdict),
      `${ticker}: verdict JSON A/B 全等(both=${A.run.verdict ? A.run.verdict.bucket : "null"})`,
    );
  }

  console.log("\n--- 断言 3: HRB 增量法独立对账(spec §9.2,人工钉死配对,不设季节性偏差门槛)---");
  await assertPinnedReconciliation(db, "HRB", "net_income", HRB_CANDIDATE_PAIRS, results.get("HRB"));
  printHrbSeasonalityObservation(results.get("HRB"));

  console.log(`\n${ASSERT_FAILURES === 0 ? "全部断言通过" : `${ASSERT_FAILURES} 条断言失败`}`);
  if (ASSERT_FAILURES > 0) process.exit(1);
}

/** 观测值打印:季节性偏差,不设门槛(15% 启发式已被真数据证伪,见 spec §9.2 验收记录)。 */
function printHrbSeasonalityObservation(hrbResult: { A: Evaluated; B: Evaluated } | undefined) {
  if (!hrbResult) return;
  const ttmYear = hrbResult.B.floorInput.ttm?.year;
  const fyNi = hrbResult.A.floorInput.years[0]?.net_income;
  if (ttmYear?.net_income != null && fyNi != null && Number.isFinite(fyNi) && fyNi !== 0) {
    const dev = Math.abs((ttmYear.net_income as number) - fyNi) / Math.abs(fyNi);
    console.log(
      `  [观测,不设门槛] |TTM_NI-FY_NI|/FY_NI = ${pct(dev)}% —— 偏差由报税季主力季度真实同比增长解释` +
        `(Q3 FY2026 净利 vs 去年同期 Q3 FY2025 真实同比大涨,非增量法/配对失真;详见 spec §9.2 验收记录)。`,
    );
  }
  console.log(
    `  [注] HRB verdict 仍被 capital_structure_distorted 死角闸抑制(独立已立案问题,与本 spec 无关)` +
      `——本断言只验 floor 层增量法算术,不断言 verdict。A verdict=${hrbResult.A.run.verdict ? hrbResult.A.run.verdict.bucket : `null(${hrbResult.A.run.suppressedReason})`}` +
      `  B verdict=${hrbResult.B.run.verdict ? hrbResult.B.run.verdict.bucket : `null(${hrbResult.B.run.suppressedReason})`}`,
  );
}

type FlowField = "revenue" | "net_income";

/** 精确 eq 取一行真实 10-Q(不做任何"最近邻/距离"推导——存在性判定,非算法选取)。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPinnedQuarter(db: any, ticker: string, periodEnd: string, field: FlowField): Promise<number | null> {
  const { data, error } = await db
    .from("company_fundamentals_periods")
    .select(`${field}`)
    .eq("ticker", ticker)
    .eq("period_end", periodEnd)
    .eq("form", "10-Q")
    .eq("is_derived", false)
    .maybeSingle();
  if (error || !data) return null;
  const v = (data as Record<string, unknown>)[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 最新 FY 锚行(非争议逻辑——单纯取 period_end 最大的 FY 行,不涉及配对选取)。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchLatestFy(db: any, ticker: string, field: FlowField): Promise<{ period_end: string; value: number } | null> {
  const { data, error } = await db
    .from("company_fundamentals_periods")
    .select(`period_end,${field}`)
    .eq("ticker", ticker)
    .eq("fiscal_period", "FY")
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const v = row[field];
  return typeof v === "number" && Number.isFinite(v) ? { period_end: row.period_end as string, value: v } : null;
}

/**
 * 独立 REST 对账(GOOGL/HRB 共用):不复用引擎路径,也不复刻 ttmBasis.ts 的配对算法——
 * 配对表由人工按财历钉死(见 GOOGL_CANDIDATE_PAIRS / HRB_CANDIDATE_PAIRS 常量注释),
 * 只按候选表顺序对每个候选新季度做存在性 eq 查询,命中则纳入求和,遇到未入库的候选即停止
 * (financial calendar 天然连续,不会出现"跳过一个再命中下一个"的情况)。
 */
async function assertPinnedReconciliation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ticker: string,
  field: FlowField,
  candidatePairs: PinnedPair[],
  result: { A: Evaluated; B: Evaluated } | undefined,
) {
  if (!result) {
    assert(false, `${ticker}: 未取到引擎结果(抓取失败)`);
    return;
  }
  const fy0 = await fetchLatestFy(db, ticker, field);
  if (!fy0) {
    assert(false, `${ticker}: 拉不到最新 FY 行(${field})`);
    return;
  }
  const used: { newQ: string; newVal: number; matchQ: string; matchVal: number }[] = [];
  for (const pair of candidatePairs) {
    const newVal = await fetchPinnedQuarter(db, ticker, pair.newQ, field);
    if (newVal == null) break; // 该钉死候选尚未入库(或非真实10-Q/字段为空)→ 按顺序停止,后续候选亦不纳入
    const matchVal = await fetchPinnedQuarter(db, ticker, pair.matchQ, field);
    if (matchVal == null) {
      assert(false, `${ticker}: 钉死配对 ${pair.matchQ}(对应新季度 ${pair.newQ})拉不到真实 10-Q 或 ${field} 为空`);
      return;
    }
    used.push({ newQ: pair.newQ, newVal, matchQ: pair.matchQ, matchVal });
  }
  if (used.length === 0) {
    assert(false, `${ticker}: 钉死候选新季度均未入库(候选表=${JSON.stringify(candidatePairs)})`);
    return;
  }
  const expected = fy0.value + used.reduce((s, u) => s + u.newVal, 0) - used.reduce((s, u) => s + u.matchVal, 0);

  const engineTtm = result.B.floorInput.ttm;
  const engineVal = engineTtm ? (engineTtm.year[field] as number | undefined) : undefined;
  console.log(
    `  独立复算(人工钉死配对): FY(${fy0.period_end})=${n(fy0.value, 0)}` +
      ` + Σ新季度[${used.map((u) => `${u.newQ}=${n(u.newVal, 0)}`).join(", ")}]` +
      ` − Σ钉死去年同期[${used.map((u) => `${u.matchQ}=${n(u.matchVal, 0)}`).join(", ")}] = ${n(expected, 0)}`,
  );
  console.log(`  引擎 TTM: as_of=${engineTtm?.period_end ?? "—"}  ${field}=${n(engineVal, 0)}`);

  if (!engineTtm) {
    assert(false, `${ticker}: 引擎未合成 ttm(floorInput.ttm undefined),预期应可合成`);
    return;
  }
  const expectedAsOf = used[used.length - 1].newQ;
  assert(
    engineTtm.period_end === expectedAsOf,
    `${ticker}: 引擎 as_of === 人工钉死候选表末项 "${expectedAsOf}"(实际 ${engineTtm.period_end})——即引擎选取的配对季度与人工按财历认定的一致`,
  );
  const relErr = engineVal == null ? Infinity : Math.abs(engineVal - expected) / Math.abs(expected);
  assert(
    relErr < 0.001,
    `${ticker}: 引擎 TTM ${field} 与独立复算相对误差 < 0.1% (实际 ${Number.isFinite(relErr) ? (relErr * 100).toFixed(4) : "—"}%)`,
  );
  console.log(`  钉死候选表命中 ${used.length}/${candidatePairs.length} 项(按财历顺序线性截断)。`);
}

/** spec §9.5 本地版:从 consensus_holdings 按 holder_count 降序取前 N,跑 A/B 两路统计三分账。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runSample(db: any, nSample: number) {
  console.log(`\n--- --sample ${nSample}: 全 universe 三分账抽样(确定性,按 holder_count 降序)---`);
  const { data, error } = await db
    .from("consensus_holdings")
    .select("ticker,holder_count")
    .order("holder_count", { ascending: false })
    .limit(nSample);
  if (error || !data) throw new Error(`consensus_holdings 读取失败: ${error?.message}`);
  const tickers = Array.from(new Set((data as { ticker: string }[]).map((r) => String(r.ticker).toUpperCase())));
  console.log(`样本: ${tickers.length} 只(去重后)`);

  const { data: secRows } = await db
    .from("securities")
    .select("ticker,security_type,ads_ratio")
    .in("ticker", tickers);
  const secTypeMap = new Map<string, string | null>();
  const adsRatioMap = new Map<string, number | null>();
  for (const r of secRows ?? []) {
    secTypeMap.set(String(r.ticker).toUpperCase(), (r.security_type as string | null) ?? null);
    adsRatioMap.set(String(r.ticker).toUpperCase(), (r.ads_ratio as number | null) ?? null);
  }

  const dgs10 = await getLatestDgs10();
  const computedAt = new Date().toISOString();

  let ttmHit = 0, fyFallback = 0;
  let suppressedA = 0, suppressedB = 0;
  let errCount = 0;

  for (const ticker of tickers) {
    try {
      const sec = await getSecCompanyData(ticker);
      if (!sec.company && !sec.annual?.length) { errCount++; continue; }
      const ads = resolveAds(secTypeMap.get(ticker), adsRatioMap.get(ticker));
      const sic = getSic(sec);
      const A = await evaluate(ticker, sec, ads, sic, dgs10, computedAt, false);
      const B = await evaluate(ticker, sec, ads, sic, dgs10, computedAt, true);
      if (B.floorInput.ttm) ttmHit++; else fyFallback++;
      if (!A.run.verdict) suppressedA++;
      if (!B.run.verdict) suppressedB++;
    } catch {
      errCount++;
    }
  }

  console.log(
    `\nttm命中=${ttmHit}  fy回退=${fyFallback}  错误/跳过=${errCount}  ` +
      `引擎抑制: A(FY)=${suppressedA}  B(TTM)=${suppressedB}`,
  );
  assert(suppressedB <= suppressedA, `抑制数不得高于现状: B(TTM)=${suppressedB} ≤ A(FY)=${suppressedA}`);
  console.log(`\n${ASSERT_FAILURES === 0 ? "全部断言通过" : `${ASSERT_FAILURES} 条断言失败`}`);
  if (ASSERT_FAILURES > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
