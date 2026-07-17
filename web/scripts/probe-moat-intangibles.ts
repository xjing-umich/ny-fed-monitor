/**
 * probe-moat-intangibles.ts — 护城河地基修复的真引擎测量仪(只读)。
 * 对每只 ticker 跑真引擎,打印重置底口径(tangible/avCore/reproduction)、护城河信号、
 * 成长价值、roicLongTermStrong、verdict。BEFORE↔AFTER 用同一脚本 diff。
 *
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts NFLX MA SPGI ADBE MCO MSCI ORLY MSFT AAPL W CVNA PTON V
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
} from "@/lib/valuation";
import { getLatestPrice } from "@/lib/managers/priceRead";
import { roicHelpers, roicLongTermStrong } from "@/lib/valuation/moatCap";
import { normalizedTaxRate } from "@/lib/valuation/epvFloor";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const candidates = [path.join(__dirname, "../.env.local")];
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

const DEFAULT = ["NFLX", "MA", "SPGI", "ADBE", "MCO", "MSCI", "ORLY", "MSFT", "AAPL", "W", "CVNA", "PTON", "V"];
const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;

function n(x: number | null | undefined, d = 2): string {
  return x == null || !Number.isFinite(x) ? "—" : x.toFixed(d);
}

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
    const latest = fyRows.sort((a, b) => (b.fiscal_year ?? 0) - (a.fiscal_year ?? 0))[0];
    if (latest) {
      console.log(`latest FY ${latest.fiscal_year}: equity=${n(latest.shareholders_equity, 0)} goodwill=${n(latest.goodwill, 0)} intangibles=${n(latest.intangibles, 0)} shares=${n(latest.shares_diluted, 0)}`);
    }

    const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
    const sicNum = sicRaw == null ? undefined : Number(sicRaw);
    const sic = sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
    const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual, 1, sic);
    const floor = computeValuationFloor(floorInput);
    if (!floor || floor.kind !== "floor") {
      console.log(`floor: not assessable (${floor?.kind})`);
      continue;
    }

    // 重置底口径
    const af = floor.asset_floor;
    console.log(`asset_floor: assessable=${af.assessable} dual_av_comparable=${af.dual_av_comparable} tangible=${n(af.tangible_net_assets, 0)} capRd=${n(af.capitalized_rd, 0)} proxy=${n(af.acquired_reset_proxy, 0)} per_share(AV)=${n(af.per_share)} reproduction_per_share=${n(af.reproduction_per_share)}`);

    // 护城河 + CAP
    const mr = floor.moat_reading;
    console.log(`moat: signal=${mr.signal} via_roic=${(mr as { moat_via_roic?: boolean }).moat_via_roic ?? false} capital_distorted=${(mr as { capital_structure_distorted?: boolean }).capital_structure_distorted ?? false} epv_ps=${n(mr.epv_per_share_compared)} asset_ps=${n(mr.asset_per_share_compared)}`);
    console.log(`moat_cap: grade=${floor.moat_cap.grade} capYears=${floor.moat_cap.capYears}`);

    // roicLongTermStrong(独立复算,验证兜底判据)
    const tax = normalizedTaxRate(floorInput.years);
    const { nopatOf, investedCapitalOf } = roicHelpers(tax.rate);
    const rls = roicLongTermStrong({ fyYears: floorInput.years, nopatOf, investedCapitalOf });
    console.log(`roicLongTermStrong=${rls}`);

    // 成长价值
    const gv = floor.growth_value;
    console.log(`growth_value: assessable=${gv.assessable} gated_to_zero=${gv.gated_to_zero} roiic=${n(gv.roiic, 3)} neutral_ps=${n(gv.per_share?.neutral)} reason=${gv.not_assessable_reason ?? "—"}`);

    // verdict
    const price = await getLatestPrice(ticker);
    if (!price) {
      console.log(`verdict: (no price)`);
      continue;
    }
    const strikeZone = deriveStrikeZone(floor, price);
    const oeDcf = deriveOeDcf(floor, floorInput.years, { value: 4.4, date: "2026-07-15" }, price);
    const reconciliation = strikeZone && oeDcf ? reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, price) : undefined;
    // Task 4:死角(资本结构扭曲)与生产 page.tsx/valuation-ingest.ts 同源传入,否则探针会漏显 above 假信号。
    const capitalStructureDistorted = floor.moat_reading.capital_structure_distorted === true;
    const verdict = deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation, capitalStructureDistorted });
    console.log(`verdict:`, verdict ? { bucket: verdict.bucket, reliable: verdict.reliable, marginPct: n(verdict.marginPct == null ? undefined : verdict.marginPct * 100, 1) } : "null (suppressed)");
  }
}

main().catch((err) => {
  console.error("探针失败:", err);
  process.exit(1);
});
