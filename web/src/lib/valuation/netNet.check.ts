/**
 * netNet.check.ts — Graham 净流动资产(NCAV)纯函数自检。
 * Run: cd web && npx tsx src/lib/valuation/netNet.check.ts
 */
import assert from "node:assert";
import { computeNetNet, isNetNetAssetFloor, isNetNetBuy, GRAHAM_NCAV_BUY_FRACTION, type NetNetLamp } from "./netNet";

const approx = (a: number, b: number, tol = 1e-6, msg = "") =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} (got ${a}, want ${b})`);

// 1) 正常:NCAV=(1000−400)/100=6/股。
const ok = computeNetNet({ currentAssets: 1000, totalLiabilities: 400, sharesDiluted: 100 });
assert.ok(ok.assessable, "normal case assessable");
if (ok.assessable) { approx(ok.ncav, 600, 1e-6, "ncav"); approx(ok.per_share, 6, 1e-6, "per_share"); }

// 2) 缺字段(金融股无 current_assets)→ 不可评估。
assert.ok(!computeNetNet({ totalLiabilities: 400, sharesDiluted: 100 }).assessable, "missing currentAssets → not assessable");

// 3) 负 NCAV(负债>流动资产)→ 不可评估。
assert.ok(!computeNetNet({ currentAssets: 300, totalLiabilities: 400, sharesDiluted: 100 }).assessable, "negative NCAV → not assessable");

// 4) 股数非正 → 不可评估。
assert.ok(!computeNetNet({ currentAssets: 1000, totalLiabilities: 400, sharesDiluted: 0 }).assessable, "shares<=0 → not assessable");

// 4b) 优先股：NCAV=(1000−400−100)/100=5/股（对照无优先股的 6）。
{
  const withPref = computeNetNet({ currentAssets: 1000, totalLiabilities: 400, sharesDiluted: 100, preferredStock: 100 });
  assert.ok(withPref.assessable, "with preferred assessable");
  if (withPref.assessable) { approx(withPref.ncav, 500, 1e-6, "ncav minus preferred"); approx(withPref.per_share, 5, 1e-6, "per_share minus preferred"); }
  // 缺省 preferredStock（undefined）→ 与旧口径恒等（?? 0 降级）。
  const noPref = computeNetNet({ currentAssets: 1000, totalLiabilities: 400, sharesDiluted: 100 });
  if (noPref.assessable) approx(noPref.per_share, 6, 1e-6, "no preferred → unchanged");
  // preferredStock=0 显式传 → 同缺省。
  const zeroPref = computeNetNet({ currentAssets: 1000, totalLiabilities: 400, sharesDiluted: 100, preferredStock: 0 });
  if (zeroPref.assessable) approx(zeroPref.per_share, 6, 1e-6, "preferred 0 → unchanged");
}

// 5) assetFloor:~50% 折让(per_share=10, price=5) → true；buy 也 true(5 ≤ ⅔×10=6.67)。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 10, ncav: 1000 };
  assert.strictEqual(isNetNetAssetFloor(lamp, 5), true, "50% discount → asset floor");
  assert.strictEqual(isNetNetBuy(lamp, 5), true, "5 ≤ ⅔×10 → buy line");
}
// 6) 折让区间在 (⅔, 1) 之间：per_share=10, price=8 → assetFloor true(8<10) 但 buy false(8 > 6.67)。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 10, ncav: 1000 };
  assert.strictEqual(isNetNetAssetFloor(lamp, 8), true, "8 < 10 → asset floor");
  assert.strictEqual(isNetNetBuy(lamp, 8), false, "8 > ⅔×10 → not buy");
}
// 7) 85% 折让(per_share=100, price=15) → 两者 false(超 80% 上限,数据存疑)。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 100, ncav: 10000 };
  assert.strictEqual(isNetNetAssetFloor(lamp, 15), false, "85% discount → no asset floor (>80% cap)");
  assert.strictEqual(isNetNetBuy(lamp, 15), false, "85% discount → no buy (>80% cap)");
}
// 8) 现价 ≥ 每股(per_share=10, price=12) → 两者 false。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 10, ncav: 1000 };
  assert.strictEqual(isNetNetAssetFloor(lamp, 12), false, "price ≥ per_share → no asset floor");
  assert.strictEqual(isNetNetBuy(lamp, 12), false, "price ≥ per_share → no buy");
}
// 9) lamp 不可评估 → 两者 false。
{
  const lamp: NetNetLamp = { assessable: false, reason: "stub" };
  assert.strictEqual(isNetNetAssetFloor(lamp, 5), false, "not assessable → no asset floor");
  assert.strictEqual(isNetNetBuy(lamp, 5), false, "not assessable → no buy");
}
// 10) 常量:⅔。
assert.ok(Math.abs(GRAHAM_NCAV_BUY_FRACTION - 2 / 3) < 1e-9, "buy fraction = 2/3");

console.log("netNet.check.ts OK");
