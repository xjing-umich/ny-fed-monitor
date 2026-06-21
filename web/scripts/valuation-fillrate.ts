/**
 * valuation-fillrate.ts — measure non-null fill rate of valuation-critical
 * columns across FY rows in company_fundamentals_periods. Determines which
 * degradation branches live data actually exercises (spec §0.5).
 * Run: cd web && npx tsx --env-file=.env.local scripts/valuation-fillrate.ts
 */
import { getDb } from "@/lib/managers/db";

const FIELDS = [
  "d_and_a", "capex", "rd_expense", "working_capital", "ppe_net",
  "operating_cash_flow", "stock_based_comp", "current_assets",
  "current_liabilities", "share_repurchases", "operating_income",
] as const;

async function main() {
  const db = getDb();
  const { data, error } = await db
    .from("company_fundamentals_periods")
    .select("ticker," + FIELDS.join(","))
    .eq("fiscal_period", "FY");
  if (error) throw error;
  const rows = data ?? [];
  const tickers = new Set(rows.map((r: any) => r.ticker));
  console.log(`FY rows: ${rows.length}  |  distinct tickers: ${tickers.size}\n`);
  console.log("field".padEnd(22), "non-null %", " populated/total");
  for (const f of FIELDS) {
    const filled = rows.filter((r: any) => r[f] != null).length;
    const pct = rows.length ? ((filled / rows.length) * 100).toFixed(1) : "0.0";
    console.log(f.padEnd(22), pct.padStart(8), `   ${filled}/${rows.length}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
