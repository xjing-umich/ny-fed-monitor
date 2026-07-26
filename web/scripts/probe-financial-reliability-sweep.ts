/**
 * probe-financial-reliability-sweep.ts — 件② 回归 sweep(只读)。
 * 对象:sec_companies 中 sic∈[6020,6099]∪[6100,6199]∪[6300,6399] 且在 valuation_snapshot
 * 或 consensus_holdings 里的票 + 非金融对照组(MSFT/GOOGL/NVDA/HRB/KLAC/COST)。
 * 每票用当前代码跑真引擎,与生产 valuation_snapshot 对比 (reliable, bucket),打印翻转表:
 *   ticker | sic | is_financial(new) | ai_flag_raw | snapshot(reliable,bucket) | now(reliable,bucket) | 预期成因
 * 预期成因判定:A=sic∈[6100,6199](is_financial 翻转) / B=is_financial && ai_flag_raw(豁免生效) / none。
 * 硬断言:①对照组 reliable/bucket 零翻转;②每个 reliable 翻转的成因 ∈ {A,B}(none → exit 1);
 * ③AXP: reliable=true 且 bucket="above"。价格漂移导致的 band 数值差不判失败,只打印。
 * ai_flag_raw 直接调 maintenanceCapex(floorInput 的 workingYears)取原始 flag(floor 对金融股已不发布)。
 *
 * 简化:引擎组装照抄 valuation-ingest.ts:130-180,但 ads 归一化直接传 resolveAds(undefined, null)
 * ——本 sweep 的金融票(银行/信贷机构/保险)均为本土非 ADR 名字,故省去 securities 表批量查询。
 *
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-financial-reliability-sweep.ts
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
  workingYears,
  maintenanceCapex,
} from "@/lib/valuation";
import { isFinancialSic, SIC_CREDIT_RANGE, SIC_BANK_RANGE, SIC_INSURANCE_RANGE } from "@/lib/valuation/moatCap";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 非金融对照组:与本次 sic 改动无关的名字,验证零漂移。
const CONTROL_TICKERS = ["MSFT", "GOOGL", "NVDA", "HRB", "KLAC", "COST"];

// 额外参考票(非硬断言对照组,仅供主线程逐票裁决参考):GS/MS/SCHW 是 62xx 券商(SIC 6211),
// 不在本次 sic∈[6020,6099]∪[6100,6199]∪[6300,6399] 扩围范围内(moatCap.ts 明文"不搭车")——
// 纳入 sweep 只为把这三票的零暴露落实成打印证据,不额外单设断言(它们仍受下方全局断言②覆盖:
// 若因未知原因翻转且成因非 A/B,同样会 exit 1)。
const EXTRA_REFERENCE_TICKERS = ["GS", "MS", "SCHW"];

let ASSERT_FAILURES = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    console.error(`  [FAIL] ${msg}`);
    ASSERT_FAILURES++;
  }
}

function getSic(sec: Awaited<ReturnType<typeof getSecCompanyData>>): number | undefined {
  const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
  const sicNum = sicRaw == null ? undefined : Number(sicRaw);
  return sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
}

function inCreditRange(sic: number | undefined): boolean {
  return sic != null && sic >= SIC_CREDIT_RANGE[0] && sic <= SIC_CREDIT_RANGE[1];
}

/** 预期成因:A=61xx is_financial 翻转 / B=已是金融但 ai_capex 豁免新生效 / none(不该出现)。 */
function classifyCause(sic: number | undefined, isFinancialNew: boolean, aiFlagRaw: boolean): "A" | "B" | "none" {
  if (inCreditRange(sic)) return "A";
  if (isFinancialNew && aiFlagRaw) return "B";
  return "none";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllPages(db: any, table: string, select: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table} 读取失败: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < 1000) break;
  }
  return rows;
}

type Snapshot = { reliable: boolean; bucket: string };

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  console.log(
    `金融 SIC 区间: 银行${JSON.stringify(SIC_BANK_RANGE)} 信贷机构${JSON.stringify(SIC_CREDIT_RANGE)} 保险${JSON.stringify(SIC_INSURANCE_RANGE)}`,
  );

  // 1) sec_companies 全量拉取(ticker,sic),本地过滤三段 sic 区间。
  const companyRows = await fetchAllPages(db, "sec_companies", "ticker,sic");
  const sicByTicker = new Map<string, number | undefined>();
  for (const r of companyRows) {
    const ticker = String(r.ticker).toUpperCase();
    const sicRaw = r.sic;
    const sicNum = sicRaw == null ? undefined : Number(sicRaw);
    sicByTicker.set(ticker, sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined);
  }
  const financialRangeTickers = Array.from(sicByTicker.entries())
    .filter(([, sic]) => isFinancialSic(sic))
    .map(([t]) => t);
  console.log(`sec_companies: ${companyRows.length} 行,金融 SIC 区间命中 ${financialRangeTickers.length} 票。`);

  // 2) valuation_snapshot 全量拉取(生产基线,旧代码算出的 reliable/bucket)。
  const snapshotRows = await fetchAllPages(db, "valuation_snapshot", "ticker,verdict_bucket,reliable");
  const snapshotByTicker = new Map<string, Snapshot>();
  for (const r of snapshotRows) {
    snapshotByTicker.set(String(r.ticker).toUpperCase(), {
      reliable: r.reliable === true,
      bucket: String(r.verdict_bucket),
    });
  }
  console.log(`valuation_snapshot: ${snapshotRows.length} 行。`);

  // 3) consensus_holdings 全量拉取(去重 ticker 集合)。
  const holdingRows = await fetchAllPages(db, "consensus_holdings", "ticker");
  const consensusTickers = new Set(holdingRows.map((r) => String(r.ticker).toUpperCase()));
  console.log(`consensus_holdings: ${holdingRows.length} 行,去重 ${consensusTickers.size} 票。`);

  // universe = 金融 sic 区间票 ∩ (在 valuation_snapshot 或 consensus_holdings 里) ∪ 对照组 ∪ 额外参考票。
  const universeSet = new Set<string>();
  for (const t of financialRangeTickers) {
    if (snapshotByTicker.has(t) || consensusTickers.has(t)) universeSet.add(t);
  }
  for (const t of CONTROL_TICKERS) universeSet.add(t);
  for (const t of EXTRA_REFERENCE_TICKERS) universeSet.add(t);
  const universe = Array.from(universeSet).sort();
  console.log(
    `\nSweep universe: ${universe.length} 票(金融 sic 区间票 ${universe.length - CONTROL_TICKERS.length - EXTRA_REFERENCE_TICKERS.length} + ` +
      `对照组 ${CONTROL_TICKERS.length} + 额外参考票(62xx 券商,不在扩围范围)${EXTRA_REFERENCE_TICKERS.length})。\n`,
  );

  const dgs10 = await getLatestDgs10();
  console.log(dgs10 ? `DGS10: ${dgs10.value}% as of ${dgs10.date}` : "DGS10: 不可用");
  const computedAt = new Date().toISOString();

  console.log(
    "\nticker   sic     is_fin(new)  ai_flag_raw  snapshot(reliable,bucket)   now(reliable,bucket)       成因   翻转",
  );

  type RowResult = {
    ticker: string;
    sic: number | undefined;
    isFinancialNew: boolean;
    aiFlagRaw: boolean;
    prod: Snapshot | undefined;
    now: Snapshot | null;
    suppressedReason?: string;
    cause: "A" | "B" | "none";
    reliableFlip: boolean | null;
    bucketFlip: boolean | null;
  };
  const results: RowResult[] = [];

  for (const ticker of universe) {
    try {
      const sec = await getSecCompanyData(ticker);
      if (!sec.company && !sec.annual?.length) {
        console.log(`${ticker.padEnd(8)} 跳过: SEC 基本面不可用`);
        await sleep(50);
        continue;
      }
      const ads = resolveAds(undefined, null); // 简化:本 sweep 票均本土非 ADR
      const sic = getSic(sec);
      const floorInput: ValuationFloorInput = fundamentalsToFloorInput(
        ticker,
        ticker,
        sec.annual,
        ads.ratio,
        sic,
        sec.quarterly,
      );
      const fundamentalsAsOf = floorInput.ttm?.period_end ?? sec.annual?.[0]?.period_end ?? null;
      const fundamentalsStale = isFundamentalsStale(fundamentalsAsOf, computedAt);
      const fetchedPrice = await getLatestPrice(ticker);
      const priceStale = fetchedPrice?.stale === true;
      const valuationPrice = priceStale ? null : fetchedPrice;
      const splitAsOf =
        floorInput.ttm && !floorInput.ttm.shares_from_fy
          ? floorInput.ttm.period_end
          : sec.annual?.[0]?.period_end ?? null;
      const splitCoverageStale = isSplitCoverageStale({
        fundamentalsAsOf: splitAsOf,
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
      const run: ValuationRun = runValuation({
        floorInput,
        price: valuationPrice,
        dgs10,
        guards,
        suppressExpectations: false,
      });

      const isFinancialNew = isFinancialSic(sic);
      // ai_flag_raw:floor 对金融股已不发布该字段,直接调 maintenanceCapex 取原始值(floorInput 的 workingYears)。
      const aiFlagRaw = maintenanceCapex(workingYears(floorInput)).ai_capex_distortion_warning === true;
      const cause = classifyCause(sic, isFinancialNew, aiFlagRaw);
      const prod = snapshotByTicker.get(ticker);

      if (!run.verdict) {
        console.log(
          `${ticker.padEnd(8)} ${String(sic ?? "—").padEnd(7)} ${String(isFinancialNew).padEnd(12)} ${String(aiFlagRaw).padEnd(12)} ` +
            `${(prod ? `${prod.reliable},${prod.bucket}` : "—(无生产行)").padEnd(27)} null(${run.suppressedReason ?? "抑制"}) —— 跳过对比(生产无行也属正常)`,
        );
        results.push({
          ticker,
          sic,
          isFinancialNew,
          aiFlagRaw,
          prod,
          now: null,
          suppressedReason: run.suppressedReason,
          cause,
          reliableFlip: null,
          bucketFlip: null,
        });
        await sleep(50);
        continue;
      }

      const now: Snapshot = { reliable: run.verdict.reliable, bucket: run.verdict.bucket };
      const reliableFlip = prod ? prod.reliable !== now.reliable : null;
      const bucketFlip = prod ? prod.bucket !== now.bucket : null;
      const flipTag = prod == null ? "无基线" : reliableFlip || bucketFlip ? "翻转" : "—";

      console.log(
        `${ticker.padEnd(8)} ${String(sic ?? "—").padEnd(7)} ${String(isFinancialNew).padEnd(12)} ${String(aiFlagRaw).padEnd(12)} ` +
          `${(prod ? `${prod.reliable},${prod.bucket}` : "—(无生产行)").padEnd(27)} ${`${now.reliable},${now.bucket}`.padEnd(26)} ${cause.padEnd(6)} ${flipTag}`,
      );

      results.push({ ticker, sic, isFinancialNew, aiFlagRaw, prod, now, cause, reliableFlip, bucketFlip });
    } catch (e) {
      console.log(`${ticker.padEnd(8)} ERR ${String(e).slice(0, 160)}`);
    }
    await sleep(50);
  }

  console.log("\n--- 断言 1: 对照组 reliable/bucket 零翻转 ---");
  for (const t of CONTROL_TICKERS) {
    const r = results.find((x) => x.ticker === t);
    if (!r) {
      assert(false, `${t}: 未取到结果(抓取失败)`);
      continue;
    }
    if (!r.now) {
      // 双方都无有效 verdict(生产也无该票行)→ 抑制状态一致,不是本次改动引入的翻转
      // (与非对照组票同规则:run.verdict===null 且生产无行时不判失败)。若生产曾有行而现在
      // 被抑制,则是疑似回归,仍须失败。
      if (!r.prod) {
        console.log(
          `  [PASS] ${t}: 双方均无有效 verdict(生产无行,现被抑制 suppressedReason=${r.suppressedReason})—— 与本次 sic/ai_capex 改动无关,视为零翻转`,
        );
      } else {
        assert(
          false,
          `${t}: 生产已有估值行(reliable=${r.prod.reliable},bucket=${r.prod.bucket}),现被引擎抑制(suppressedReason=${r.suppressedReason})——疑似回归`,
        );
      }
      continue;
    }
    if (!r.prod) {
      // now 算出了 verdict 但生产无该票行:与本次改动无关(对照组代码路径未变),无基线可比,不判失败。
      console.log(
        `  [PASS] ${t}: now 有 verdict(reliable=${r.now.reliable},bucket=${r.now.bucket})但生产无该票行 —— 无基线,非本次改动引入,不判失败`,
      );
      continue;
    }
    assert(r.reliableFlip === false, `${t}: reliable 零翻转(snapshot=${r.prod.reliable} now=${r.now.reliable})`);
    assert(r.bucketFlip === false, `${t}: bucket 零翻转(snapshot=${r.prod.bucket} now=${r.now.bucket})`);
  }

  console.log("\n--- 断言 2: 每个 reliable 翻转的成因 ∈ {A,B} ---");
  const reliableFlips = results.filter((r) => r.reliableFlip === true);
  if (reliableFlips.length === 0) {
    console.log("  (无 reliable 翻转票)");
  }
  for (const r of reliableFlips) {
    assert(
      r.cause !== "none",
      `${r.ticker}: reliable 翻转(snapshot=${r.prod?.reliable} now=${r.now?.reliable}) 成因=${r.cause}` +
        `(sic=${r.sic} is_financial(new)=${r.isFinancialNew} ai_flag_raw=${r.aiFlagRaw}) —— 应 ∈ {A,B}`,
    );
  }

  console.log("\n--- 断言 3: AXP reliable=true 且 bucket=\"above\" ---");
  const axp = results.find((r) => r.ticker === "AXP");
  if (!axp) {
    assert(false, "AXP: 未取到结果(可能不在 universe 内,检查 sic/snapshot/consensus_holdings 覆盖)");
  } else if (!axp.now) {
    assert(false, `AXP: 引擎抑制(verdict=null,suppressedReason=${axp.suppressedReason})`);
  } else {
    assert(axp.now.reliable === true, `AXP: reliable === true(实际 ${axp.now.reliable})`);
    assert(axp.now.bucket === "above", `AXP: bucket === "above"(实际 ${axp.now.bucket})`);
  }

  console.log(`\n${ASSERT_FAILURES === 0 ? "全部断言通过" : `${ASSERT_FAILURES} 条断言失败`}`);
  if (ASSERT_FAILURES > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
