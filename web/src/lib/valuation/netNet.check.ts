/**
 * netNet.check.ts — Graham 净流动资产(NCAV)纯函数自检。
 * Run: cd web && npx tsx src/lib/valuation/netNet.check.ts
 */
import assert from "node:assert";
import { computeNetNet } from "./netNet";

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

console.log("netNet.check.ts OK");
