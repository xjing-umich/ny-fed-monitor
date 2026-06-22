import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
import type { ValuationFloorInput, ValuationFloorYear } from "./types";

const u = (v: number | null | undefined): number | undefined => (v == null ? undefined : v);

/** Map stored FundamentalPeriod rows (FY only) to the engine's input contract, most-recent-first. */
export function fundamentalsToFloorInput(
  ticker: string,
  companyName: string | null | undefined,
  rows: FundamentalPeriod[] | undefined,
): ValuationFloorInput {
  const years: ValuationFloorYear[] = (rows ?? [])
    .filter((r) => r.fiscal_period === "FY" && r.fiscal_year != null)
    .sort((a, b) => (b.period_end ?? "").localeCompare(a.period_end ?? ""))
    .map((r) => ({
      fiscal_year: r.fiscal_year as number,
      revenue: u(r.revenue),
      operating_income: u(r.operating_income),
      operating_margin: u(r.operating_margin),
      net_income: u(r.net_income),
      pretax_income: u(r.pretax_income),
      income_tax_expense: u(r.income_tax_expense),
      effective_tax_rate: u(r.effective_tax_rate),
      shareholders_equity: u(r.shareholders_equity),
      goodwill: u(r.goodwill),
      intangibles: u(r.intangibles),
      cash: u(r.cash_and_equivalents),
      total_debt: u(r.total_debt),
      net_debt: u(r.net_debt),
      shares_diluted: u(r.shares_diluted),
      d_and_a: u(r.d_and_a),
      // capex is stored NEGATIVE (XBRL cash-outflow); the engine wants a positive outflow magnitude.
      capex: r.capex == null ? undefined : Math.abs(r.capex),
      rd_expense: u(r.rd_expense),
      sga_expense: u(r.sga_expense),
      stock_based_comp: u(r.stock_based_comp),
      working_capital: u(r.working_capital),
      ppe_net: u(r.ppe_net),
      operating_cash_flow: u(r.operating_cash_flow),
      share_repurchases: u(r.share_repurchases),
      current_assets: u(r.current_assets),
      current_liabilities: u(r.current_liabilities),
    }));
  return { ticker, company_name: companyName ?? undefined, years };
}
