/**
 * holdco-investments.check.ts — 件⑤ Task 2 断言(纯 fixture,无网络)。
 * ★ 核心回归用例:去掉 USTreasuryBills 后闸必须拦下 —— 这正是本件第一版漏掉 321.43B
 *   (占第一栏 46%)、把每股 SOTP 上沿算成 $396 的真实事故。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/holdco-investments.check.ts
 */
import { extractInstanceFacts } from "./instance-facts";
import { extractHoldcoInvestments, HOLDCO_GATE_TOLERANCE } from "./holdco-investments";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}
const near = (a: number, b: number, tol = 0.005) => Math.abs(a - b) / Math.abs(b) <= tol;

// BRK FY2025 真实数字(单位:美元),见 spec §1.1。
const INS = `dimension="us-gaap:ProductOrServiceAxis">us-gaap:InsuranceAndOtherMember`;
const RRUE = `dimension="us-gaap:ProductOrServiceAxis">us-gaap:RailroadUtilitiesAndEnergyMember`;

function build(opts: {
  treasuries?: boolean; closure?: boolean; attribution?: boolean;
  /** 权益证券取成「含经营业务资产的无维度合并数」:第一栏虚高但现金与 Assets 合计都没动 ——
   *  归属闸、闭合闸各自照常通过,专测上界闸。 */
  equitySecurities?: number;
} = {}) {
  const withTreasuries = opts.treasuries !== false;
  // closure=false 时把铁路能源 Assets 抹掉 → 各列之和 ≠ 合并数
  const rrueAssets = opts.closure === false ? 0 : 246180000000;
  // attribution=false 时把铁路能源列现金抬到荒谬量级 → 各列现金之和远超合并现金总额,
  // 触发归属闸的 summed <= consolidated 失败(五项本身仍齐备,闭合闸仍通过 —— 单独隔离归属闸)。
  const rrueCash = opts.attribution === false ? 300000000000 : 4160000000;
  const ctx = (id: string, dim: string | null) => `
  <context id="${id}">
    <entity><identifier>x</identifier>${dim ? `<segment><explicitMember xmlns:xbrldi="http://xbrl.org/2006/xbrldi" ${dim}</explicitMember></segment>` : ""}</entity>
    <period><instant>2025-12-31</instant></period>
  </context>`;
  return `<?xml version="1.0"?>
<xbrl xmlns:us-gaap="http://fasb.org/us-gaap/2025">
  <unit id="U"><measure>iso4217:USD</measure></unit>
  ${ctx("C_PLAIN", null)}${ctx("C_INS", INS)}${ctx("C_RRUE", RRUE)}
  <us-gaap:CashAndCashEquivalentsAtCarryingValue contextRef="C_INS" unitRef="U">47720000000</us-gaap:CashAndCashEquivalentsAtCarryingValue>
  <us-gaap:CashAndCashEquivalentsAtCarryingValue contextRef="C_RRUE" unitRef="U">${rrueCash}</us-gaap:CashAndCashEquivalentsAtCarryingValue>
  <us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents contextRef="C_PLAIN" unitRef="U">52570000000</us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents>
  ${withTreasuries ? `<us-gaap:USTreasuryBills contextRef="C_INS" unitRef="U">321430000000</us-gaap:USTreasuryBills>` : ""}
  <us-gaap:EquitySecuritiesFvNi contextRef="C_PLAIN" unitRef="U">${opts.equitySecurities ?? 297780000000}</us-gaap:EquitySecuritiesFvNi>
  <us-gaap:EquityMethodInvestments contextRef="C_PLAIN" unitRef="U">19980000000</us-gaap:EquityMethodInvestments>
  <us-gaap:AvailableForSaleSecuritiesDebtSecurities contextRef="C_PLAIN" unitRef="U">17820000000</us-gaap:AvailableForSaleSecuritiesDebtSecurities>
  <us-gaap:EquitySecuritiesAccumulatedUnrealizedGainLoss contextRef="C_PLAIN" unitRef="U">212390000000</us-gaap:EquitySecuritiesAccumulatedUnrealizedGainLoss>
  <us-gaap:Assets contextRef="C_PLAIN" unitRef="U">1222180000000</us-gaap:Assets>
  <us-gaap:Assets contextRef="C_INS" unitRef="U">976000000000</us-gaap:Assets>
  ${rrueAssets ? `<us-gaap:Assets contextRef="C_RRUE" unitRef="U">${rrueAssets}</us-gaap:Assets>` : ""}
</xbrl>`;
}

console.log("① 正常路径:逐项等于 spec §1.1 表");
const ok = extractHoldcoInvestments(extractInstanceFacts(build()), "2025-12-31");
assert(ok != null, "可提取");
assert(ok!.cash === 47720000000, "现金只取「保险与其他」列 47.72B(不是合并 52.57B)");
assert(ok!.treasuries === 321430000000, "短期国债 321.43B");
assert(ok!.equity_securities === 297780000000, "权益证券 297.78B");
assert(ok!.equity_method === 19980000000, "权益法投资 19.98B");
assert(ok!.afs_debt === 17820000000, "AFS 固定到期 17.82B");
assert(near(ok!.total, 704730000000), "第一栏合计 704.73B");
assert(ok!.unrealized_gain === 212390000000, "未实现增值 212.39B(递延税基数)");
assert(ok!.gate_attribution_ok, "归属闸通过(47.72+4.16 ≈ 52.57,差 0.69 受限现金在 2% 容差内)");
assert(ok!.gate_closure_ok, "闭合闸通过(976.00+246.18 = 1222.18)");
assert(ok!.gate_upper_bound_ok, "上界闸通过(第一栏 704.73B ≤ 投资列 Assets 976.00B)");

console.log("② ★ 漏项回归:去掉 USTreasuryBills");
// 这就是本件第一版的真实事故形态:五项里少一项,若静默按 0 处理,第一栏会算成 383.3B,
// 每股 SOTP 上沿掉到 $396 —— 与 1.10 万亿市值严重不符却看不出任何异常。
const missing = extractHoldcoInvestments(extractInstanceFacts(build({ treasuries: false })), "2025-12-31");
assert(missing === null, "国债缺失 → 整条返回 null(fail-closed),不得静默按 0 发布一个偏低 46% 的第一栏");

console.log("③ 闭合闸:存在未被发现的资产池");
const broken = extractHoldcoInvestments(extractInstanceFacts(build({ closure: false })), "2025-12-31");
assert(broken === null, "各列 Assets 之和 ≠ 合并 Assets → fail-closed 返回 null");

console.log("④ ★ 归属闸失败路径:五项齐备但列现金之和远超合并数");
// 与②③不同:这里五项全部非空、closure 也不动,专门只让归属恒等式本身失真 ——
// 如果 checkAttribution 被重构成恒真,这条必须变红。
const badAttribution = extractHoldcoInvestments(extractInstanceFacts(build({ attribution: false })), "2025-12-31");
assert(badAttribution === null, "列现金之和(47.72+300)远超合并现金 52.57B → 归属闸拦下,fail-closed 返回 null");

console.log("⑤ ★ 上界闸:重复计入(取到含经营业务资产的合并数)");
// 与②③④都不同:五项齐备、现金归属对、Assets 也闭合 —— 只有第一栏合计本身超过了投资列
// 自身的 Assets。这是「回退到无维度值」对别的 filer 的必然失真形态,前两条闸一条都拦不住。
// 权益证券 297.78 → 697.78B(多出的 400B 是经营业务资产),第一栏 1,104.73B > 976.00B×1.02。
const doubleCounted = extractHoldcoInvestments(
  extractInstanceFacts(build({ equitySecurities: 697780000000 })), "2025-12-31");
assert(doubleCounted === null, "第一栏合计超过投资列自身 Assets → 上界闸拦下,fail-closed 返回 null");
// 边界另一侧:略低于上界仍放行(不是把闸调成恒假)。
const nearBound = extractHoldcoInvestments(
  extractInstanceFacts(build({ equitySecurities: 560000000000 })), "2025-12-31");
assert(nearBound != null && nearBound.gate_upper_bound_ok,
  "第一栏 966.97B ≤ 投资列 Assets 976.00B → 上界闸放行(闸非恒假)");

console.log("⑥ 容差常量");
assert(HOLDCO_GATE_TOLERANCE === 0.02, "闸容差 2%");

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
