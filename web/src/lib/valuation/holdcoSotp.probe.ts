/**
 * holdcoSotp.probe.ts — 件⑤ 真数据只读探针(直接打 SEC,不写库)。
 *
 * 走的是**生产那条链**:instance → 第一栏/分部年度量 → computeHoldcoSotpFromRows(与 reader
 * 同一装配函数)→ SOTP。区别只在于行来自现抓的 instance 而不是两张新表,因为 migration 还没
 * apply。装配逻辑、闸、股数来源与生产逐字同源。
 *
 * 运行:
 *   cd web && export SEC_USER_AGENT="Compounder Research junlinzhu@jobright.ai" \
 *     && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.probe.ts
 */
import type { FundamentalPeriod } from "../sec/normalize-facts";
import { extractInstanceFacts } from "../sec/instance-facts";
import { extractHoldcoInvestments } from "../sec/holdco-investments";
import { extractSegmentYears } from "../sec/segment-facts";
import { needsHoldcoSotp } from "../sec/holdco-gate";
import { computeHoldcoSotpFromRows, type HoldcoInvestmentsRow, type HoldcoSegmentYearRow } from "./holdcoSotpFromDb";
import { fundamentalsToFloorInput } from "./fundamentalsToFloorInput";
import { computeValuationFloor } from "./epvFloor";

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

/** 抓某 CIK 最近一份 10-K 的 instance,返回事实与报告期。 */
async function latest10k(cik: string) {
  const subs = JSON.parse(await get(`https://data.sec.gov/submissions/CIK${cik}.json`));
  const rec = subs.filings.recent;
  const idx = rec.form.findIndex((f: string) => f === "10-K");
  if (idx < 0) throw new Error(`${cik} 无 10-K`);
  const acc = rec.accessionNumber[idx].replace(/-/g, "");
  const doc = rec.primaryDocument[idx].replace(/\.htm$/, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${doc}_htm.xml`;
  return { facts: extractInstanceFacts(await get(url)), periodEnd: rec.reportDate[idx] as string, url,
           filed: rec.filingDate[idx] as string };
}

/** 造一批与库内同形的 FY 行(period_end / pretax / marks / 股数),供 reader 装配用。 */
function annualRows(
  ticker: string,
  rows: { period_end: string; pretax: number; marks: number; shares: number }[],
): FundamentalPeriod[] {
  return rows.map((r, i) => ({
    ticker,
    period_end: r.period_end,
    fiscal_year: Number(r.period_end.slice(0, 4)),
    fiscal_period: "FY",
    pretax_income: r.pretax,
    investment_fv_gain_loss: r.marks,
    net_income: r.pretax * 0.8,
    operating_income: null,
    revenue: 100 * B,
    shares_diluted: r.shares,
    _i: i,
  }) as unknown as FundamentalPeriod);
}

const toYearRows = (ys: ReturnType<typeof extractSegmentYears>): HoldcoSegmentYearRow[] =>
  ys.map((y) => ({
    period_end: y.period_end,
    total_pretax: y.total_pretax,
    total_tax: y.total_tax,
    insurance_pretax: y.insurance_pretax,
    insurance_tax: y.insurance_tax,
    underwriting_pretax: y.underwriting_pretax,
    segments_pretax_sum: y.segments_pretax_sum,
  }));

async function main() {
  // ── BRK ────────────────────────────────────────────────────────────────────
  const brk = await latest10k("0001067983");
  console.log(`# BRK 10-K ${brk.periodEnd} filed ${brk.filed}\n# ${brk.url}\n`);
  const { facts, periodEnd } = brk;

  console.log("① 第一栏(spec §1.1)");
  const inv = extractHoldcoInvestments(facts, periodEnd);
  assert(inv != null, "第一栏可提取(三闸通过)");
  if (inv) {
    console.log(`   现金 ${(inv.cash / B).toFixed(2)}B · 国债 ${(inv.treasuries / B).toFixed(2)}B · 权益 ${(inv.equity_securities / B).toFixed(2)}B · 权益法 ${(inv.equity_method / B).toFixed(2)}B · AFS ${(inv.afs_debt / B).toFixed(2)}B`);
    assert(near(inv.cash / B, 47.72, 0.01), "现金 47.72B(保险与其他列,非合并 52.57B)");
    assert(near(inv.treasuries / B, 321.43, 0.01), "★ 国债 321.43B(第一版漏掉的那 46%)");
    assert(near(inv.total / B, 704.73, 0.01), "第一栏合计 704.73B");
    assert(near(inv.unrealized_gain! / B, 212.39, 0.01), "未实现增值 212.39B");
    assert(inv.gate_upper_bound_ok, "上界闸通过(第一栏 ≤ 投资列 Assets)");
  }

  console.log("② 分部(spec §1.2)");
  const years = extractSegmentYears(facts);
  assert(years.length >= 3, `解析出 ≥3 个 FY(实得 ${years.length})`);
  for (const y of years.slice(0, 3)) {
    const op = (y.total_pretax! - y.insurance_pretax!) - (y.total_tax! - y.insurance_tax!);
    console.log(`   ${y.period_end}: 合计税前 ${(y.total_pretax! / B).toFixed(2)}B · Σ顶层分部 ${((y.segments_pretax_sum ?? 0) / B).toFixed(2)}B · 保险 ${(y.insurance_pretax! / B).toFixed(2)}B · 承保 ${(y.underwriting_pretax! / B).toFixed(2)}B · 投资 ${(y.investments_pretax! / B).toFixed(2)}B · 非保险税后 ${(op / B).toFixed(2)}B`);
    assert(near(y.underwriting_pretax! + y.investments_pretax!, y.insurance_pretax!, 0.01),
      `${y.period_end} 承保+投资=保险集团合计`);
    assert(y.segments_pretax_sum != null && near(y.segments_pretax_sum, y.total_pretax!, 0.01),
      `${y.period_end} Σ顶层分部 = 合计行(对账闸①的恒等式)`);
  }
  // FY 断言不得静默跳过 —— SEC 改了 reportDate 形态会让探针假绿。
  const fy25 = years.find((y) => y.period_end === "2025-12-31");
  assert(fy25 != null, "FY2025 那一年可定位(定位不到即失败,不静默跳过)");
  if (fy25) {
    const op25 = (fy25.total_pretax! - fy25.insurance_pretax!) - (fy25.total_tax! - fy25.insurance_tax!);
    assert(near(op25 / B, 23.37, 0.01), "FY2025 非保险经营税后 23.37B");
  }

  console.log("③ 生产装配链(与 reader 同一函数)+ SOTP 三档(spec §3)");
  // 库内真值(company_fundamentals_periods,2026-08-11 读)。合并口径基数 = pretax − marks。
  const brkAnnual = annualRows("BRK.B", [
    { period_end: "2025-12-31", pretax: 82.459 * B, marks: 39.078 * B, shares: SHARES_BRK_B },
    { period_end: "2024-12-31", pretax: 110.376 * B, marks: 52.799 * B, shares: SHARES_BRK_B },
    { period_end: "2023-12-31", pretax: 120.166 * B, marks: 74.855 * B, shares: SHARES_BRK_B },
  ]);
  const brkFloorInput = fundamentalsToFloorInput("BRK.B", "BRK.B", brkAnnual);
  const invRows: HoldcoInvestmentsRow[] = inv
    ? [{ period_end: inv.period_end, total: inv.total, unrealized_gain: inv.unrealized_gain,
         gate_attribution_ok: inv.gate_attribution_ok, gate_closure_ok: inv.gate_closure_ok,
         gate_upper_bound_ok: inv.gate_upper_bound_ok }]
    : [];
  for (const y of years.slice(0, 3)) {
    const basis = (brkAnnual.find((r) => r.period_end === y.period_end) as { pretax_income: number; investment_fv_gain_loss: number } | undefined);
    if (basis) {
      const b = basis.pretax_income - basis.investment_fv_gain_loss;
      console.log(`   ${y.period_end} 对账:分部合计 ${(y.total_pretax! / B).toFixed(2)}B vs 合并经营口径 ${(b / B).toFixed(2)}B → 偏差 ${(((y.total_pretax! - b) / Math.abs(b)) * 100).toFixed(1)}%`);
    }
  }
  const sotp = computeHoldcoSotpFromRows({
    investments: invRows, years: toYearRows(years), annual: brkAnnual, floorInput: brkFloorInput,
  });
  assert(sotp.assessable, `四闸全过${sotp.assessable ? "" : `(实测被 ${(sotp as { reason: string }).reason} 拦下)`}`);
  if (sotp.assessable) {
    const { pessimistic, base, optimistic } = sotp.per_share;
    console.log(`   $${pessimistic.toFixed(0)} / $${base.toFixed(0)} / $${optimistic.toFixed(0)}`);
    assert(pessimistic >= 450 && optimistic <= 545, "三档 ∈ [450, 545]");
    assert(base >= 485 && base <= 510, "基础档 ∈ [485, 510]");
    assert(PRICE_BRK_B >= pessimistic && PRICE_BRK_B <= optimistic, `★ 现价 $${PRICE_BRK_B} 落在带内`);
    console.log(`   基础档 ÷ 每股账面 332.55 = ${(base / 332.55).toFixed(2)}× 账面(市场 1.54×,历史 1.2–1.6×)`);
    console.log(`   第一栏占比 ${((sotp.columns.investments / base) * 100).toFixed(0)}%(共识约三分之二)`);

    // BRK.A:同一批分部/第一栏,只换股数(件① 分股类回退的 A 类口径)→ 每股应恰好 ×1500。
    const aAnnual = annualRows("BRK.A", [
      { period_end: "2025-12-31", pretax: 82.459 * B, marks: 39.078 * B, shares: SHARES_BRK_B / 1500 },
      { period_end: "2024-12-31", pretax: 110.376 * B, marks: 52.799 * B, shares: SHARES_BRK_B / 1500 },
      { period_end: "2023-12-31", pretax: 120.166 * B, marks: 74.855 * B, shares: SHARES_BRK_B / 1500 },
    ]);
    const sotpA = computeHoldcoSotpFromRows({
      investments: invRows, years: toYearRows(years), annual: aAnnual,
      floorInput: fundamentalsToFloorInput("BRK.A", "BRK.A", aAnnual),
    });
    assert(sotpA.assessable, "BRK.A 同样可评估");
    if (sotpA.assessable) {
      const ratio = sotpA.per_share.base / base;
      assert(near(ratio, 1500, 0.001), `BRK.A = BRK.B × 1500 自洽(实得 ${ratio.toFixed(1)})`);
    }
  }

  // ── WTM(spec §4.2)────────────────────────────────────────────────────────
  console.log("④ WTM 走四闸(分部不足则退回件④抑制,打印实测供裁决)");
  try {
    const wtm = await latest10k("0000776867");
    console.log(`   10-K ${wtm.periodEnd} filed ${wtm.filed}`);
    const wInv = extractHoldcoInvestments(wtm.facts, wtm.periodEnd);
    const wYears = extractSegmentYears(wtm.facts);
    console.log(`   第一栏: ${wInv ? `${(wInv.total / B).toFixed(2)}B(三闸过)` : "不可得(闸未过或组成缺失)"}`);
    console.log(`   分部年份: ${wYears.length}${wYears.length ? " → " + wYears.map((y) => `${y.period_end}(合计 ${y.total_pretax == null ? "—" : (y.total_pretax / B).toFixed(2) + "B"} · Σ ${y.segments_pretax_sum == null ? "—" : (y.segments_pretax_sum / B).toFixed(2) + "B"})`).join(", ") : ""}`);
    const wAnnual = annualRows("WTM", [
      { period_end: "2025-12-31", pretax: 1.3287 * B, marks: 0.3615 * B, shares: 2_534_300 },
      { period_end: "2024-12-31", pretax: 0.3167 * B, marks: 0.1849 * B, shares: 2_532_200 },
      { period_end: "2023-12-31", pretax: 0.5654 * B, marks: 0.4342 * B, shares: 2_527_300 },
    ]);
    assert(needsHoldcoSotp(wAnnual), "WTM 命中件⑤窄闸(有 marks + 无营业利润)");
    const wSotp = computeHoldcoSotpFromRows({
      investments: wInv
        ? [{ period_end: wInv.period_end, total: wInv.total, unrealized_gain: wInv.unrealized_gain,
             gate_attribution_ok: wInv.gate_attribution_ok, gate_closure_ok: wInv.gate_closure_ok,
             gate_upper_bound_ok: wInv.gate_upper_bound_ok }]
        : [],
      years: toYearRows(wYears), annual: wAnnual,
      floorInput: fundamentalsToFloorInput("WTM", "WTM", wAnnual),
    });
    console.log(`   裁决: ${wSotp.assessable ? `可评估,基础档 $${wSotp.per_share.base.toFixed(0)}` : `不可评估(${wSotp.reason})→ 退回件④抑制`}`);
    // spec §4.2 只要求「走四闸 + 打印实测供裁决」:任一结果都合法,但必须是四闸真跑过的结果,
    // 而不是一句「跳过」。这条断言锁住「探针确实拿到了 WTM 的裁决」。
    assert(typeof wSotp.assessable === "boolean", "WTM 四闸跑完并给出裁决(非跳过)");
  } catch (e) {
    assert(false, `WTM 探测失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 零漂移(spec §4.2 硬断言)──────────────────────────────────────────────
  console.log("⑤ ★ 零漂移:未被件④抑制的票,挂 SOTP 前后逐字段相同");
  const normalRows = annualRows("NORMAL", [
    { period_end: "2025-12-31", pretax: 20 * B, marks: 1 * B, shares: 1e9 },
    { period_end: "2024-12-31", pretax: 18 * B, marks: 1 * B, shares: 1e9 },
    { period_end: "2023-12-31", pretax: 16 * B, marks: 1 * B, shares: 1e9 },
  ]).map((r) => ({ ...r, operating_income: 22 * B, operating_margin: 0.22, revenue: 100 * B }) as FundamentalPeriod);
  const plain = fundamentalsToFloorInput("NORMAL", "NORMAL", normalRows);
  assert(!needsHoldcoSotp(normalRows), "对照票不命中窄闸 → reader 根本不查库");
  if (sotp.assessable) {
    const a = computeValuationFloor(plain);
    const b = computeValuationFloor({ ...plain, holdcoSotp: sotp });
    assert(a != null && a.kind === "floor", "对照票可估值(断言不是空转)");
    assert(JSON.stringify(a) === JSON.stringify(b), "带/不带 SOTP 的 ValuationFloor 逐字段完全相同");
  }

  console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
