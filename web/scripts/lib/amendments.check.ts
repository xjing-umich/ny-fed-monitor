/**
 * resolvePeriodHoldings 行为校验。跑法: npx tsx scripts/lib/amendments.check.ts
 * 用例取自 2026-10 审计的真实申报形态(Oaktree 重述、Check Capital/Arbiter 误标的 NEW HOLDINGS)。
 */
import { resolvePeriodHoldings, holdingKey, type FilingVersion } from "./amendments";
import type { Holding } from "../../src/lib/managers/types";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return console.log(`  ✓ ${name}`);
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const h = (cusip: string, value: number, putCall?: string): Holding => ({ cusip, issuer: cusip, value, shares: value / 10, putCall });
const v = (accession: string, filedAt: string, form: FilingVersion["form"], amendmentType: FilingVersion["amendmentType"], holdings: Holding[]): FilingVersion =>
  ({ accession, filedAt, form, amendmentType, holdings });
const total = (hs: Holding[]) => hs.reduce((s, x) => s + x.value, 0);
const byKey = (hs: Holding[]) => new Map(hs.map((x) => [holdingKey(x), x.value]));

console.log("resolvePeriodHoldings");

// 1) 无修正:原样返回原始件。
{
  const r = resolvePeriodHoldings([v("O", "2026-08-14", "13F-HR", null, [h("A", 100), h("B", 50)])])!;
  check("无修正时取原始件", r.accession === "O" && total(r.holdings) === 150);
}

// 2) RESTATEMENT 整季替换,身份保留原始件(Oaktree 2026Q1 形态)。
{
  const r = resolvePeriodHoldings([
    v("O", "2026-05-15", "13F-HR", null, [h("A", 100), h("B", 50)]),
    v("A1", "2026-05-19", "13F-HR/A", "RESTATEMENT", [h("A", 120), h("C", 30)]),
  ])!;
  check("RESTATEMENT 整季替换", total(r.holdings) === 150 && !byKey(r.holdings).has("B|"), `total ${total(r.holdings)}`);
  check("身份仍为原始件(accession/filedAt)", r.accession === "O" && r.filedAt === "2026-05-15");
}

// 3) 误标的 NEW HOLDINGS(实为全表重述,键完全重合):逐键覆盖,不得翻倍(Check Capital/Arbiter)。
{
  const r = resolvePeriodHoldings([
    v("O", "2026-08-01", "13F-HR", null, [h("A", 100), h("B", 50)]),
    v("A1", "2026-08-05", "13F-HR/A", "NEW HOLDINGS", [h("A", 110), h("B", 50)]),
    v("A2", "2026-08-05", "13F-HR/A", "NEW HOLDINGS", [h("A", 115)]),
  ])!;
  check("误标 NEW HOLDINGS 不翻倍", total(r.holdings) === 165, `total ${total(r.holdings)}`);
  check("按申报顺序逐份覆盖(A2 最终生效)", byKey(r.holdings).get("A|") === 115);
}

// 4) 真·NEW HOLDINGS:新键追加。
{
  const r = resolvePeriodHoldings([
    v("O", "2026-08-01", "13F-HR", null, [h("A", 100)]),
    v("A1", "2026-09-01", "13F-HR/A", "NEW HOLDINGS", [h("Z", 40)]),
  ])!;
  check("真新增仓位被追加", total(r.holdings) === 140 && r.holdings.length === 2);
}

// 5) CUSIP 大小写 / 期权类型大小写视为同一键。
{
  const r = resolvePeriodHoldings([
    v("O", "2026-08-01", "13F-HR", null, [h("48251w104", 100), h("X", 10, "Call")]),
    v("A1", "2026-08-02", "13F-HR/A", "NEW HOLDINGS", [h("48251W104", 90), h("X", 12, "CALL")]),
  ])!;
  check("大小写不同的同一 CUSIP 被覆盖而非并存", r.holdings.length === 2 && total(r.holdings) === 102, `rows ${r.holdings.length}, total ${total(r.holdings)}`);
}

// 6) 空表修正不清空持仓。
{
  const r = resolvePeriodHoldings([
    v("O", "2026-08-01", "13F-HR", null, [h("A", 100)]),
    v("A1", "2026-08-03", "13F-HR/A", "RESTATEMENT", []),
  ])!;
  check("空表 RESTATEMENT 被跳过", total(r.holdings) === 100 && r.skipped.length === 1);
}

// 7) 只有修正件(原始件不在窗口内/解析失败):修正件撑起该季并作为身份。
{
  const r = resolvePeriodHoldings([v("A1", "2026-02-17", "13F-HR/A", "RESTATEMENT", [h("A", 70)])])!;
  check("仅有修正件时取修正件", r.accession === "A1" && total(r.holdings) === 70);
}

// 8) 原始件空表(Olstein 2026Q2 形态)且无修正:该季不可用。
{
  const r = resolvePeriodHoldings([v("O", "2026-07-07", "13F-HR", null, [])]);
  check("空表原始件 → null(该季跳过)", r === null);
}

// 9) 申报日相同按 accession 排序,结果稳定(与输入顺序无关)。
{
  const a = [v("O", "2026-08-01", "13F-HR", null, [h("A", 1)]), v("A2", "2026-08-05", "13F-HR/A", "NEW HOLDINGS", [h("A", 3)]), v("A1", "2026-08-05", "13F-HR/A", "NEW HOLDINGS", [h("A", 2)])];
  const r1 = resolvePeriodHoldings(a)!, r2 = resolvePeriodHoldings([...a].reverse())!;
  check("同日修正顺序稳定", byKey(r1.holdings).get("A|") === 3 && byKey(r2.holdings).get("A|") === 3);
}

// 10) 零持仓原始件(Olstein 2026Q2 0000894189-26-021028 形态):不再跳过,整季为空、zeroReport=true。
{
  const zero = { ...v("0000894189-26-021028", "2026-07-07", "13F-HR", null, []), zeroReport: true };
  const r = resolvePeriodHoldings([zero]);
  check("零持仓原始件 → 收为空季", r !== null && r.holdings.length === 0 && r.zeroReport && r.accession === "0000894189-26-021028");
}

// 11) 零持仓原始件 + 后续 NEW HOLDINGS 修正补仓 → 有持仓,不再是零持仓。
{
  const zero = { ...v("O", "2026-07-07", "13F-HR", null, []), zeroReport: true };
  const r = resolvePeriodHoldings([zero, v("A1", "2026-07-20", "13F-HR/A", "NEW HOLDINGS", [h("A", 10)])])!;
  check("零持仓后补仓修正 → 非零", !r.zeroReport && total(r.holdings) === 10 && r.accession === "O");
}

// 12) 有持仓的原始件 + 零持仓 RESTATEMENT → 重述为零。
{
  const restZero = { ...v("A1", "2026-08-20", "13F-HR/A", "RESTATEMENT", []), zeroReport: true };
  const r = resolvePeriodHoldings([v("O", "2026-08-14", "13F-HR", null, [h("A", 10)]), restZero])!;
  check("零持仓重述 → 整季归零", r.zeroReport && r.holdings.length === 0);
}

// 13) 普通有持仓季 zeroReport=false。
{
  const r = resolvePeriodHoldings([v("O", "2026-08-14", "13F-HR", null, [h("A", 10)])])!;
  check("普通季 zeroReport=false", r.zeroReport === false);
}

if (failed) {
  console.error(`\namendments.check: ${failed} 项失败`);
  process.exit(1);
}
console.log("\namendments.check OK");
