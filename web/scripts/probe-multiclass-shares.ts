/**
 * probe-multiclass-shares.ts — 分股类股数回退真数据验收探针(只读,不写库)。
 * 对 V / BRK.B / BRK.A:live 拉 submissions+10-K instance → 推导经济股数 →
 * 与 DB 里的 annual 行(缺股数)在内存合成 patched 行 → 走真引擎 runValuation 预览 verdict。
 * 硬断言:V 股数∈[1.8B,2.2B];BRK.B∈[2.0B,2.3B];双路偏差<1%;V/BRK.B verdict 非 null。
 * BRK.A 只打印不断言(挂牌 A 类,股数应 ~1.4e6 量级)。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-multiclass-shares.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { resolveTickerCik } from "@/lib/sec/ticker-cik";
import { fetchCompanySubmissions, normalizeRecentFilings } from "@/lib/sec/company-submissions";
import type { NormalizedFiling } from "@/lib/sec/company-submissions";
import { getSecCompanyData } from "@/lib/sec/read";
import { needsClassSharesFallback, applyClassSharesFallback } from "@/lib/sec/class-shares-fallback";
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
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
} from "@/lib/valuation";

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

type DerivedRow = { period_end: string; shares: number; eps: number | null; cross_check_pct: number; member: string };

/** 从 patch 后的行里挑出真被回退补上的那些(raw_facts.shares_diluted.derived===true),按 period_end 降序。 */
function extractDerivedRows(patchedAnnual: FundamentalPeriod[]): DerivedRow[] {
  const out: DerivedRow[] = [];
  for (const row of patchedAnnual) {
    const fact = (row.raw_facts as Record<string, unknown> | undefined)?.["shares_diluted"] as
      | { derived?: boolean; member?: string; cross_check_pct?: number }
      | undefined;
    if (!fact?.derived || row.shares_diluted == null) continue;
    out.push({
      period_end: row.period_end,
      shares: row.shares_diluted,
      eps: row.eps_diluted,
      cross_check_pct: fact.cross_check_pct ?? NaN,
      member: fact.member ?? "?",
    });
  }
  return out.sort((a, b) => b.period_end.localeCompare(a.period_end));
}

type TickerProbeResult = {
  ticker: string;
  sec: Awaited<ReturnType<typeof getSecCompanyData>>;
  patchedAnnual: FundamentalPeriod[];
  derivedRows: DerivedRow[];
  patched: number;
};

/** 每票:解析 CIK → 拉 submissions+filings(与 ingest 同路径)→ 读 DB annual → 深拷贝+回退(内存,不写库)。 */
async function probeTicker(ticker: string): Promise<TickerProbeResult | null> {
  console.log(`\n=== ${ticker} ===`);
  const match = await resolveTickerCik(ticker);
  if (!match) {
    assert(false, `${ticker}: resolveTickerCik 未解析到 CIK`);
    return null;
  }
  console.log(`  CIK=${match.cik}  company=${match.companyName}`);

  const submission = await fetchCompanySubmissions(match.cik);
  const filings: NormalizedFiling[] = normalizeRecentFilings(ticker, submission);
  const tenKCount = filings.filter((f) => f.form === "10-K").length;
  console.log(`  filings(近24)=${filings.length}  10-K=${tenKCount}`);

  const sec = await getSecCompanyData(ticker);
  const allSharesNull = sec.annual.length > 0 && sec.annual.every((p) => p.shares_diluted == null);
  const someNetIncome = sec.annual.some((p) => p.net_income != null);
  console.log(
    `  DB 现状: annual=${sec.annual.length} 行  shares_diluted 全 null=${allSharesNull}  存在 net_income=${someNetIncome}`,
  );

  const patchedAnnual = structuredClone(sec.annual) as FundamentalPeriod[];
  const needs = needsClassSharesFallback(patchedAnnual);
  assert(needs === true, `${ticker}: needsClassSharesFallback(DB annual) === true(窄闸命中)`);

  const patched = await applyClassSharesFallback(patchedAnnual, filings);
  const derivedRows = extractDerivedRows(patchedAnnual);
  console.log(`  applyClassSharesFallback 补上 ${patched} 年:`);
  for (const d of derivedRows) {
    console.log(
      `    ${d.period_end}: shares=${d.shares.toLocaleString()}  eps=${n(d.eps, 2)}` +
        `  cross_check_pct=${(d.cross_check_pct * 100).toFixed(3)}%  member=${d.member}`,
    );
  }
  if (!derivedRows.length) console.log("    (无补上的年份 — 诚实空缺)");

  return { ticker, sec, patchedAnnual, derivedRows, patched };
}

function getSic(sec: Awaited<ReturnType<typeof getSecCompanyData>>): number | undefined {
  const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
  const sicNum = sicRaw == null ? undefined : Number(sicRaw);
  return sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
}

/** verdict 预览:镜像 valuation-ingest.ts:130-180 的组装逻辑,用内存 patch 后的 annual 行代替 DB 行。 */
async function previewVerdict(
  ticker: string,
  sec: Awaited<ReturnType<typeof getSecCompanyData>>,
  patchedAnnual: FundamentalPeriod[],
  dgs10: { value: number; date: string } | null,
  computedAt: string,
) {
  const sic = getSic(sec);
  const ads = resolveAds(undefined, undefined); // V/BRK.B/BRK.A 均为普通挂牌股,非 ADR
  const floorInput = fundamentalsToFloorInput(ticker, ticker, patchedAnnual, ads.ratio, sic, sec.quarterly);
  const fundamentalsAsOf = floorInput.ttm?.period_end ?? patchedAnnual[0]?.period_end ?? null;
  const fundamentalsStale = isFundamentalsStale(fundamentalsAsOf, computedAt);
  const fetchedPrice = await getLatestPrice(ticker);
  const priceStale = fetchedPrice?.stale === true;
  const valuationPrice = priceStale ? null : fetchedPrice;
  const splitAsOf =
    floorInput.ttm && !floorInput.ttm.shares_from_fy ? floorInput.ttm.period_end : patchedAnnual[0]?.period_end ?? null;
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
      adsSuppressed: ads.suppressed,
      fundamentalsStale,
      priceStale,
      splitCoverageStale,
      fundamentalsCorrupt,
    },
    suppressExpectations: true,
  });
  return run;
}

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  const dgs10 = await getLatestDgs10();
  console.log(dgs10 ? `DGS10: ${dgs10.value}% as of ${dgs10.date}` : "DGS10: 不可用");
  const computedAt = new Date().toISOString();

  const V_RANGE: [number, number] = [1.8e9, 2.2e9];
  const BRKB_RANGE: [number, number] = [2.0e9, 2.3e9];

  const v = await probeTicker("V");
  await sleep(300);
  const brkB = await probeTicker("BRK.B");
  await sleep(300);
  const brkA = await probeTicker("BRK.A"); // 只打印,不断言

  console.log("\n--- 硬断言:推导股数 ---");
  if (v) {
    const latest = v.derivedRows[0];
    assert(latest != null, "V: 至少有一年被补上(推导非空)");
    if (latest) {
      assert(
        latest.shares >= V_RANGE[0] && latest.shares <= V_RANGE[1],
        `V 最新 FY(${latest.period_end}) shares=${latest.shares.toLocaleString()} ∈ [${V_RANGE[0].toExponential(1)}, ${V_RANGE[1].toExponential(1)}]`,
      );
      assert(latest.cross_check_pct < 0.01, `V 双路互证偏差 ${(latest.cross_check_pct * 100).toFixed(3)}% < 1%`);
    }
    assert(v.patched >= 3, `V: patched(${v.patched}) >= 3`);
  } else {
    assert(false, "V: 探针未取到结果");
  }

  if (brkB) {
    const latest = brkB.derivedRows[0];
    assert(latest != null, "BRK.B: 至少有一年被补上(推导非空)");
    if (latest) {
      assert(
        latest.shares >= BRKB_RANGE[0] && latest.shares <= BRKB_RANGE[1],
        `BRK.B 最新 FY(${latest.period_end}) shares=${latest.shares.toLocaleString()} ∈ [${BRKB_RANGE[0].toExponential(1)}, ${BRKB_RANGE[1].toExponential(1)}]`,
      );
      assert(latest.cross_check_pct < 0.01, `BRK.B 双路互证偏差 ${(latest.cross_check_pct * 100).toFixed(3)}% < 1%`);
    }
    assert(brkB.patched >= 3, `BRK.B: patched(${brkB.patched}) >= 3`);
  } else {
    assert(false, "BRK.B: 探针未取到结果");
  }

  if (brkA) {
    const latest = brkA.derivedRows[0];
    console.log(
      `\n[观测,不设门槛] BRK.A 最新 FY${latest ? ` ${latest.period_end} shares=${latest.shares.toLocaleString()}` : ": 无补上年份"}` +
        "(挂牌 A 类,股数应 ~1.4e6 量级 — 换算率约 1500x 内生于 EPS 比率)。",
    );
  }

  console.log("\n--- verdict 预览(镜像 valuation-ingest.ts:130-180) ---");
  for (const r of [v, brkB, brkA]) {
    if (!r) continue;
    const run = await previewVerdict(r.ticker, r.sec, r.patchedAnnual, dgs10, computedAt);
    const verdict = run.verdict;
    console.log(
      `  ${r.ticker}: suppressedReason=${run.suppressedReason ?? "—"}  floor.kind=${run.floor?.kind ?? "—"}` +
        `  verdict=${
          verdict
            ? `{bucket=${verdict.bucket}, rangeLo=${n(verdict.rangeLo)}, rangeHi=${n(verdict.rangeHi)}, price=${n(verdict.price)}, reliable=${verdict.reliable}}`
            : "null"
        }`,
    );
    if (r.ticker === "V" || r.ticker === "BRK.B") {
      assert(verdict !== null, `${r.ticker}: verdict !== null(G2 解除且未被 isImplausibleBand/splitCoverageStale 等闸拦下)`);
    }
  }

  console.log(`\n${ASSERT_FAILURES === 0 ? "全部断言通过" : `${ASSERT_FAILURES} 条断言失败`}`);
  if (ASSERT_FAILURES > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
