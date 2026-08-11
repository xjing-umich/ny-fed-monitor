/**
 * holdcoSotpFromDb.check.ts — 件⑤ 生产链路断言(纯 fixture,无网络无库)。
 *
 * ★ 这条线曾经整条建完却没有任何调用方给 ValuationFloorInput.holdcoSotp 传值 —— 引擎、页面、
 *   check 全绿,生产上 BRK 却照旧只有一句抑制说明。本文件锁住那条接线的三件事:
 *   ① 窄闸只对件④触发集开(零漂移);② 股数与 floorInput 同源(BRK.A = BRK.B × 1500);
 *   ③ 合并口径按 period_end 组表且缺值 fail-closed。
 *
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotpFromDb.check.ts
 */
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
import { needsHoldcoSotp } from "@/lib/sec/holdco-gate";
import { buildHoldcoSotpInput, computeHoldcoSotpFromRows } from "./holdcoSotpFromDb";
import { fundamentalsToFloorInput } from "./fundamentalsToFloorInput";
import { computeValuationFloor, resolveFloorShares } from "./epvFloor";
import type { ValuationFloorInput } from "./types";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) / Math.abs(b) <= tol;

const B = 1e9;
const SHARES_B = 2_157_474_227; // 库内 BRK.B FY2025 稀释股数(件① 分股类回退结果)
const SHARES_A = 1_438_223; // 库内 BRK.A FY2025

/** BRK 形态的 FY 行:有 marks、无 operating_income(= 件④触发集的取数侧代理条件)。 */
function brkAnnual(shares: number): FundamentalPeriod[] {
  const rows: [string, number, number, number][] = [
    // period_end, pretax, marks, net_income(库内真值,见 company_fundamentals_periods)
    ["2025-12-31", 82.459 * B, 39.078 * B, 66.968 * B],
    ["2024-12-31", 110.376 * B, 52.799 * B, 88.995 * B],
    ["2023-12-31", 120.166 * B, 74.855 * B, 96.223 * B],
  ];
  return rows.map(([period_end, pretax, marks, ni], i) => ({
    ticker: "BRK.B",
    period_end,
    fiscal_year: 2025 - i,
    fiscal_period: "FY",
    pretax_income: pretax,
    investment_fv_gain_loss: marks,
    net_income: ni,
    operating_income: null,
    revenue: 400 * B,
    shares_diluted: shares,
  }) as unknown as FundamentalPeriod);
}

const INVESTMENT_ROWS = [
  {
    period_end: "2025-12-31",
    total: 704.73 * B,
    unrealized_gain: 212.39 * B,
    gate_attribution_ok: true,
    gate_closure_ok: true,
    gate_upper_bound_ok: true,
  },
];
const YEAR_ROWS = [
  { period_end: "2025-12-31", total_pretax: 51.71 * B, total_tax: 8.57 * B, insurance_pretax: 24.72 * B,
    insurance_tax: 4.95 * B, underwriting_pretax: 9.46 * B, segments_pretax_sum: 51.71 * B },
  { period_end: "2024-12-31", total_pretax: 53.94 * B, total_tax: 8.87 * B, insurance_pretax: 28.15 * B,
    insurance_tax: 5.46 * B, underwriting_pretax: 11.40 * B, segments_pretax_sum: 53.94 * B },
  { period_end: "2023-12-31", total_pretax: 43.64 * B, total_tax: 6.91 * B, insurance_pretax: 18.49 * B,
    insurance_tax: 3.50 * B, underwriting_pretax: 6.91 * B, segments_pretax_sum: 43.64 * B },
];

const floorInputOf = (shares: number, ticker = "BRK.B") =>
  fundamentalsToFloorInput(ticker, ticker, brkAnnual(shares));

console.log("① 窄闸:只对件④触发集开(零漂移第一道)");
assert(needsHoldcoSotp(brkAnnual(SHARES_B)) === true, "BRK 形态(有 marks + 无营业利润)→ 窄闸开");
const normalAnnual = brkAnnual(SHARES_B).map((r) => ({ ...r, operating_income: 30 * B }));
assert(needsHoldcoSotp(normalAnnual) === false, "有营业利润的普通票 → 窄闸关(reader 一步都不往下走)");
const noMarksAnnual = brkAnnual(SHARES_B).map((r) => ({ ...r, investment_fv_gain_loss: null }));
assert(needsHoldcoSotp(noMarksAnnual) === false, "无投资重估损益 → 窄闸关");

console.log("② 装配:股数与 floorInput 同源");
const inputB = buildHoldcoSotpInput({
  investments: INVESTMENT_ROWS, years: YEAR_ROWS, annual: brkAnnual(SHARES_B), floorInput: floorInputOf(SHARES_B),
})!;
assert(inputB != null, "装配成功");
assert(inputB.shares === SHARES_B, "股数 = floorInput 的 resolveFloorShares 结果,不是另算一套");
assert(inputB.shares === resolveFloorShares(floorInputOf(SHARES_B)), "与引擎同源(逐字相等)");

console.log("③ 合并口径按 period_end 组表(= 合并税前 − 投资重估)");
assert(near(inputB.consolidatedPretaxByYear["2025-12-31"]!, (82.459 - 39.078) * B),
  "FY2025 基数 43.38B(不是 GAAP 合并税前 82.46B —— 分部口径不含证券重估)");
assert(inputB.consolidatedPretaxByYear["2023-12-31"] != null, "三年都组进表");

console.log("④ BRK.A = BRK.B × 1500 自洽(spec §4)");
const sotpB = computeHoldcoSotpFromRows({
  investments: INVESTMENT_ROWS, years: YEAR_ROWS, annual: brkAnnual(SHARES_B), floorInput: floorInputOf(SHARES_B),
});
const sotpA = computeHoldcoSotpFromRows({
  investments: INVESTMENT_ROWS, years: YEAR_ROWS, annual: brkAnnual(SHARES_A), floorInput: floorInputOf(SHARES_A, "BRK.A"),
});
assert(sotpB.assessable && sotpA.assessable, "A/B 两个股类都可评估");
if (sotpB.assessable && sotpA.assessable) {
  const ratio = sotpA.per_share.base / sotpB.per_share.base;
  console.log(`   B 基础档 $${sotpB.per_share.base.toFixed(0)} · A 基础档 $${sotpA.per_share.base.toFixed(0)} · 比值 ${ratio.toFixed(1)}`);
  assert(near(ratio, 1500, 0.01), `A/B 每股比值 ≈1500(实得 ${ratio.toFixed(1)})`);
  assert(sotpB.per_share.base >= 485 && sotpB.per_share.base <= 510, "B 基础档 ∈ [485,510](spec §3)");
}

console.log("⑤ fail-closed:第一栏与最新 FY 不同期");
const staleInv = computeHoldcoSotpFromRows({
  investments: [{ ...INVESTMENT_ROWS[0], period_end: "2024-12-31" }],
  years: YEAR_ROWS, annual: brkAnnual(SHARES_B), floorInput: floorInputOf(SHARES_B),
});
assert(staleInv.assessable === false, "第一栏是去年的行 → 不可评估(不拿旧年投资配今天的价)");

console.log("⑥ fail-closed:库里记着闸没过的行不得使用");
for (const gate of ["gate_attribution_ok", "gate_closure_ok", "gate_upper_bound_ok"] as const) {
  const r = computeHoldcoSotpFromRows({
    investments: [{ ...INVESTMENT_ROWS[0], [gate]: false }],
    years: YEAR_ROWS, annual: brkAnnual(SHARES_B), floorInput: floorInputOf(SHARES_B),
  });
  assert(r.assessable === false, `${gate}=false → 不可评估`);
}

console.log("⑦ fail-closed:股数不可得 / 分部年份不足");
const sharelessAnnual = brkAnnual(SHARES_B).map((r) => ({ ...r, shares_diluted: null })) as FundamentalPeriod[];
const noShares = computeHoldcoSotpFromRows({
  investments: INVESTMENT_ROWS, years: YEAR_ROWS, annual: sharelessAnnual,
  floorInput: fundamentalsToFloorInput("BRK.B", "BRK.B", sharelessAnnual),
});
assert(noShares.assessable === false, "全窗口缺股数 → 不可评估(与引擎的 per_share_unavailable 同向)");
const twoYears = computeHoldcoSotpFromRows({
  investments: INVESTMENT_ROWS, years: YEAR_ROWS.slice(0, 2), annual: brkAnnual(SHARES_B), floorInput: floorInputOf(SHARES_B),
});
assert(twoYears.assessable === false, "只有 2 个分部年份 → 不可评估");

console.log("⑧ ★ 零漂移硬断言:未被件④抑制的票,挂不挂 SOTP 输出逐字段相同");
// 结构上由 epvFloor 的 `holdcoNotAssessable && …` 短路保证。这条断言把它锁死:把那个短路
// 改成无条件挂上,下面的深比较必须变红。
const normalRows = brkAnnual(SHARES_B).map((r) => ({
  ...r, operating_income: 30 * B, operating_margin: 0.075,
})) as FundamentalPeriod[];
const plainInput = fundamentalsToFloorInput("NORMAL", "NORMAL", normalRows);
const withSotp: ValuationFloorInput = {
  ...plainInput,
  holdcoSotp: sotpB.assessable ? sotpB : undefined,
};
const floorPlain = computeValuationFloor(plainInput);
const floorWithSotp = computeValuationFloor(withSotp);
assert(floorPlain != null && floorPlain.kind === "floor", "对照票可估值(断言不是空转)");
assert(sotpB.assessable, "挂上去的 SOTP 确实是可评估的那种(否则短路测试形同虚设)");
assert(JSON.stringify(floorPlain) === JSON.stringify(floorWithSotp),
  "未被抑制的票:带 SOTP 与不带 SOTP 的 ValuationFloor 逐字段完全相同(零漂移)");
assert((floorWithSotp as { holdco_sotp?: unknown }).holdco_sotp === undefined,
  "未被抑制的票不得挂上 holdco_sotp");

console.log("⑨ ★ 接线本身:两个调用方都必须真的把 SOTP 挂进 floorInput");
// 这条断言的存在理由就是 C1:引擎/页面/check 全绿,而**没有任何调用方**传值,整条线是死代码。
// 纯逻辑断言抓不到「谁都没调用」,只能对调用点本身下断言。少接一个调用方 = 个股页与
// screener/首页榜口径分裂,那是本项目出过的事故类型,故两个都验。
{
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const root = path.resolve(__dirname, "../../..");
  for (const rel of ["src/app/[lang]/stocks/[ticker]/page.tsx", "scripts/valuation-ingest.ts"]) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert(/readHoldcoSotp\(\{/.test(src), `${rel} 调用了 readHoldcoSotp`);
    assert(/floorInput\.holdcoSotp\s*=/.test(src), `${rel} 把结果挂进了 floorInput.holdcoSotp`);
  }
}

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
