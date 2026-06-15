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
    }));
  return { ticker, company_name: companyName ?? undefined, years };
}
