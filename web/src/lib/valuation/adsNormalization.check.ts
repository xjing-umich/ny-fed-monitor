import assert from "node:assert";
import { resolveAds } from "./adsNormalization";

// 1) ADR 有比例 → 用该比例,不抑制
assert.deepStrictEqual(resolveAds("ADR", 4), { suppressed: false, ratio: 4 });

// 2) ADR 比例为 NULL → 抑制(不显示未归一化错带)
assert.deepStrictEqual(resolveAds("ADR", null), { suppressed: true, ratio: 1 });

// 3) 非 ADR(普通股/NY Reg Shrs) → 恒 1:1,永不抑制,即便 ads_ratio 碰巧有值也忽略
assert.deepStrictEqual(resolveAds("Common Stock", null), { suppressed: false, ratio: 1 });
assert.deepStrictEqual(resolveAds("NY Reg Shrs", null), { suppressed: false, ratio: 1 });

// 4) 1:1 的 ADR(WB/NICE/VALE…策展写了 1)→ 用 1,不抑制
assert.deepStrictEqual(resolveAds("ADR", 1), { suppressed: false, ratio: 1 });

// 5) 分数比例(FMS=0.5)→ 原样返回
assert.deepStrictEqual(resolveAds("ADR", 0.5), { suppressed: false, ratio: 0.5 });

// 6) security_type 未知(null/undefined)→ 当非 ADR,1:1
assert.deepStrictEqual(resolveAds(null, null), { suppressed: false, ratio: 1 });
assert.deepStrictEqual(resolveAds(undefined, undefined), { suppressed: false, ratio: 1 });

// 7) 脏比例(<=0 / 非有限)当未策展 → 若是 ADR 则抑制
assert.deepStrictEqual(resolveAds("ADR", 0), { suppressed: true, ratio: 1 });
assert.deepStrictEqual(resolveAds("ADR", Number.NaN), { suppressed: true, ratio: 1 });

console.log("adsNormalization.check.ts ✓");
