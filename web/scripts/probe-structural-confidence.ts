/**
 * probe-structural-confidence.ts — Task 8 真数据探针:对参照票逐个跑
 * getSecCompanyData → computeValuationFloor,打印结构性置信分 s 及相关诊断字段,
 * 供人工核对三类判据(结构性已验证/半放/周期对照)。只读 Supabase,不写任何表。
 *
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-structural-confidence.ts
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getSecCompanyData } from "@/lib/sec/read";
import {
  fundamentalsToFloorInput,
  computeValuationFloor,
  normalizedTaxRate,
} from "@/lib/valuation";
import { roicHelpers, roicLongTermStrong } from "@/lib/valuation/moatCap";
import {
  structuralConfidence,
  revenueDrivenRatio,
  validatedEarningsLevel,
  DOWNTURN_DROP,
} from "@/lib/valuation/structuralConfidence";
import { assessReliability } from "@/lib/valuation/deriveValuationVerdict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}

const TICKERS = ["GOOGL", "META", "MSFT", "NVDA", "AAPL", "CVX", "NUE", "FCX"];

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("BLOCKED: 缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY,无法读取 SEC 数据。");
    process.exit(1);
  }

  const rows: Record<string, unknown>[] = [];
  let anyData = false;

  for (const ticker of TICKERS) {
    const sec = await getSecCompanyData(ticker);
    if (!sec.company && !(sec.annual?.length)) {
      console.error(`  ${ticker}: SEC 基本面不可用(空结果)`);
      rows.push({ ticker, error: "no_sec_data" });
      continue;
    }
    anyData = true;
    const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
    const sicNum = sicRaw == null ? undefined : Number(sicRaw);
    const sic = sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
    const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual, 1, sic);
    const floor = computeValuationFloor(floorInput);
    if (!floor || floor.kind !== "floor") {
      console.error(`  ${ticker}: 引擎不可估值(${floor?.kind ?? "undefined"})`);
      rows.push({ ticker, error: floor?.kind ?? "undefined" });
      continue;
    }

    // 诊断专用:独立重算 roicLongTermStrong + structuralConfidence(与引擎内部同一纯函数,
    // 仅供探针打印 target/roicLongTermStrong ——两者未直接暴露在 ValuationFloor 类型上)。
    const allYears = floorInput.years;
    const tax = normalizedTaxRate(allYears);
    const { nopatOf, investedCapitalOf } = roicHelpers(tax.rate);
    const roicLongStrong = roicLongTermStrong({ fyYears: allYears, nopatOf, investedCapitalOf });
    const scYears = allYears.slice(0, 5);
    const sc = structuralConfidence({ years: scYears, allYears, roicLongTermStrong: roicLongStrong });
    const validatedLevel = validatedEarningsLevel(allYears, DOWNTURN_DROP);
    const revDriven = revenueDrivenRatio(scYears);
    const nis = scYears.map((y) => y.net_income).filter((v): v is number => v != null && Number.isFinite(v));
    const avgNi = nis.length ? nis.reduce((s, v) => s + v, 0) / nis.length : undefined;

    const reliable = assessReliability({ floor });

    rows.push({
      ticker,
      structural_confidence: floor.structural_confidence,
      buffett_normalized_earnings: floor.buffett_epv.normalized_earnings,
      ai_capex_distortion_warning: floor.ai_capex_distortion_warning ?? false,
      reliable,
      validatedLevel,
      target: sc.target,
      target_over_avg: avgNi != null && avgNi !== 0 ? sc.target != null ? sc.target / avgNi : undefined : undefined,
      revenueDrivenRatio: revDriven,
      roicLongTermStrong: roicLongStrong,
    });
  }

  if (!anyData) {
    console.error("BLOCKED: 所有票 SEC 数据均为空,Supabase 可能不可达或表未播种。");
    process.exit(1);
  }

  console.table(rows);
}

main().catch((err) => {
  console.error("探针失败:", err);
  process.exit(1);
});
