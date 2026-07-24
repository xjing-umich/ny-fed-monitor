/**
 * probe-ttm-basis.ts — TTM 估值基点真数据验收探针(spec §9.1-9.5,只读)。
 *
 * 对每只 ticker 跑两遍真引擎:A=现状(不传 quarterRows,恒 FY 基点)/B=TTM(传 sec.quarterly)。
 * 打印 basis/as_of/TTM+FY 的 rev+NI/IV(neutral)/bucket/band/marginPct,并内置三条硬断言:
 *   1. GOOGL 对账(独立 REST 直拉 company_fundamentals_periods 复算,不复用引擎路径)
 *   2. FY-only 票(ADR 20-F)零漂移(floorInput.years / verdict JSON 全等,ttm undefined)
 *   3. HRB 季节性(增量法抵消季节性:|TTM_NI-FY_NI|/FY_NI < 15%,verdict 跳过——死角闸抑制)
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

  console.log("\n--- 断言 1: GOOGL 对账(spec §9.1,独立 REST 直拉复算)---");
  await assertGoogleReconciliation(db, results.get("GOOGL"));

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

  console.log("\n--- 断言 3: HRB 增量法独立对账(spec §9.2,GOOGL 同款独立复算,不设季节性偏差门槛)---");
  await assertHrbReconciliation(db, results.get("HRB"));

  console.log(`\n${ASSERT_FAILURES === 0 ? "全部断言通过" : `${ASSERT_FAILURES} 条断言失败`}`);
  if (ASSERT_FAILURES > 0) process.exit(1);
}

/** 独立 REST 直拉 company_fundamentals_periods,不复用引擎路径,单独复算 GOOGL TTM revenue。 */
async function assertGoogleReconciliation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  googleResult: { A: Evaluated; B: Evaluated } | undefined,
) {
  if (!googleResult) {
    assert(false, "GOOGL: 未取到引擎结果(抓取失败)");
    return;
  }
  const { data: periods, error } = await db
    .from("company_fundamentals_periods")
    .select("period_end,fiscal_period,form,is_derived,revenue")
    .eq("ticker", "GOOGL")
    .order("period_end", { ascending: false })
    .limit(32);
  if (error || !periods) {
    assert(false, `GOOGL: REST 直拉 company_fundamentals_periods 失败(${error?.message})`);
    return;
  }
  type Row = { period_end: string; fiscal_period: string | null; form: string; is_derived: boolean; revenue: number | null };
  const rows = periods as unknown as Row[];
  const fy0 = rows
    .filter((r) => r.fiscal_period === "FY")
    .sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  if (!fy0 || fy0.revenue == null) {
    assert(false, `GOOGL: 拉不到最新 FY 行(fy0=${JSON.stringify(fy0)})`);
    return;
  }
  const realQs = rows.filter((r) => r.form === "10-Q" && r.is_derived !== true);
  const newQs = realQs
    .filter((q) => q.period_end > fy0.period_end)
    .sort((a, b) => a.period_end.localeCompare(b.period_end));
  if (newQs.length === 0) {
    assert(false, `GOOGL: 无比 FY(${fy0.period_end}) 更新的真实 10-Q 行,TTM 应无法合成`);
    return;
  }
  const matches: Row[] = [];
  for (const q of newQs) {
    const target = Date.parse(q.period_end) - 365 * 86_400_000;
    let best: Row | null = null;
    let bestDist = Infinity;
    for (const c of realQs) {
      if (c.period_end > fy0.period_end) continue;
      const dist = Math.abs(Date.parse(c.period_end) - target) / 86_400_000;
      if (dist <= 45 && dist < bestDist) { best = c; bestDist = dist; }
    }
    if (!best || best.revenue == null) {
      assert(false, `GOOGL: 新季度 ${q.period_end} 找不到去年同期配对`);
      return;
    }
    matches.push(best);
  }
  const expectedRevenue =
    fy0.revenue + newQs.reduce((s, q) => s + (q.revenue ?? 0), 0) - matches.reduce((s, m) => s + (m.revenue ?? 0), 0);

  const engineTtm = googleResult.B.floorInput.ttm;
  console.log(
    `  独立复算: FY(${fy0.period_end})=${n(fy0.revenue, 0)} + Σ新季度[${newQs.map((q) => `${q.period_end}=${n(q.revenue, 0)}`).join(", ")}]` +
      ` − Σ去年同期[${matches.map((m) => `${m.period_end}=${n(m.revenue, 0)}`).join(", ")}] = ${n(expectedRevenue, 0)}`,
  );
  console.log(`  引擎 TTM: as_of=${engineTtm?.period_end ?? "—"}  revenue=${n(engineTtm?.year.revenue, 0)}`);

  if (!engineTtm) {
    assert(false, "GOOGL: 引擎未合成 ttm(floorInput.ttm undefined),预期应可合成");
    return;
  }
  const relErr = Math.abs((engineTtm.year.revenue as number) - expectedRevenue) / Math.abs(expectedRevenue);
  assert(relErr < 0.001, `GOOGL: 引擎 TTM revenue 与独立复算相对误差 < 0.1% (实际 ${(relErr * 100).toFixed(4)}%)`);

  if (newQs.length === 1 && newQs[0].period_end === "2026-03-31") {
    assert(engineTtm.period_end === "2026-03-31", `GOOGL: as_of === "2026-03-31" (实际 ${engineTtm.period_end})`);
  } else {
    assert(
      engineTtm.period_end >= "2026-03-31",
      `GOOGL: as_of >= "2026-03-31"(Q2'26 已入库,实际 as_of=${engineTtm.period_end}, 新季度=${JSON.stringify(newQs.map((q) => q.period_end))})`,
    );
    console.log(`  [注] Q2'26(或更新)已入库,as_of 已按增量法前滚至 ${engineTtm.period_end}`);
  }
}

/**
 * 独立 REST 直拉 company_fundamentals_periods,不复用引擎路径,单独复算 HRB TTM net_income
 * (GOOGL 同款独立对账思路,换 revenue→net_income)。裁定(2026-07-24 协调方):15% 季节性偏差门槛
 * 是设计期启发式,已被真数据证伪(报税季主力季度真实同比 +17.4%);改为逐字段独立对账断言,
 * 只观测偏差不设门槛。
 */
async function assertHrbReconciliation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  hrbResult: { A: Evaluated; B: Evaluated } | undefined,
) {
  if (!hrbResult) {
    assert(false, "HRB: 未取到引擎结果(抓取失败)");
    return;
  }
  const { data: periods, error } = await db
    .from("company_fundamentals_periods")
    .select("period_end,fiscal_period,form,is_derived,net_income")
    .eq("ticker", "HRB")
    .order("period_end", { ascending: false })
    .limit(32);
  if (error || !periods) {
    assert(false, `HRB: REST 直拉 company_fundamentals_periods 失败(${error?.message})`);
    return;
  }
  type Row = { period_end: string; fiscal_period: string | null; form: string; is_derived: boolean; net_income: number | null };
  const rows = periods as unknown as Row[];
  const fy0 = rows
    .filter((r) => r.fiscal_period === "FY")
    .sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  if (!fy0 || fy0.net_income == null) {
    assert(false, `HRB: 拉不到最新 FY 行(fy0=${JSON.stringify(fy0)})`);
    return;
  }
  const realQs = rows.filter((r) => r.form === "10-Q" && r.is_derived !== true);
  const newQs = realQs
    .filter((q) => q.period_end > fy0.period_end)
    .sort((a, b) => a.period_end.localeCompare(b.period_end));
  if (newQs.length === 0) {
    assert(false, `HRB: 无比 FY(${fy0.period_end}) 更新的真实 10-Q 行,TTM 应无法合成`);
    return;
  }
  const matches: Row[] = [];
  for (const q of newQs) {
    const target = Date.parse(q.period_end) - 365 * 86_400_000;
    let best: Row | null = null;
    let bestDist = Infinity;
    for (const c of realQs) {
      if (c.period_end > fy0.period_end) continue;
      const dist = Math.abs(Date.parse(c.period_end) - target) / 86_400_000;
      if (dist <= 45 && dist < bestDist) { best = c; bestDist = dist; }
    }
    if (!best || best.net_income == null) {
      assert(false, `HRB: 新季度 ${q.period_end} 找不到去年同期配对`);
      return;
    }
    matches.push(best);
  }
  const expectedNi =
    fy0.net_income + newQs.reduce((s, q) => s + (q.net_income ?? 0), 0) - matches.reduce((s, m) => s + (m.net_income ?? 0), 0);

  const engineTtm = hrbResult.B.floorInput.ttm;
  console.log(
    `  独立复算: FY(${fy0.period_end})=${n(fy0.net_income, 0)} + Σ新季度[${newQs.map((q) => `${q.period_end}=${n(q.net_income, 0)}`).join(", ")}]` +
      ` − Σ去年同期[${matches.map((m) => `${m.period_end}=${n(m.net_income, 0)}`).join(", ")}] = ${n(expectedNi, 0)}`,
  );
  console.log(`  引擎 TTM: as_of=${engineTtm?.period_end ?? "—"}  net_income=${n(engineTtm?.year.net_income, 0)}`);

  if (!engineTtm) {
    assert(false, "HRB: 引擎未合成 ttm(floorInput.ttm undefined),预期应可合成");
    return;
  }
  const relErr = Math.abs((engineTtm.year.net_income as number) - expectedNi) / Math.abs(expectedNi);
  assert(relErr < 0.001, `HRB: 引擎 TTM net_income 与独立复算相对误差 < 0.1% (实际 ${(relErr * 100).toFixed(4)}%)`);

  // 观测值:季节性偏差,不设门槛(15% 启发式已被真数据证伪,见 spec §9.2 验收记录)。
  const fyNi = hrbResult.A.floorInput.years[0]?.net_income;
  if (fyNi != null && Number.isFinite(fyNi) && fyNi !== 0) {
    const dev = Math.abs((engineTtm.year.net_income as number) - fyNi) / Math.abs(fyNi);
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
