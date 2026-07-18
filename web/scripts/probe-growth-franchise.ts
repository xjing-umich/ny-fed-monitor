/**
 * probe-growth-franchise.ts — 成长型 franchise 护城河旁路(moat_via_growth)的 BEFORE/AFTER 探针(只读)。
 * 对每只 ticker 跑真引擎,打印 moat 信号/grade/capYears/moat_via_growth(Task 4 前恒 false)/
 * g1(growth_g1)/IV(neutral)/verdict.bucket/marginPct,供各 Task BEFORE↔AFTER 逐项对照。
 * 不改任何引擎代码 —— 纯观测。
 *
 * 数据来源:Supabase(SEC 基本面 + 最新价)+ FRED DGS10(实时,取不到时探针内打印 fallback 提示)。
 *
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-growth-franchise.ts [TICKER...]
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getSecCompanyData } from "@/lib/sec/read";
import { getLatestPrice } from "@/lib/managers/priceRead";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
import {
  fundamentalsToFloorInput,
  computeValuationFloor,
  deriveStrikeZone,
  deriveOeDcf,
  reconcileMethods,
  deriveValuationVerdict,
  fundamentalsIntegrityViolated,
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

// 救回集(疑真franchise) + 对照集(真大宗,必须仍 commodity) + 零漂移对照(既有 franchise 不能变)
const DEFAULT = [
  "AMZN", "ARM", "EQIX", "EW", "AMD", "CEG", "CELH", "EMN", "AGCO", "DINO", "ARW", "ATI",
  "MSFT", "NFLX", "MA",
];
const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;

function n(x: number | null | undefined, d = 2): string {
  return x == null || !Number.isFinite(x) ? "—" : x.toFixed(d);
}
function pct(x: number | null | undefined, d = 1): string {
  return x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(d);
}

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  const dgs10 = await getLatestDgs10();
  console.log(
    dgs10
      ? `DGS10(实时/last-good, 来源 FRED via market_rates 或直连): ${dgs10.value}% as of ${dgs10.date}`
      : `DGS10: 不可得,deriveOeDcf 将走 fallback band(未锚定)`,
  );
  console.log(
    "ticker  signal          grade    capYears  via_growth  g1(%)  IV(neutral)  bucket    marginPct(%)",
  );

  for (const ticker of TICKERS) {
    try {
      const sec = await getSecCompanyData(ticker);
      const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
      const sicNum = sicRaw == null ? undefined : Number(sicRaw);
      const sic = sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
      const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual, 1, sic);
      const floor = computeValuationFloor(floorInput);
      if (!floor || floor.kind !== "floor") {
        console.log(`${ticker.padEnd(6)} (no floor: ${floor?.kind ?? "null"})`);
        continue;
      }

      const mr = floor.moat_reading;
      const mc = floor.moat_cap;
      // moat_via_growth 尚不存在(Task 4 才加到 MoatReading);BEFORE 阶段恒为 false。
      const viaGrowth = (mr as unknown as { moat_via_growth?: boolean })?.moat_via_growth ?? false;

      const price = await getLatestPrice(ticker);
      const strikeZone = price ? deriveStrikeZone(floor, price) : undefined;
      const oeDcf = deriveOeDcf(floor, floorInput.years, dgs10, price);
      const g1 = oeDcf?.growth_g1;
      const iv = oeDcf?.tiers?.neutral.per_share;

      let bucketStr = "—";
      let marginStr = "—";
      if (price) {
        const reconciliation =
          strikeZone && oeDcf ? reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, price) : undefined;
        const capitalStructureDistorted = mr.capital_structure_distorted === true;
        const fundamentalsCorrupt = fundamentalsIntegrityViolated(floorInput.years);
        const verdict = deriveValuationVerdict({
          floor,
          strikeZone,
          oeDcf,
          reconciliation,
          capitalStructureDistorted,
          fundamentalsCorrupt,
        });
        bucketStr = verdict ? verdict.bucket : "null(抑制)";
        marginStr = verdict ? pct(verdict.marginPct) : "—";
      } else {
        bucketStr = "(no price)";
      }

      console.log(
        `${ticker.padEnd(6)}  ${String(mr.signal).padEnd(15)} ${String(mc.grade).padEnd(8)} ` +
          `${String(mc.capYears).padEnd(9)} ${String(viaGrowth).padEnd(11)} ${pct(g1).padEnd(6)} ` +
          `${n(iv).padEnd(12)} ${bucketStr.padEnd(9)} ${marginStr}`,
      );
    } catch (e) {
      console.log(`${ticker.padEnd(6)} ERR ${String(e).slice(0, 120)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
