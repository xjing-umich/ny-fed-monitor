/**
 * probe-marks-adjustment.ts — 件③真数据验收探针(只读,不写库)。
 * 调整组:BRK.B MKL RLI WTM RGA;零漂移组:FAF(阈值下最近邻20.6%) PGR V AXP MSFT。
 * 每票:live fetchCompanySubmissions+fetchCompanyFacts → normalizeRecentFilings →
 * normalizeCompanyFacts(真提取,含新字段,in-memory) → BRK.B/BRK.A 额外跑件①
 * applyClassSharesFallback 补股数(生产行可能尚无) → 双路真引擎:
 *   (a) baseline = annual/quarterly 的 investment_fv_gain_loss 全置 null(旧行为)
 *   (b) adjusted = 保留字段(新行为)
 * 打印表:ticker | materiality | 调整? | a(bucket,reliable,band,declined) | b(同) 。
 * 硬断言(违反 exit 1):
 *   1. 调整组五票 deriveMarksAdjustment 非空且 materiality ≥ 0.25;
 *   2. BRK.B FY2022 调整后 NI ∈ [29.5B, 32B](Buffett op earnings 对账);
 *   3. BRK.B (b) 路 verdict 非 null;
 *   4. 零漂移组五票 (a)(b) 两路 verdict JSON 逐字段全等;
 *   5. FAF 的 materiality < 0.25(阈值下最近邻,确认闸位)。
 * 注:本探针调用引擎时 suppressExpectations: true,与生产 valuation-ingest 的 false 不一致
 *   (不影响本探针验收的 verdict 字段;预期层在 marks 调整后的基数下尚未观测,属遗留观察项)。
 * 价格/DGS10 从 DB 只读;SEC 请求经 sec-client(带 UA),每票间 sleep(300)。
 * ads:探针票池均为普通挂牌股(非 ADR)→ resolveAds(undefined, null) 简化
 * (镜像 valuation-ingest.ts:130-180 的 ads 分支,本探针不涉及 ADR 归一化)。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-marks-adjustment.ts
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
  deriveMarksAdjustment,
  MARKS_MATERIALITY_MIN,
  MARKS_MIN_ALIGNED_YEARS,
  resolveAds,
  isFundamentalsStale,
  isSplitCoverageStale,
  fundamentalsIntegrityViolated,
  runValuation,
} from "@/lib/valuation";
import type { MarksAdjustment } from "@/lib/valuation/types";
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
function pct(x: number | null | undefined, d = 1): string {
  return x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(d) + "%";
}

const ADJUSTED_GROUP = ["BRK.B", "MKL", "RLI", "WTM", "RGA"];
const ZERO_DRIFT_GROUP = ["FAF", "PGR", "V", "AXP", "MSFT"];

/** FY 行提取+排序,逐字镜像 fundamentalsToFloorInput 内部逻辑(用于探针直接调用 deriveMarksAdjustment 做展示/断言)。 */
function extractFyRows(rows: FundamentalPeriod[]): FundamentalPeriod[] {
  return rows
    .filter((r) => r.fiscal_period === "FY" && r.fiscal_year != null)
    .sort((a, b) => (b.period_end ?? "").localeCompare(a.period_end ?? ""));
}

/** baseline 路:structuredClone 后把 annual/quarterly 每行 investment_fv_gain_loss 置 null(旧行为,件③前)。 */
function toBaseline(rows: FundamentalPeriod[]): FundamentalPeriod[] {
  const cloned = structuredClone(rows) as FundamentalPeriod[];
  for (const r of cloned) r.investment_fv_gain_loss = null;
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

function fmtLeg(run: ValuationRun): string {
  const v = run.verdict;
  if (!v) return `verdict=null(suppressedReason=${run.suppressedReason ?? "—"})`;
  return `bucket=${v.bucket} reliable=${v.reliable} band=[${n(v.rangeLo)},${n(v.rangeHi)}] declined=${run.oeDcf?.declined ?? "—"}`;
}

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  const dgs10 = await getLatestDgs10();
  console.log(dgs10 ? `DGS10: ${dgs10.value}% as of ${dgs10.date}` : "DGS10: 不可用");
  const computedAt = new Date().toISOString();

  const allTickers = [...ADJUSTED_GROUP, ...ZERO_DRIFT_GROUP];
  const dataByTicker = new Map<string, TickerData>();
  for (const ticker of allTickers) {
    const data = await probeTicker(ticker);
    if (data) dataByTicker.set(ticker, data);
    await sleep(300);
  }

  type Row = {
    ticker: string;
    group: "adjusted" | "zero_drift";
    marksRaw: MarksAdjustment | undefined; // 探针直接调用 deriveMarksAdjustment,用于展示/断言 materiality(即便低于阈值)
    a: { floorInput: ReturnType<typeof fundamentalsToFloorInput>; run: ValuationRun };
    b: { floorInput: ReturnType<typeof fundamentalsToFloorInput>; run: ValuationRun };
  };
  const rows: Row[] = [];

  console.log("\n--- 双路真引擎(a=baseline gains置null / b=adjusted 保留) ---");
  for (const ticker of allTickers) {
    const data = dataByTicker.get(ticker);
    if (!data) continue;
    const group: "adjusted" | "zero_drift" = ADJUSTED_GROUP.includes(ticker) ? "adjusted" : "zero_drift";

    // 探针直接调用 deriveMarksAdjustment(逐字镜像 fundamentalsToFloorInput 内部 fyRows 提取),
    // 展示每票 materiality(哪怕低于 0.25 阈值未启用调整,如 FAF 也要打印出真实数值供断言5)。
    const fyRows = extractFyRows(data.adjustedAnnual);
    const marksRaw = deriveMarksAdjustment(fyRows);

    const a = await runEngineLeg(ticker, data.baselineAnnual, data.baselineQuarterly, data.sic, dgs10, computedAt);
    const b = await runEngineLeg(ticker, data.adjustedAnnual, data.adjustedQuarterly, data.sic, dgs10, computedAt);
    rows.push({ ticker, group, marksRaw, a, b });
    await sleep(300);
  }

  console.log("\n--- 对比表 ---");
  console.log(
    "ticker".padEnd(8) +
      "group".padEnd(12) +
      "materiality".padEnd(13) +
      "调整?".padEnd(7) +
      "a(baseline)".padEnd(60) +
      "b(adjusted)",
  );
  for (const r of rows) {
    const materiality = r.marksRaw?.materiality;
    console.log(
      r.ticker.padEnd(8) +
        r.group.padEnd(12) +
        pct(materiality).padEnd(13) +
        String(r.marksRaw != null).padEnd(7) +
        fmtLeg(r.a.run).padEnd(60) +
        fmtLeg(r.b.run),
    );
  }

  // 调整组:打印 per_year adjusted NI 明细(BRK.B 重点看 FY2022)。
  console.log("\n--- 调整组 per_year 明细(pretax gains / NI reported→adjusted) ---");
  for (const r of rows) {
    if (r.group !== "adjusted") continue;
    console.log(`  ${r.ticker}: materiality=${pct(r.marksRaw?.materiality)}`);
    for (const y of r.marksRaw?.per_year ?? []) {
      console.log(
        `    FY${y.fiscal_year}: pretax_gain=${money(y.pretax)}  NI_reported=${money(y.net_income_reported)}` +
          `  NI_adjusted=${money(y.net_income_adjusted)}`,
      );
    }
  }

  console.log("\n--- 硬断言 ---");

  // 1. 调整组五票 deriveMarksAdjustment 非空且 materiality ≥ 0.25
  console.log("\n[断言1] 调整组五票 deriveMarksAdjustment 非空且 materiality ≥ 0.25");
  for (const ticker of ADJUSTED_GROUP) {
    const row = rows.find((r) => r.ticker === ticker);
    const marks = row?.marksRaw;
    assert(marks != null, `${ticker}: deriveMarksAdjustment 非空(niYears≥${MARKS_MIN_ALIGNED_YEARS} 且 gains 全覆盖)`);
    if (marks) {
      assert(
        marks.materiality >= MARKS_MATERIALITY_MIN,
        `${ticker}: materiality=${pct(marks.materiality)} ≥ ${pct(MARKS_MATERIALITY_MIN)}`,
      );
    }
  }

  // 2. BRK.B FY2022 调整后 NI ∈ [29.5B, 32B]
  console.log("\n[断言2] BRK.B FY2022 调整后 NI ∈ [29.5B, 32B](Buffett op earnings 对账)");
  const brkRow = rows.find((r) => r.ticker === "BRK.B");
  const brk2022 = brkRow?.marksRaw?.per_year.find((y) => y.fiscal_year === 2022);
  assert(brk2022 != null, "BRK.B: FY2022 存在于 marks_adjustment.per_year");
  if (brk2022) {
    const lo = 29.5e9;
    const hi = 32e9;
    assert(
      brk2022.net_income_adjusted >= lo && brk2022.net_income_adjusted <= hi,
      `BRK.B FY2022 NI_adjusted=${money(brk2022.net_income_adjusted)} ∈ [${money(lo)}, ${money(hi)}]`,
    );
  }

  // 3. BRK.B (b) 路 verdict 非 null
  console.log("\n[断言3] BRK.B (b)路 verdict 非 null");
  assert(brkRow?.b.run.verdict != null, `BRK.B (b)路 verdict=${brkRow ? fmtLeg(brkRow.b.run) : "(无数据)"}`);

  // 4. 零漂移组五票 (a)(b) 两路 verdict JSON 逐字段全等
  console.log("\n[断言4] 零漂移组五票 (a)(b) 两路 verdict JSON 逐字段全等");
  for (const ticker of ZERO_DRIFT_GROUP) {
    const row = rows.find((r) => r.ticker === ticker);
    if (!row) {
      assert(false, `${ticker}: 探针未取到结果`);
      continue;
    }
    const aJson = JSON.stringify(row.a.run.verdict);
    const bJson = JSON.stringify(row.b.run.verdict);
    assert(
      aJson === bJson,
      `${ticker}: (a)(b) verdict 全等 — a=${fmtLeg(row.a.run)}  b=${fmtLeg(row.b.run)}`,
    );
  }

  // 5. FAF materiality < 0.25
  console.log("\n[断言5] FAF materiality < 0.25(阈值下最近邻,确认闸位)");
  const fafRow = rows.find((r) => r.ticker === "FAF");
  const fafFyRows = fafRow ? extractFyRows(dataByTicker.get("FAF")!.adjustedAnnual) : [];
  // FAF 未过阈值 → deriveMarksAdjustment 返回 undefined,materiality 需就地重算(与内部同式,只是不设阈值早退)。
  const fafNiYears = fafFyRows.filter((r) => r.net_income != null);
  let fafMateriality: number | null = null;
  if (fafNiYears.length >= MARKS_MIN_ALIGNED_YEARS && fafNiYears.every((r) => r.investment_fv_gain_loss != null)) {
    const meanGain = fafNiYears.reduce((s, r) => s + (r.investment_fv_gain_loss as number), 0) / fafNiYears.length;
    const meanAbsNi = fafNiYears.reduce((s, r) => s + Math.abs(r.net_income as number), 0) / fafNiYears.length;
    if (meanAbsNi > 0) fafMateriality = Math.abs(meanGain) / meanAbsNi;
  }
  assert(fafMateriality != null, "FAF: materiality 可计算(覆盖完整+对齐年数≥3)");
  if (fafMateriality != null) {
    assert(fafMateriality < MARKS_MATERIALITY_MIN, `FAF: materiality=${pct(fafMateriality)} < ${pct(MARKS_MATERIALITY_MIN)}`);
  }
  assert(fafRow?.marksRaw == null, `FAF: deriveMarksAdjustment 应为 undefined(阈值下未启用调整)`);

  console.log(`\n${ASSERT_FAILURES === 0 ? "全部断言通过" : `${ASSERT_FAILURES} 条断言失败`}`);
  if (ASSERT_FAILURES > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
