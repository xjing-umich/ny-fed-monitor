/**
 * netNet.check.ts — Graham 净流动资产(NCAV)纯函数自检。
 * Run: cd web && npx tsx src/lib/valuation/netNet.check.ts
 */
import assert from "node:assert";
import { computeNetNet, isNetNetTriggered, type NetNetLamp } from "./netNet";

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

// 5) isNetNetTriggered:~50% 折让(per_share=10, price=5) → true。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 10, ncav: 1000 };
  assert.strictEqual(isNetNetTriggered(lamp, 5), true, "50% discount → triggered");
}

// 6) isNetNetTriggered:85% 折让(per_share=100, price=15) → false(超 80% 上限,数据存疑)。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 100, ncav: 10000 };
  assert.strictEqual(isNetNetTriggered(lamp, 15), false, "85% discount → not triggered (exceeds 80% cap)");
}

// 7) isNetNetTriggered:现价 ≥ 每股(per_share=10, price=12) → false。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 10, ncav: 1000 };
  assert.strictEqual(isNetNetTriggered(lamp, 12), false, "price >= per_share → not triggered");
}

// 8) isNetNetTriggered:lamp 不可评估 → false。
{
  const lamp: NetNetLamp = { assessable: false, reason: "stub" };
  assert.strictEqual(isNetNetTriggered(lamp, 5), false, "not assessable → not triggered");
}

console.log("netNet.check.ts OK");
