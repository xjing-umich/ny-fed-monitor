/**
 * fundamentalsIntegrity.check.ts — 口径完整性谓词自检。
 * Run: cd web && npx tsx src/lib/valuation/fundamentalsIntegrity.check.ts
 */
import assert from "node:assert";
import type { ValuationFloorYear } from "./types";
import { fundamentalsIntegrityViolated } from "./fundamentalsIntegrity";

const y = (o: Partial<ValuationFloorYear>): ValuationFloorYear => ({ fiscal_year: 2024, ...o }) as ValuationFloorYear;

// opInc>revenue(物理不可能)→ 违反。
assert.strictEqual(fundamentalsIntegrityViolated([y({ revenue: 128, operating_income: 140 })]), true);
// gross>revenue → 违反。
assert.strictEqual(fundamentalsIntegrityViolated([y({ revenue: 128, gross_profit: 263 })]), true);
// 任一坏年即违反(MGRC:老年份坏,新年份好)。
assert.strictEqual(
  fundamentalsIntegrityViolated([
    y({ fiscal_year: 2022, revenue: 155, operating_income: 165 }),
    y({ fiscal_year: 2023, revenue: 831, operating_income: 189 }),
  ]),
  true,
);
// 干净数据 → 不违反。
assert.strictEqual(fundamentalsIntegrityViolated([y({ revenue: 1000, operating_income: 250, gross_profit: 400 })]), false);
// 缺 revenue / revenue<=0 → 该年不判(不误伤)。
assert.strictEqual(fundamentalsIntegrityViolated([y({ operating_income: 100 })]), false);
assert.strictEqual(fundamentalsIntegrityViolated([y({ revenue: 0, operating_income: 100 })]), false);
// opInc/gross 缺失 → 不判。
assert.strictEqual(fundamentalsIntegrityViolated([y({ revenue: 1000 })]), false);
// 空数组 → 不违反。
assert.strictEqual(fundamentalsIntegrityViolated([]), false);

console.log("fundamentalsIntegrity.check.ts ✓");
