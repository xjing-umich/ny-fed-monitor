/**
 * splitCoverage.check.ts — 拆股口径陈旧谓词自检。
 * Run: cd web && npx tsx src/lib/valuation/splitCoverage.check.ts
 */
import assert from "node:assert";
import { isSplitCoverageStale } from "./splitCoverage";

// 拆股晚于基本面 as-of → 陈旧(每股口径与拆股后价格错配)。
assert.strictEqual(isSplitCoverageStale({ fundamentalsAsOf: "2025-06-30", latestSplitDate: "2026-06-12" }), true);
// 拆股早于/等于基本面 as-of(拆股后财报已落地)→ 不陈旧。
assert.strictEqual(isSplitCoverageStale({ fundamentalsAsOf: "2026-06-30", latestSplitDate: "2026-06-12" }), false);
assert.strictEqual(isSplitCoverageStale({ fundamentalsAsOf: "2026-06-12", latestSplitDate: "2026-06-12" }), false);
// 任一缺失 → 不陈旧(降级为今日行为,不误伤)。
assert.strictEqual(isSplitCoverageStale({ fundamentalsAsOf: "2025-06-30", latestSplitDate: null }), false);
assert.strictEqual(isSplitCoverageStale({ fundamentalsAsOf: null, latestSplitDate: "2026-06-12" }), false);

console.log("splitCoverage.check.ts ✓");
