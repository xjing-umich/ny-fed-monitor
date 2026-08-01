/**
 * fundamentalsToFloorInput.check.ts — self-check for the stored-fundamentals mapper.
 * Run: cd web && npx tsx src/lib/valuation/fundamentalsToFloorInput.check.ts
 */
import assert from "node:assert";
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
import { fundamentalsToFloorInput } from "./fundamentalsToFloorInput";
import { computeValuationFloor } from "./epvFloor";

function fy(year: number, periodEnd: string, fiscalPeriod: string, o: Partial<FundamentalPeriod>): FundamentalPeriod {
  return {
    ticker: "ZZ", cik: "1", form: "10-K", fiscal_year: year, fiscal_period: fiscalPeriod, period_end: periodEnd,
    filing_date: null, accession_number: null, revenue: null, gross_profit: null, operating_income: null,
    net_income: null, eps_diluted: null, shares_diluted: null, operating_cash_flow: null, capex: null,
    free_cash_flow: null, d_and_a: null, stock_based_comp: null, rd_expense: null, sga_expense: null,
    interest_expense: null, pretax_income: null, income_tax_expense: null, dividends_paid: null,
    share_repurchases: null, investment_fv_gain_loss: null, cash_and_equivalents: null, short_term_investments: null, current_assets: null,
    current_liabilities: null, total_assets: null, total_liabilities: null, total_debt: null, ppe_net: null,
    goodwill: null, intangibles: null, shareholders_equity: null, minority_interest: null, preferred_equity: null,
    shares_outstanding: null, ebitda: null, working_capital: null, effective_tax_rate: null, revenue_yoy: null,
    net_income_yoy: null, fcf_yoy: null, gross_margin: null, operating_margin: null, net_margin: null, fcf_margin: null,
    roe: null, debt_to_equity: null, net_debt: null, is_derived: false, data_quality: "low", missing_fields: {}, raw_facts: {},
    ...o,
  };
}

// Mixed FY/quarterly rows, unsorted; only FY rows mapped, most-recent-first.
const rows: FundamentalPeriod[] = [
  fy(2024, "2024-12-31", "FY", { revenue: 9_000, operating_margin: 0.44, net_income: 2_700, effective_tax_rate: 0.15, shareholders_equity: 4_500, goodwill: 500, intangibles: 300, cash_and_equivalents: 1_800, total_debt: 1_000, net_debt: -800, shares_diluted: 1_000 }),
  fy(2025, "2025-03-31", "Q1", { revenue: 2_500 }), // non-FY → dropped
  fy(2025, "2025-12-31", "FY", { revenue: 10_000, operating_margin: 0.45, net_income: 3_000, effective_tax_rate: 0.15, shareholders_equity: 5_000, goodwill: 500, intangibles: 300, cash_and_equivalents: 2_000, total_debt: 1_000, net_debt: -1_000, shares_diluted: 1_000, d_and_a: 1_200, capex: -900, rd_expense: 700, working_capital: 1_500, ppe_net: 4_000, operating_cash_flow: 3_500, stock_based_comp: 300 }),
  fy(2023, "2023-12-31", "FY", { revenue: 8_000, operating_margin: 0.42, net_income: 2_400, effective_tax_rate: 0.15, shareholders_equity: 4_000, goodwill: 500, intangibles: 300, cash_and_equivalents: 1_600, total_debt: 1_000, net_debt: -600, shares_diluted: 1_000 }),
];

const input = fundamentalsToFloorInput("ZZ", "Zed Co", rows);
assert.strictEqual(input.years.length, 3, "only 3 FY rows mapped (Q1 dropped)");
assert.strictEqual(input.years[0].fiscal_year, 2025, "most-recent-first");
assert.strictEqual(input.years[0].cash, 2_000, "cash_and_equivalents → cash");
assert.strictEqual(input.ticker, "ZZ");
assert.strictEqual(input.company_name, "Zed Co");

// New v2 rich fields map through (spec §0.5 / Task 1).
assert.strictEqual(input.years[0].d_and_a, 1_200, "d_and_a maps");
assert.strictEqual(input.years[0].capex, 900, "capex maps as POSITIVE magnitude (stored negative)");
assert.strictEqual(input.years[0].rd_expense, 700, "rd_expense maps");
assert.strictEqual(input.years[0].working_capital, 1_500, "working_capital maps");
assert.strictEqual(input.years[0].ppe_net, 4_000, "ppe_net maps");
assert.strictEqual(input.years[0].operating_cash_flow, 3_500, "operating_cash_flow maps");
assert.strictEqual(input.years[0].stock_based_comp, 300, "stock_based_comp maps");

// End-to-end: mapped input drives the engine
const floor = computeValuationFloor(input);
assert.ok(floor && "kind" in floor && floor.kind === "floor", "mapped input produces a floor");
assert.strictEqual(floor.provenance.years_used[0], 2025, "engine sees 2025 latest");

// Empty / undefined-safe
assert.strictEqual(fundamentalsToFloorInput("X", undefined, []).years.length, 0, "empty rows → empty years");
assert.strictEqual(fundamentalsToFloorInput("X", undefined, undefined).years.length, 0, "undefined rows → empty years");

// ADR 归一化:adsRatio=4 → shares_diluted 减为 1/4(每股口径 ×4,对齐每 ADS 价)
{
  const rows = [{
    fiscal_period: "FY", fiscal_year: 2025, period_end: "2025-12-31",
    shares_diluted: 5_929_576_000, net_income: 13_991_297_000,
  }] as unknown as Parameters<typeof fundamentalsToFloorInput>[2];

  const base = fundamentalsToFloorInput("PDD", "PDD", rows);
  assert.strictEqual(base.years[0].shares_diluted, 5_929_576_000, "缺省 adsRatio=1 → shares 不变");

  const norm = fundamentalsToFloorInput("PDD", "PDD", rows, 4);
  assert.strictEqual(norm.years[0].shares_diluted, 5_929_576_000 / 4, "adsRatio=4 → shares 减为 1/4");

  const one = fundamentalsToFloorInput("PDD", "PDD", rows, 1);
  assert.strictEqual(one.years[0].shares_diluted, 5_929_576_000, "adsRatio=1 → 恒等");
}

// gross_profit 透传(件② 口径护栏需要)。
{
  const inp = fundamentalsToFloorInput("X", "X", [
    { fiscal_period: "FY", fiscal_year: 2024, period_end: "2024-12-31", revenue: 1000, gross_profit: 400 } as never,
  ], 1);
  assert.strictEqual(inp.years[0].gross_profit, 400, "gross_profit 透传");
}

console.log("fundamentalsToFloorInput.check.ts: OK");
