import assert from "node:assert";
import { leveragePremium, LEVERAGE_L0, LEVERAGE_SLOPE, LEVERAGE_PREMIUM_CAP } from "./leveragePremium";

// 1. 净现金 → 溢价 0(spec §4.1)
assert.strictEqual(leveragePremium({ netDebt: -5_000, ownerEarnings: 1_000 }).premium, 0, "净现金 → 0");
assert.strictEqual(leveragePremium({ netDebt: 0, ownerEarnings: 1_000 }).premium, 0, "零净债 → 0");

// 2. 数据缺失 → 溢价 0,不因查不到而惩罚(spec §4.2)
assert.strictEqual(leveragePremium({ netDebt: undefined, ownerEarnings: 1_000 }).premium, 0, "缺 netDebt → 0");
assert.strictEqual(leveragePremium({ netDebt: 5_000, ownerEarnings: undefined }).premium, 0, "缺 OE → 0");
assert.strictEqual(leveragePremium({ netDebt: 5_000, ownerEarnings: 0 }).premium, 0, "OE=0 → 0");
assert.strictEqual(leveragePremium({ netDebt: 5_000, ownerEarnings: -100 }).premium, 0, "OE 为负 → 0(灯本就不可评估)");
assert.strictEqual(leveragePremium({ netDebt: NaN, ownerEarnings: 1_000 }).premium, 0, "NaN → 0");

// 3. L ≤ L0 → 溢价 0(投资级近似,不加价)
assert.strictEqual(leveragePremium({ netDebt: LEVERAGE_L0 * 1_000, ownerEarnings: 1_000 }).premium, 0, "L=L0 → 0");
assert.strictEqual(leveragePremium({ netDebt: (LEVERAGE_L0 - 1) * 1_000, ownerEarnings: 1_000 }).premium, 0, "L<L0 → 0");

// 4. 单调:L↑ → 溢价不减(spec §4.6)
let prev = -1;
for (let L = 0; L <= 20; L += 0.25) {
  const p = leveragePremium({ netDebt: L * 1_000, ownerEarnings: 1_000 }).premium;
  assert.ok(p >= prev, `单调性破于 L=${L}(${p} < ${prev})`);
  assert.ok(p >= 0, `溢价恒非负,破于 L=${L}`);
  assert.ok(p <= LEVERAGE_PREMIUM_CAP, `溢价超上限于 L=${L}`);
  prev = p;
}

// 5. 上限封顶(spec §4.3)
assert.strictEqual(leveragePremium({ netDebt: 1e9, ownerEarnings: 1_000 }).premium, LEVERAGE_PREMIUM_CAP, "极端 L → 封顶");

// 6. 无悬崖:L0 两侧微小变化不产生跳变(spec §4.7,对比今天 netDebt/equity=1.0 的悬崖)
const justBelow = leveragePremium({ netDebt: (LEVERAGE_L0 - 0.01) * 1_000, ownerEarnings: 1_000 }).premium;
const justAbove = leveragePremium({ netDebt: (LEVERAGE_L0 + 0.01) * 1_000, ownerEarnings: 1_000 }).premium;
assert.ok(Math.abs(justAbove - justBelow) < 0.001, `L0 处有悬崖:${justBelow} → ${justAbove}`);

// 7. L 值透出(披露用)
assert.strictEqual(leveragePremium({ netDebt: 6_000, ownerEarnings: 1_000 }).leverage, 6, "L 透出");

// 8. 斜率符合声明(L0 之上每多 1 年偿债久期)
// ⚠️ 锚在 L0+1 / L0+2 而非写死的 L=5/6:Task 8 校准会改 L0,写死的点可能双双落进
// 不加价区(溢价都是 0 → 差值 0 ≠ SLOPE → 伪失败)。用 L0 相对定位对任何 L0 都成立。
const rampA = leveragePremium({ netDebt: (LEVERAGE_L0 + 1) * 1_000, ownerEarnings: 1_000 }).premium;
const rampB = leveragePremium({ netDebt: (LEVERAGE_L0 + 2) * 1_000, ownerEarnings: 1_000 }).premium;
if (rampB < LEVERAGE_PREMIUM_CAP) {
  assert.ok(Math.abs((rampB - rampA) - LEVERAGE_SLOPE) < 1e-9, `斜率不符:${rampB - rampA} ≠ ${LEVERAGE_SLOPE}`);
}

console.log("leveragePremium.check.ts: all assertions passed.");
