/**
 * probe-klac-split.ts — 复现 KLAC 拆股口径错配假信号。
 * 读 SEC 基本面(shares_diluted)+ 最新价格,跑真实引擎 computeValuationFloor →
 * deriveStrikeZone → deriveOeDcf → deriveValuationVerdict,打印口径与判定。只读。
 *
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-klac-split.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getSecCompanyData } from "@/lib/sec/read";
import {
  fundamentalsToFloorInput,
  computeValuationFloor,
  deriveStrikeZone,
  deriveOeDcf,
  reconcileMethods,
  deriveValuationVerdict,
  pickLatestFredPoint,
} from "@/lib/valuation";
import { getLatestPrice } from "@/lib/managers/priceRead";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const candidates = [path.join(__dirname, "../.env.local"), "/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web/.env.local"];
  const out: Record<string, string> = {};
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
      break;
    }
  }
  return { ...out, ...process.env } as Record<string, string>;
}

const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : ["KLAC"];

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("BLOCKED: 缺少 SUPABASE 凭据。");
    process.exit(1);
  }

  for (const ticker of TICKERS) {
    console.log(`\n======== ${ticker} ========`);
    const sec = await getSecCompanyData(ticker);
    const fyRows = (sec.annual ?? []).filter((r) => r.fiscal_period === "FY");
    console.log("SEC FY rows (period_end / shares_diluted / net_income / revenue):");
    for (const r of fyRows.slice(0, 4)) {
      console.log(`  ${r.period_end}  shares=${r.shares_diluted}  NI=${r.net_income}  rev=${r.revenue}`);
    }

    const price = await getLatestPrice(ticker);
    console.log(`price: ${price ? `${price.close} ${price.currency} @ ${price.date} (src=${price.source})` : "NULL"}`);

    const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
    const sicNum = sicRaw == null ? undefined : Number(sicRaw);
    const sic = sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
    const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual, 1, sic);
    const floor = computeValuationFloor(floorInput);
    if (!floor || floor.kind !== "floor") {
      console.log(`floor: not assessable (${floor?.kind})`);
      continue;
    }
    const strikeZone = price ? deriveStrikeZone(floor, price) : undefined;
    const oeDcf = deriveOeDcf(floor, floorInput.years, { value: 4.4, date: "2026-07-15" }, price);
    const reconciliation = strikeZone && oeDcf ? reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, price) : undefined;
    const verdict = deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation });

    console.log(`valueFloor(零增长底/share)= ${strikeZone?.epv?.valueFloor}`);
    console.log(`IV(oeDcf neutral per_share)= ${oeDcf?.tiers?.neutral.per_share}`);
    console.log(`oeDcf per_share_low/high = ${oeDcf?.per_share_low} / ${oeDcf?.per_share_high}`);
    console.log(`VERDICT:`, verdict ? {
      bucket: verdict.bucket,
      inStrikeZone: verdict.inStrikeZone,
      marginPct: verdict.marginPct,
      rangeLo: verdict.rangeLo,
      rangeHi: verdict.rangeHi,
      price: verdict.price,
      reliable: verdict.reliable,
      coverage: verdict.coverage,
    } : "null (suppressed)");
  }
}

main().catch((err) => {
  console.error("探针失败:", err);
  process.exit(1);
});
