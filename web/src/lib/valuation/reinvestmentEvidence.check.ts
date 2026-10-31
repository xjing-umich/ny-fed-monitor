import assert from "node:assert/strict";
import { sustainableGrowth } from "./moatCap";
import { assessReinvestmentEvidence } from "./reinvestmentEvidence";
import type { ValuationFloorYear } from "./types";

// These cases distinguish missing source data from invalid economics and period alignment.
const years: ValuationFloorYear[] = [2022, 2023, 2024, 2025].map((fiscal_year, i) => ({
  fiscal_year, period_end: `${fiscal_year}-12-31`,
  operating_income: 100, shareholders_equity: 500,
  capex: 30, d_and_a: 10, operating_working_capital: 20 + i * 10,
}));
const callbacks = {
  nopatOf: (y: ValuationFloorYear) => y.operating_income,
  investedCapitalOf: (y: ValuationFloorYear) => y.shareholders_equity,
};
const assess = (fyYears: ValuationFloorYear[]) => assessReinvestmentEvidence({ fyYears, ...callbacks });
const available = assess(years);
assert.equal(available.status, "available");
assert.ok(Math.abs(available.growth! - 0.06) < 1e-12, "20% ROIC times 30% operating reinvestment gives 6% growth");
assert.equal(available.growth, sustainableGrowth({ fyYears: years, ...callbacks }));
assert.deepEqual(available.years, [2023, 2024, 2025]);
assert.equal(assess(years.slice(1)).status, "insufficient_history", "three balance observations provide only two annual changes");
assert.equal(assess(years.map(y => ({ ...y, period_end: undefined }))).status, "available", "legacy undated fixtures use consecutive fiscal years");
assert.equal(assess(years.map(y => ({ ...y, capex: 0 }))).status, "available", "reported zero capex is evidence");
assert.equal(assess(years.map(y => ({ ...y, capex: null as unknown as number }))).status, "missing_fields", "null capex must not become reported zero");
const missing = assess(years.map((y, i) => i === 2 ? { ...y, capex: undefined } : y));
assert.equal(missing.status, "missing_fields");
assert.deepEqual(missing.missing_fields, [{ fiscal_year: 2024, period_end: "2024-12-31", fields: ["capex"] }]);
const missingCapital = assess(years.map((y, i) => i === 2 ? { ...y, shareholders_equity: undefined } : y));
assert.equal(missingCapital.status, "missing_fields");
assert.deepEqual(missingCapital.missing_fields?.[0].fields, ["invested_capital"]);
assert.equal(assess(years.map((y, i) => i === 2 ? { ...y, shareholders_equity: -5 } : y)).status, "nonpositive_capital");
assert.equal(assessReinvestmentEvidence({
  fyYears: years.map((y, i) => i === 2 ? { ...y, shareholders_equity: -5 } : y),
  ...callbacks,
  investedCapitalOf: y => y.shareholders_equity != null && y.shareholders_equity > 0 ? y.shareholders_equity : undefined,
}).status, "nonpositive_capital", "production callback rejects nonpositive equity before calculating capital");
assert.equal(assess(years.map((y, i) => i === 2 ? { ...y, operating_income: 0 } : y)).status, "nonpositive_nopat");
assert.equal(assess(years.map((y, i) => i === 2 ? { ...y, shareholders_equity: 10 } : y)).status, "implausible_roic");
for (const period_end of ["2026-03-31", "2026-06-30", "2026-09-30"]) {
  const ttm = assess([...years.slice(0, -1), { ...years.at(-1)!, fiscal_year: 2026, period_end }]);
  assert.equal(ttm.status, "unaligned_periods", "TTM head does not make a 15–21 month balance change annual");
  assert.equal(ttm.unaligned_periods?.[0].current_period_end, period_end);
}
assert.equal(assess(years.map((y, i) => i === 2 ? { ...y, capex: Number.NaN } : y)).status, "missing_fields");
assert.equal(assess(years.filter(y => y.fiscal_year !== 2023)).status, "unaligned_periods", "gapped annual observations cannot supply an annual delta");
assert.equal(assess([...years].reverse()).growth, available.growth, "input order is immaterial and not mutated");
console.log("reinvestment evidence diagnostics checks passed");
