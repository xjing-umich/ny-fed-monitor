/**
 * holdcoSotp.probe.ts — 件⑤ 真数据只读探针(直接打 SEC,不写库)。
 * 运行:
 *   cd web && export SEC_USER_AGENT="Compounder Research junlinzhu@jobright.ai" \
 *     && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.probe.ts
 */
import { extractInstanceFacts } from "../sec/instance-facts";
import { extractHoldcoInvestments } from "../sec/holdco-investments";
import { extractSegmentYears } from "../sec/segment-facts";
import { computeHoldcoSotp } from "./holdcoSotp";

const UA = process.env.SEC_USER_AGENT;
if (!UA) throw new Error("需要 SEC_USER_AGENT");

const B = 1e9;
const SHARES_BRK_B = 2_157_335_139;
const PRICE_BRK_B = 511.54; // 探针基准价,仅用于打印带内/带外,不入库

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) / Math.abs(b) <= tol;

async function get(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA!, Accept: "*/*" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function main() {
  const subs = JSON.parse(await get("https://data.sec.gov/submissions/CIK0001067983.json"));
  const rec = subs.filings.recent;
  const idx = rec.form.findIndex((f: string) => f === "10-K");
  const acc = rec.accessionNumber[idx].replace(/-/g, "");
  const doc = rec.primaryDocument[idx].replace(/\.htm$/, "");
  const url = `https://www.sec.gov/Archives/edgar/data/1067983/${acc}/${doc}_htm.xml`;
  console.log(`# 10-K ${rec.reportDate[idx]} filed ${rec.filingDate[idx]}\n# ${url}\n`);

  const facts = extractInstanceFacts(await get(url));
  const periodEnd = rec.reportDate[idx];

  console.log("① 第一栏(spec §1.1)");
  const inv = extractHoldcoInvestments(facts, periodEnd);
  assert(inv != null, "第一栏可提取(两闸通过)");
  if (inv) {
    console.log(`   现金 ${(inv.cash / B).toFixed(2)}B · 国债 ${(inv.treasuries / B).toFixed(2)}B · 权益 ${(inv.equity_securities / B).toFixed(2)}B · 权益法 ${(inv.equity_method / B).toFixed(2)}B · AFS ${(inv.afs_debt / B).toFixed(2)}B`);
    assert(near(inv.cash / B, 47.72, 0.01), "现金 47.72B(保险与其他列,非合并 52.57B)");
    assert(near(inv.treasuries / B, 321.43, 0.01), "★ 国债 321.43B(第一版漏掉的那 46%)");
    assert(near(inv.total / B, 704.73, 0.01), "第一栏合计 704.73B");
    assert(near(inv.unrealized_gain! / B, 212.39, 0.01), "未实现增值 212.39B");
  }

  console.log("② 分部(spec §1.2)");
  const years = extractSegmentYears(facts);
  assert(years.length >= 3, `解析出 ≥3 个 FY(实得 ${years.length})`);
  for (const y of years.slice(0, 3)) {
    const op = (y.total_pretax! - y.insurance_pretax!) - (y.total_tax! - y.insurance_tax!);
    console.log(`   ${y.period_end}: 合计税前 ${(y.total_pretax! / B).toFixed(2)}B · 保险 ${(y.insurance_pretax! / B).toFixed(2)}B · 承保 ${(y.underwriting_pretax! / B).toFixed(2)}B · 投资 ${(y.investments_pretax! / B).toFixed(2)}B · 非保险税后 ${(op / B).toFixed(2)}B`);
    assert(near(y.underwriting_pretax! + y.investments_pretax!, y.insurance_pretax!, 0.01),
      `${y.period_end} 承保+投资=保险集团合计`);
  }
  const fy25 = years.find((y) => y.period_end === "2025-12-31");
  if (fy25) {
    const op25 = (fy25.total_pretax! - fy25.insurance_pretax!) - (fy25.total_tax! - fy25.insurance_tax!);
    assert(near(op25 / B, 23.37, 0.01), "FY2025 非保险经营税后 23.37B");
  }

  console.log("③ SOTP 三档(spec §3)");
  const sotp = computeHoldcoSotp({
    shares: SHARES_BRK_B,
    investments: inv ? { total: inv.total, unrealized_gain: inv.unrealized_gain } : null,
    years,
  });
  assert(sotp.assessable, "四闸全过");
  if (sotp.assessable) {
    const { pessimistic, base, optimistic } = sotp.per_share;
    console.log(`   $${pessimistic.toFixed(0)} / $${base.toFixed(0)} / $${optimistic.toFixed(0)}`);
    assert(pessimistic >= 450 && optimistic <= 545, "三档 ∈ [450, 545]");
    assert(base >= 485 && base <= 510, "基础档 ∈ [485, 510]");
    assert(PRICE_BRK_B >= pessimistic && PRICE_BRK_B <= optimistic, `★ 现价 $${PRICE_BRK_B} 落在带内`);
    console.log(`   基础档 ÷ 每股账面 332.55 = ${(base / 332.55).toFixed(2)}× 账面(市场 1.54×,历史 1.2–1.6×)`);
    console.log(`   第一栏占比 ${((sotp.columns.investments / base) * 100).toFixed(0)}%(共识约三分之二)`);
  }

  console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
