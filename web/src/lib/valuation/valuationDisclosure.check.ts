import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { computeValuationFloor } from "./epvFloor";
import { deriveOeDcf } from "./ownerEarningsDcf";
import { EarningsPowerFloorCard } from "../../components/valuation/EarningsPowerFloorCard";
const years = [2025, 2024, 2023, 2022, 2021].map((fiscal_year, i) => ({
  fiscal_year,
  revenue: 1000 * 1.2 ** (4 - i),
  operating_income: 200 * 1.2 ** (4 - i),
  net_income: 100 * 1.2 ** (4 - i),
  shares_diluted: 100,
  shareholders_equity: 1000,
  cash: 100,
  total_debt: 0,
  rd_expense: 20,
}));
const floor = computeValuationFloor({ ticker: "ANY", years });
assert.ok(floor?.kind === "floor");
assert.ok(
  floor.structural_confidence! > 0,
  "fixture exercises a weighted earnings uplift",
);
assert.ok(
  floor.buffett_epv.method.simplifications.some((s) =>
    /weighted|blend/i.test(s),
  ),
  "weighted normalisation must be disclosed instead of described as a simple average",
);
const oe = deriveOeDcf(floor, years, { value: 4.99, date: "2026-10-27" }, null);
for (const lang of ["en", "zh"] as const) {
  const html = renderToStaticMarkup(
    createElement(EarningsPowerFloorCard, { floor, oeDcf: oe, lang }),
  );
  assert.ok(
    !html.includes("A conservative intrinsic-value range") &&
      !html.includes("保守内在价值区间"),
    "the model does not promise all assumptions are conservative",
  );
  assert.ok(/5 years|5 年/.test(html), "disclose initial growth period");
  assert.ok(
    /terminal growth|终值增长/.test(html),
    "disclose terminal assumption",
  );
  const missing = {
    ...oe,
    growth_g1: 0,
    growth_coverage_gap: "missing_interim" as const,
    growth_g1_limited_by: "coverage" as const,
  };
  const gapHtml = renderToStaticMarkup(
    createElement(EarningsPowerFloorCard, { floor, oeDcf: missing, lang }),
  );
  assert.ok(
    /Growth evidence|增长证据/.test(gapHtml),
    "missing data is explicit in both languages",
  );
}
console.log("valuation disclosure rendering checks passed");
