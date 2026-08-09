/**
 * probe-holdco-not-assessable.ts — 件④ 真数据验收探针(只读,不写库)。
 * 候选组(marks 生效的五家):BRK.B BRK.A MKL RLI WTM RGA;零漂移组:PGR CB AFL MSFT V AXP。
 * 每票 live fetchCompanySubmissions+fetchCompanyFacts → normalizeCompanyFacts(真提取,含
 * equity_securities_fv,in-memory) → BRK.A/BRK.B 额外跑件① applyClassSharesFallback 补股数 →
 * 双路真引擎:(a) baseline = 每行 equity_securities_fv 置 null(旧行为) (b) 保留字段(新行为)。
 * 打印:ticker | marks | equity_sec | EPV/AV(oper) a→b | moat a→b | verdict a→b。
 * 硬断言(违反 exit 1):
 *   1. BRK.B:(a) moat=value_destruction 且 verdict 非 null;(b) moat=not_assessable 且 verdict=null;
 *   2. BRK.B (b) 路修正后 epvAvRatioOperating ∈ [0.9, 1.2];
 *   3. MKL/RLI:(b) 路 moat 仍为 franchise 且 verdict 非 null(未被误伤);
 *   4. 零漂移组六票:(a)(b) 两路 verdict JSON 逐字段全等且 moat signal 相同;
 *   5. RGA/WTM 只打印不断言(实测供主线程逐票裁决)。
 * 引擎组装镜像 valuation-ingest.ts:130-180;ads 简化 resolveAds(undefined,null)(本组均本土非 ADR)。
 *
 * epvAvRatioOperating 重构说明:该比值是 epvFloor.ts assembleFloor() 内部的 const,未暴露在任何公开类型上
 * (ValuationFloor/MoatReading/ValuationRun 均无此字段;holdco_not_assessable=true 时 moat_reading 还会
 * 被整体替换,原本携带的 epv_per_share_compared/asset_per_share_compared 也一并丢失)。为了在探针里拿到
 * 这个数(断言2),本文件用"影子跑"精确复算:对同一个 floorInput 删除 marks_adjustment 字段后重跑一次
 * computeValuationFloor —— marks_adjustment 只影响 assembleFloor 内的 gate①(holdco 判定)与披露文案,
 * 不改变任何数值路径(years[].net_income 已经在 fundamentalsToFloorInput 里按件③提前烤入调整值,与
 * marks_adjustment 元数据是否挂载无关),所以影子跑能拿到未被 not_assessable 覆盖的原始 moat_reading,
 * 从中读出精确的 epv_per_share_compared / asset_per_share_compared,再用导出的 workingYears/TARGET_YEARS/
 * MIN_YEARS/OPERATING_CASH_PCT 逐字镜像 epvFloor.ts:150-153(shares 选取)与 epvFloor.ts:272-289
 * (excessCashPerShare/markedSecuritiesPerShare/assetOperating)重算,不是近似估计。
 *
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-holdco-not-assessable.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { resolveTickerCik } from "@/lib/sec/ticker-cik";
import { fetchCompanySubmissions, normalizeRecentFilings } from "@/lib/sec/company-submissions";
import { fetchCompanyFacts } from "@/lib/sec/company-facts";
import { normalizeCompanyFacts, type FundamentalPeriod } from "@/lib/sec/normalize-facts";
import { getSecCompanyData } from "@/lib/sec/read";
import { needsClassSharesFallback, applyClassSharesFallback } from "@/lib/sec/class-shares-fallback";
import { sleep } from "@/lib/sec/sec-client";
import { getLatestPrice, getLatestSplit } from "@/lib/managers/priceRead";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
import {
  fundamentalsToFloorInput,
  resolveAds,
  isFundamentalsStale,
  isSplitCoverageStale,
  fundamentalsIntegrityViolated,
  runValuation,
  computeValuationFloor,
  workingYears,
  TARGET_YEARS,
  MIN_YEARS,
} from "@/lib/valuation";
import { OPERATING_CASH_PCT } from "@/lib/valuation/moatCap";
import type { ValuationFloorInput, ValuationFloorYear, MoatSignal } from "@/lib/valuation/types";
import type { ValuationRun } from "@/lib/valuation/runValuation";

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

let ASSERT_FAILURES = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    console.error(`  [FAIL] ${msg}`);
    ASSERT_FAILURES++;
  }
}

function n(x: number | null | undefined, d = 2): string {
  return x == null || !Number.isFinite(x) ? "—" : x.toFixed(d);
}
function money(x: number | null | undefined): string {
  return x == null || !Number.isFinite(x) ? "—" : (x / 1e9).toFixed(2) + "B";
}

const CANDIDATE_GROUP = ["BRK.B", "BRK.A", "MKL", "RLI", "WTM", "RGA"];
const ZERO_DRIFT_GROUP = ["PGR", "CB", "AFL", "MSFT", "V", "AXP"];

/** baseline 路:structuredClone 后把 annual/quarterly 每行 equity_securities_fv 置 null(旧行为,件④前)。 */
function toBaseline(rows: FundamentalPeriod[]): FundamentalPeriod[] {
  const cloned = structuredClone(rows) as FundamentalPeriod[];
  for (const r of cloned) r.equity_securities_fv = null;
  return cloned;
}

type TickerData = {
  ticker: string;
  sic?: number;
  adjustedAnnual: FundamentalPeriod[];
  adjustedQuarterly: FundamentalPeriod[];
  baselineAnnual: FundamentalPeriod[];
  baselineQuarterly: FundamentalPeriod[];
  patchedShares: number;
};

/** 每票:解析 CIK → live 拉 submissions+facts → normalizeCompanyFacts(真提取,in-memory)→ 件①股数回退(命中才跑)。 */
async function probeTicker(ticker: string): Promise<TickerData | null> {
  console.log(`\n=== ${ticker} ===`);
  const match = await resolveTickerCik(ticker);
  if (!match) {
    assert(false, `${ticker}: resolveTickerCik 未解析到 CIK`);
    return null;
  }
  console.log(`  CIK=${match.cik}  company=${match.companyName}`);

  const [submission, facts] = await Promise.all([fetchCompanySubmissions(match.cik), fetchCompanyFacts(match.cik)]);
  const filings = normalizeRecentFilings(ticker, submission);
  const normalized = normalizeCompanyFacts(ticker, match.cik, facts, filings, submission.fiscalYearEnd);
  console.log(`  normalizeCompanyFacts: annual=${normalized.annual.length}行  quarterly=${normalized.quarterly.length}行`);

  let patchedShares = 0;
  if (needsClassSharesFallback(normalized.annual)) {
    patchedShares = await applyClassSharesFallback(normalized.annual, filings);
    console.log(`  件① class-shares fallback 命中: patched ${patchedShares} 年(in-memory,不写库)`);
  } else {
    console.log(`  件① class-shares fallback 未命中(股数非全 null,无需回退)`);
  }

  const dbRow = await getSecCompanyData(ticker);
  const sicRaw = (dbRow.company as { sic?: unknown } | null)?.sic;
  const sicNum = sicRaw == null ? undefined : Number(sicRaw);
  const sic = sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
  console.log(`  sic(sec_companies DB, text→number)=${sic ?? "—"}`);

  const eqFy = normalized.annual.find((r) => r.fiscal_period === "FY" && r.equity_securities_fv != null);
  console.log(`  equity_securities_fv(最近一条 FY 有值行)=${eqFy ? money(eqFy.equity_securities_fv) + ` (FY${eqFy.fiscal_year})` : "—"}`);

  return {
    ticker,
    sic,
    adjustedAnnual: normalized.annual,
    adjustedQuarterly: normalized.quarterly,
    baselineAnnual: toBaseline(normalized.annual),
    baselineQuarterly: toBaseline(normalized.quarterly),
    patchedShares,
  };
}

/** 真引擎单路运行:guards 组装镜像 valuation-ingest.ts:130-180,ads 简化为 resolveAds(undefined, null)。 */
async function runEngineLeg(
  ticker: string,
  annual: FundamentalPeriod[],
  quarterly: FundamentalPeriod[],
  sic: number | undefined,
  dgs10: { value: number; date: string } | null,
  computedAt: string,
) {
  const ads = resolveAds(undefined, null); // 探针票池均非 ADR
  const floorInput = fundamentalsToFloorInput(ticker, ticker, annual, ads.ratio, sic, quarterly);
  const fundamentalsAsOf = floorInput.ttm?.period_end ?? annual[0]?.period_end ?? null;
  const fundamentalsStale = isFundamentalsStale(fundamentalsAsOf, computedAt);
  const fetchedPrice = await getLatestPrice(ticker);
  const priceStale = fetchedPrice?.stale === true;
  const valuationPrice = priceStale ? null : fetchedPrice;
  const splitAsOf =
    floorInput.ttm && !floorInput.ttm.shares_from_fy ? floorInput.ttm.period_end : annual[0]?.period_end ?? null;
  const splitCoverageStale = isSplitCoverageStale({
    fundamentalsAsOf: splitAsOf,
    latestSplitDate: await getLatestSplit(ticker),
  });
  const fundamentalsCorrupt = fundamentalsIntegrityViolated(floorInput.years);
  const run: ValuationRun = runValuation({
    floorInput,
    price: valuationPrice,
    dgs10,
    guards: {
      adsSuppressed: ads.suppressed,
      fundamentalsStale,
      priceStale,
      splitCoverageStale,
      fundamentalsCorrupt,
    },
    suppressExpectations: true,
  });
  return { floorInput, run };
}

/** selectEarningsYears 镜像(epvFloor.ts:108-113,私有未导出,逐字复刻)。 */
function selectEarningsYears(years: ValuationFloorYear[]): ValuationFloorYear[] {
  return years
    .filter((y) => y.net_income != null)
    .sort((a, b) => b.fiscal_year - a.fiscal_year)
    .slice(0, TARGET_YEARS);
}

/** marginOf/selectYears 镜像(epvFloor.ts:94-105,私有未导出,逐字复刻)。 */
function marginOf(y: ValuationFloorYear): number | undefined {
  if (y.operating_margin != null) return y.operating_margin;
  if (y.operating_income != null && y.revenue) return y.operating_income / y.revenue;
  return undefined;
}
function selectYears(years: ValuationFloorYear[]): ValuationFloorYear[] {
  return years
    .filter((y) => y.revenue != null && marginOf(y) != null && y.net_income != null)
    .sort((a, b) => b.fiscal_year - a.fiscal_year)
    .slice(0, TARGET_YEARS);
}

/**
 * epvAvRatioOperating 精确重算(见头注释"epvAvRatioOperating 重构说明")。
 * 影子跑:同一 floorInput 剥掉 marks_adjustment 直接喂 computeValuationFloor,拿未被 not_assessable
 * 覆盖的原始 moat_reading(epv_per_share_compared/asset_per_share_compared),数值路径与真跑完全同源。
 */
function computeEpvAvRatioOperating(floorInput: ValuationFloorInput): number | undefined {
  const { marks_adjustment: _drop, ...shadowInput } = floorInput;
  void _drop;
  const shadow = computeValuationFloor(shadowInput);
  if (!shadow || shadow.kind !== "floor") return undefined;
  const epvMid = shadow.moat_reading.epv_per_share_compared;
  const avCons = shadow.moat_reading.asset_per_share_compared;
  if (epvMid == null || avCons == null) return undefined;

  const workYears = workingYears(floorInput);
  const earningsYears = selectEarningsYears(workYears);
  const marginYears = selectYears(workYears);
  const years = marginYears.length >= MIN_YEARS ? marginYears : earningsYears; // epvFloor.ts:164-165 分支镜像
  const latest = years[0];
  if (!latest) return undefined;

  const shares =
    earningsYears.map((y) => y.shares_diluted).find((s) => s != null && s > 0) ??
    workYears.map((y) => y.shares_diluted).find((s) => s != null && s > 0);
  if (shares == null || !(shares > 0)) return undefined;

  const excessCashPerShare =
    latest.cash != null && latest.revenue != null
      ? Math.max(0, latest.cash - OPERATING_CASH_PCT * latest.revenue) / shares
      : 0;
  const markedSecuritiesPerShare = latest.equity_securities_fv != null ? latest.equity_securities_fv / shares : 0;
  const assetOperating = avCons - excessCashPerShare - markedSecuritiesPerShare;
  return assetOperating > 0 ? epvMid / assetOperating : undefined;
}

function moatSignalOf(run: ValuationRun): MoatSignal | undefined {
  return run.floor && run.floor.kind === "floor" ? run.floor.moat_reading.signal : undefined;
}

function fmtLeg(run: ValuationRun): string {
  const v = run.verdict;
  if (!v) return `verdict=null(suppressedReason=${run.suppressedReason ?? "—"})`;
  return `bucket=${v.bucket} reliable=${v.reliable} band=[${n(v.rangeLo)},${n(v.rangeHi)}]`;
}

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  const dgs10 = await getLatestDgs10();
  console.log(dgs10 ? `DGS10: ${dgs10.value}% as of ${dgs10.date}` : "DGS10: 不可用");
  const computedAt = new Date().toISOString();

  const allTickers = [...CANDIDATE_GROUP, ...ZERO_DRIFT_GROUP];
  const dataByTicker = new Map<string, TickerData>();
  for (const ticker of allTickers) {
    const data = await probeTicker(ticker);
    if (data) dataByTicker.set(ticker, data);
    await sleep(300);
  }

  type Row = {
    ticker: string;
    group: "candidate" | "zero_drift";
    holdcoNotAssessableA: boolean | undefined;
    holdcoNotAssessableB: boolean | undefined;
    marksMaterialityB: number | undefined;
    equitySecFvB: number | null | undefined;
    epvAvOperA: number | undefined;
    epvAvOperB: number | undefined;
    moatA: MoatSignal | undefined;
    moatB: MoatSignal | undefined;
    a: { floorInput: ValuationFloorInput; run: ValuationRun };
    b: { floorInput: ValuationFloorInput; run: ValuationRun };
  };
  const rows: Row[] = [];

  console.log("\n--- 双路真引擎(a=baseline equity_securities_fv置null / b=adjusted 保留) ---");
  for (const ticker of allTickers) {
    const data = dataByTicker.get(ticker);
    if (!data) continue;
    const group: "candidate" | "zero_drift" = CANDIDATE_GROUP.includes(ticker) ? "candidate" : "zero_drift";

    const a = await runEngineLeg(ticker, data.baselineAnnual, data.baselineQuarterly, data.sic, dgs10, computedAt);
    await sleep(300);
    const b = await runEngineLeg(ticker, data.adjustedAnnual, data.adjustedQuarterly, data.sic, dgs10, computedAt);
    await sleep(300);

    const floorA = a.run.floor && a.run.floor.kind === "floor" ? a.run.floor : undefined;
    const floorB = b.run.floor && b.run.floor.kind === "floor" ? b.run.floor : undefined;
    const latestFyB = data.adjustedAnnual.find((r) => r.fiscal_period === "FY" && r.equity_securities_fv != null);

    rows.push({
      ticker,
      group,
      holdcoNotAssessableA: floorA?.holdco_not_assessable,
      holdcoNotAssessableB: floorB?.holdco_not_assessable,
      marksMaterialityB: floorB?.marks_adjustment?.materiality,
      equitySecFvB: latestFyB?.equity_securities_fv,
      epvAvOperA: computeEpvAvRatioOperating(a.floorInput),
      epvAvOperB: computeEpvAvRatioOperating(b.floorInput),
      moatA: moatSignalOf(a.run),
      moatB: moatSignalOf(b.run),
      a,
      b,
    });
  }

  console.log("\n--- 对比表 ---");
  console.log(
    "ticker".padEnd(8) +
      "marks".padEnd(9) +
      "equity_sec".padEnd(12) +
      "EPV/AV(oper) a→b".padEnd(22) +
      "moat a→b".padEnd(34) +
      "holdco a→b".padEnd(14) +
      "verdict a→b",
  );
  for (const r of rows) {
    console.log(
      r.ticker.padEnd(8) +
        (r.marksMaterialityB != null ? (r.marksMaterialityB * 100).toFixed(1) + "%" : "—").padEnd(9) +
        money(r.equitySecFvB).padEnd(12) +
        `${n(r.epvAvOperA)}→${n(r.epvAvOperB)}`.padEnd(22) +
        `${r.moatA ?? "—"}→${r.moatB ?? "—"}`.padEnd(34) +
        `${String(r.holdcoNotAssessableA === true)}→${String(r.holdcoNotAssessableB === true)}`.padEnd(14) +
        `${fmtLeg(r.a.run)}  →  ${fmtLeg(r.b.run)}`,
    );
  }

  console.log("\n--- 硬断言 ---");

  // 1. BRK.B (a) moat=value_destruction 且 verdict 非 null;(b) moat=not_assessable 且 verdict=null
  console.log("\n[断言1] BRK.B (a) moat=value_destruction 且 verdict 非 null;(b) moat=not_assessable 且 verdict=null");
  const brk = rows.find((r) => r.ticker === "BRK.B");
  assert(brk != null, "BRK.B: 探针取到结果");
  if (brk) {
    assert(brk.moatA === "value_destruction", `BRK.B (a)路 moat=${brk.moatA} (期望 value_destruction)`);
    assert(brk.a.run.verdict != null, `BRK.B (a)路 verdict=${fmtLeg(brk.a.run)} (期望非 null)`);
    assert(brk.moatB === "not_assessable", `BRK.B (b)路 moat=${brk.moatB} (期望 not_assessable)`);
    assert(brk.b.run.verdict == null, `BRK.B (b)路 verdict=${fmtLeg(brk.b.run)} (期望 null)`);
  }

  // 2. BRK.B (b) 路修正后 epvAvRatioOperating ∈ [0.9, 1.2]
  console.log("\n[断言2] BRK.B (b)路修正后 epvAvRatioOperating ∈ [0.9, 1.2]");
  if (brk) {
    assert(
      brk.epvAvOperB != null && brk.epvAvOperB >= 0.9 && brk.epvAvOperB <= 1.2,
      `BRK.B (b)路 epvAvRatioOperating=${n(brk.epvAvOperB, 4)} ∈ [0.9, 1.2]`,
    );
  }

  // 3. MKL/RLI:(b) 路 moat 仍为 franchise 且 verdict 非 null(未被误伤)
  console.log("\n[断言3] MKL/RLI:(b)路 moat 仍为 franchise 且 verdict 非 null(未被误伤)");
  for (const ticker of ["MKL", "RLI"]) {
    const row = rows.find((r) => r.ticker === ticker);
    if (!row) {
      assert(false, `${ticker}: 探针未取到结果`);
      continue;
    }
    assert(row.moatB === "franchise", `${ticker} (b)路 moat=${row.moatB} (期望 franchise,未被误伤)`);
    assert(row.b.run.verdict != null, `${ticker} (b)路 verdict=${fmtLeg(row.b.run)} (期望非 null)`);
  }

  // 4. 零漂移组六票:(a)(b) 两路 verdict JSON 逐字段全等且 moat signal 相同
  console.log("\n[断言4] 零漂移组六票:(a)(b) 两路 verdict JSON 逐字段全等且 moat signal 相同");
  for (const ticker of ZERO_DRIFT_GROUP) {
    const row = rows.find((r) => r.ticker === ticker);
    if (!row) {
      assert(false, `${ticker}: 探针未取到结果`);
      continue;
    }
    const aJson = JSON.stringify(row.a.run.verdict);
    const bJson = JSON.stringify(row.b.run.verdict);
    assert(aJson === bJson, `${ticker}: (a)(b) verdict 全等 — a=${fmtLeg(row.a.run)}  b=${fmtLeg(row.b.run)}`);
    assert(row.moatA === row.moatB, `${ticker}: (a)(b) moat signal 相同 — a=${row.moatA}  b=${row.moatB}`);
  }

  // 5. RGA/WTM:只打印不断言(实测供主线程逐票裁决)
  console.log("\n[断言5] RGA/WTM:只打印不断言(实测走向供主线程裁决,不设硬门槛)");
  for (const ticker of ["RGA", "WTM"]) {
    const row = rows.find((r) => r.ticker === ticker);
    if (!row) {
      console.log(`  ${ticker}: 探针未取到结果`);
      continue;
    }
    console.log(
      `  ${ticker}: marks materiality=${row.marksMaterialityB != null ? (row.marksMaterialityB * 100).toFixed(1) + "%" : "—"}` +
        `  equity_sec_fv=${money(row.equitySecFvB)}  epvAvOper a→b=${n(row.epvAvOperA)}→${n(row.epvAvOperB)}` +
        `  moat a→b=${row.moatA ?? "—"}→${row.moatB ?? "—"}  holdco a→b=${row.holdcoNotAssessableA === true}→${row.holdcoNotAssessableB === true}` +
        `  verdict a→b: ${fmtLeg(row.a.run)}  →  ${fmtLeg(row.b.run)}`,
    );
  }

  console.log(`\n${ASSERT_FAILURES === 0 ? "全部断言通过" : `${ASSERT_FAILURES} 条断言失败`}`);
  if (ASSERT_FAILURES > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
